import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../../../shared/components/sidebar/sidebar.component';
import { AuthService } from '../../../auth/auth.service';
import { OrderService } from '../../../order/services/order.service';
import { Subscription, filter, interval } from 'rxjs';

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
  loadingNotifications = false;
  pendingAssignments: Array<{
    orderId: number;
    orderCode: string;
    title: string;
    detail: string;
    units: number;
    acceptanceStatus: 'PENDING' | 'ACCEPTED';
    createdAt: string | null;
  }> = [];
  private tableEnhancerObserver?: MutationObserver;
  private routerEventsSub?: Subscription;
  private notificationPollingSub?: Subscription;

  constructor(
    private authService: AuthService,
    private router: Router,
    private orderService: OrderService,
  ) { }

  ngOnInit() {
    const savedTheme = localStorage.getItem('theme');
    this.currentTheme = savedTheme === 'light' ? 'light' : 'dark';
    this.applyTheme();
    this.setupMobileTableEnhancer();
    this.setupNotificationsPolling();
  }

  ngOnDestroy() {
    this.tableEnhancerObserver?.disconnect();
    this.routerEventsSub?.unsubscribe();
    this.notificationPollingSub?.unsubscribe();
  }

  logout() {
    this.authService.logout();
  }

  get currentUser() {
    return this.authService.getCurrentUser();
  }

  get isAdmin() {
    return this.authService.isAdmin();
  }

  get pendingAssignmentsCount() {
    return this.pendingAssignments.length;
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
    this.loadPendingAssignments();
    this.notificationPollingSub = interval(45000).subscribe(() => {
      this.loadPendingAssignments();
    });
  }

  private loadPendingAssignments() {
    const userId = Number(this.currentUser?.id || 0);
    if (!Number.isInteger(userId) || userId < 1) {
      this.pendingAssignments = [];
      this.loadingNotifications = false;
      return;
    }

    this.loadingNotifications = true;
    this.orderService.listOrders({
      page: 1,
      limit: 50,
      status: 'RETURN_PENDING',
      responsibleUserId: userId,
    }).subscribe({
      next: (response: any) => {
        const rawOrders = Array.isArray(response?.data) ? response.data : [];
        const assignments = rawOrders
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
              detail: `${client} · ${units} und. por devolver`,
              units,
              acceptanceStatus: acceptance as 'PENDING' | 'ACCEPTED',
              createdAt: order?.returnWorkflow?.requestedAt || order?.updatedAt || null,
            };
          })
          .filter((assignment: any) => assignment.orderId > 0)
          .sort((a: any, b: any) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateB - dateA;
          });

        this.pendingAssignments = assignments;
        this.loadingNotifications = false;
      },
      error: () => {
        this.pendingAssignments = [];
        this.loadingNotifications = false;
      },
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
