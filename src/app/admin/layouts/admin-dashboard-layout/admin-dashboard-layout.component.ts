import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../../../shared/components/sidebar/sidebar.component';
import { AuthService } from '../../../auth/auth.service';
import { OrderService } from '../../../order/services/order.service';
import { SeoService } from '../../../shared/services/seo.service';
import { catchError, filter, interval, map, of, startWith, Subscription } from 'rxjs';

type PendingAssignment = {
  orderId: number;
  orderCode: string;
  title: string;
  detail: string;
  units: number;
  acceptanceStatus: 'PENDING' | 'ACCEPTED';
  createdAt: string | null;
};

@Component({
  selector: 'app-admin-dashboard-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent],
  templateUrl: './admin-dashboard-layout.component.html',
  styleUrls: ['./admin-dashboard-layout.component.css']
})
export class AdminDashboardLayoutComponent implements OnInit, OnDestroy {
  currentTheme: 'dark' | 'light' = 'dark';
  notificationsOpen = false;

  private readonly notificationsPollTick = toSignal(interval(45000).pipe(startWith(0)), {
    initialValue: 0,
  });

  private readonly pendingAssignmentsResource = rxResource<
    PendingAssignment[],
    { userId: number; tick: number } | undefined
  >({
    params: () => {
      const userId = Number(this.currentUser?.id || 0);
      if (!Number.isInteger(userId) || userId < 1) {
        return undefined;
      }

      return {
        userId,
        tick: this.notificationsPollTick(),
      };
    },
    stream: ({ params }) => {
      if (!params) {
        return of([] as PendingAssignment[]);
      }

      return this.orderService
        .listOrders({
          page: 1,
          limit: 50,
          status: 'RETURN_PENDING',
          responsibleUserId: params.userId,
        })
        .pipe(
          map((response: any) => this.mapPendingAssignments(response, params.userId)),
          catchError(() => of([] as PendingAssignment[])),
        );
    },
    defaultValue: [],
  });

  private tableEnhancerObserver?: MutationObserver;
  private routerEventsSub?: Subscription;

  constructor(
    private authService: AuthService,
    private router: Router,
    private orderService: OrderService,
    private seoService: SeoService,
  ) { }

  ngOnInit() {
    this.seoService.setNoIndexPage({
      title: 'Panel de administracion',
      description: 'Seccion privada para administracion de operaciones.',
      path: '/admin',
      type: 'website',
    });
    this.seoService.clearJsonLd();

    const savedTheme = localStorage.getItem('theme');
    this.currentTheme = savedTheme === 'light' ? 'light' : 'dark';
    this.applyTheme();
    this.setupMobileTableEnhancer();
    this.setupNotificationsPolling();
  }

  ngOnDestroy() {
    this.tableEnhancerObserver?.disconnect();
    this.routerEventsSub?.unsubscribe();
  }

  logout() {
    this.authService.logout();
  }

  get currentUser() {
    return this.authService.currentUser();
  }

  get isAdmin() {
    return this.authService.isAdmin();
  }

  get pendingAssignmentsCount() {
    return this.pendingAssignments.length;
  }

  get pendingAssignments(): PendingAssignment[] {
    return this.pendingAssignmentsResource.value();
  }

  get loadingNotifications(): boolean {
    const userId = Number(this.currentUser?.id || 0);
    if (!Number.isInteger(userId) || userId < 1) {
      return false;
    }

    return this.pendingAssignmentsResource.isLoading();
  }

  toggleTheme() {
    this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', this.currentTheme);
    this.applyTheme();
  }

  toggleNotifications() {
    this.notificationsOpen = !this.notificationsOpen;
  }

  closeNotifications() {
    this.notificationsOpen = false;
  }

  openAssignment(orderId: number) {
    this.notificationsOpen = false;
    this.router.navigate(['/admin/orders', orderId]);
  }

  @HostListener('document:keydown.escape')
  onEscapePressed() {
    this.notificationsOpen = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.notificationsOpen) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (!target?.closest('.admin-notifications')) {
      this.notificationsOpen = false;
    }
  }

  private applyTheme() {
    document.documentElement.setAttribute('data-theme', this.currentTheme);
  }

  private setupNotificationsPolling() {
    this.pendingAssignmentsResource.value();
  }

  private mapPendingAssignments(response: any, userId: number): PendingAssignment[] {
    const rawOrders = Array.isArray(response?.data) ? response.data : [];
    return rawOrders
      .filter((order: any) => Number(order?.returnWorkflow?.responsible?.id || 0) === userId)
      .map((order: any) => {
        const acceptance = String(order?.returnWorkflow?.acceptanceStatus || '').toUpperCase() === 'ACCEPTED'
          ? 'ACCEPTED'
          : 'PENDING';
        const units = this.getPendingReturnUnits(order);
        const client = String(order?.clientName || order?.clientEmail || 'Cliente').trim();

        return {
          orderId: Number(order?.id || 0),
          orderCode: String(order?.code || 'SIN-CODIGO'),
          title: acceptance === 'PENDING'
            ? 'Devolucion delegada pendiente de aceptar'
            : 'Devolucion pendiente de cerrar',
          detail: `${client} - ${units} und. por devolver`,
          units,
          acceptanceStatus: acceptance as 'PENDING' | 'ACCEPTED',
          createdAt: order?.returnWorkflow?.requestedAt || order?.updatedAt || null,
        };
      })
      .filter((assignment: PendingAssignment) => assignment.orderId > 0)
      .sort((a: PendingAssignment, b: PendingAssignment) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
  }

  private getPendingReturnUnits(order: any): number {
    const items = Array.isArray(order?.items) ? order.items : [];
    const totalPicked = items.reduce((sum: number, item: any) => {
      const picked = Number(item?.pickedQuantity ?? item?.picked ?? 0);
      return sum + Math.max(0, picked);
    }, 0);

    if (totalPicked > 0) {
      return totalPicked;
    }

    const totalReserved = items.reduce((sum: number, item: any) => {
      const reserved = Number(item?.reservedQuantity ?? item?.reserved ?? 0);
      return sum + Math.max(0, reserved);
    }, 0);

    if (totalReserved > 0) {
      return totalReserved;
    }

    const reservations = Array.isArray(order?.reservations) ? order.reservations : [];
    return reservations
      .filter((reservation: any) => String(reservation?.status || '').toUpperCase() === 'ACTIVE')
      .reduce((sum: number, reservation: any) => sum + Number(reservation?.quantity || 0), 0);
  }

  private setupMobileTableEnhancer() {
    const enhanceTables = () => this.decorateTablesForMobileCards();

    this.routerEventsSub = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        this.closeMobileSidebarAfterNavigation();
        setTimeout(enhanceTables, 0);
      });

    const root = document.querySelector('.drawer-content') ?? document.body;
    this.tableEnhancerObserver = new MutationObserver(() => {
      enhanceTables();
    });
    this.tableEnhancerObserver.observe(root, {
      childList: true,
      subtree: true,
    });

    enhanceTables();
  }

  private closeMobileSidebarAfterNavigation() {
    if (typeof window === 'undefined' || window.matchMedia('(min-width: 1024px)').matches) {
      return;
    }

    const drawerToggle = document.getElementById('my-drawer-4');
    if (drawerToggle instanceof HTMLInputElement) {
      drawerToggle.checked = false;
    }
  }

  private decorateTablesForMobileCards() {
    const tables = Array.from(document.querySelectorAll('table'));

    for (const table of tables) {
      if (table.closest('app-pos') || table.closest('.print-content')) {
        continue;
      }

      table.classList.add('mobile-card-table');

      const headerCells = Array.from(table.querySelectorAll('thead th'));
      if (!headerCells.length) {
        continue;
      }

      const headerLabels = headerCells.map((headerCell, index) => {
        const normalized = headerCell.textContent?.replace(/\s+/g, ' ').trim() || '';
        if (normalized) {
          return normalized;
        }
        if (index === 0) {
          return '#';
        }
        return `Columna ${index + 1}`;
      });

      const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
      for (const bodyRow of bodyRows) {
        const cells = Array.from(bodyRow.querySelectorAll('td, th'));
        cells.forEach((cell, index) => {
          const label = headerLabels[index] || `Columna ${index + 1}`;
          if (cell.getAttribute('data-label') !== label) {
            cell.setAttribute('data-label', label);
          }
        });
      }
    }
  }
}
