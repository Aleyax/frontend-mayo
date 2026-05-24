import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, map, of } from 'rxjs';
import {
  MarketplaceAuthUser,
  MarketplaceMyOrderSummary,
  MarketplaceOrderSummary,
} from '../../interfaces/marketplace.interface';
import { MarketplaceAuthService } from '../../services/marketplace-auth.service';
import { MarketplaceService } from '../../services/marketplace.service';
import { SeoService } from '../../../shared/services/seo.service';

type OrderStatusOption = {
  value: string;
  label: string;
};

@Component({
  selector: 'app-account-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './account-dashboard.component.html',
  styleUrl: './account-dashboard.component.css',
})
export class AccountDashboardComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly marketplaceAuthService = inject(MarketplaceAuthService);
  private readonly marketplaceService = inject(MarketplaceService);
  private readonly seoService = inject(SeoService);
  private readonly canLoad = signal(false);
  private readonly profileReloadVersion = signal(0);
  private readonly ordersReloadVersion = signal(0);
  private readonly selectedOrderCode = signal<string | null>(null);
  private readonly manualError = signal('');

  readonly successMessage = signal('');
  readonly savingProfile = signal(false);
  readonly orderSearch = signal('');
  readonly orderStatusFilter = signal('ALL');
  readonly orderDateFrom = signal('');
  readonly orderDateTo = signal('');

  readonly profileResource = rxResource<MarketplaceAuthUser | null, number | undefined>({
    params: () => (this.canLoad() ? this.profileReloadVersion() : undefined),
    stream: () => this.marketplaceAuthService.me().pipe(
      map((user) => user ?? null),
    ),
    defaultValue: null,
  });

  readonly ordersResource = rxResource<MarketplaceMyOrderSummary[], number | undefined>({
    params: () => {
      if (!this.canLoad() || !this.marketplaceAuthService.isAuthenticated()) {
        return undefined;
      }

      return this.ordersReloadVersion();
    },
    stream: ({ params }) => {
      if (params === undefined) {
        return of([]);
      }

      return this.marketplaceService.listMyOrdersAuthenticated().pipe(
        map((response) => (Array.isArray(response?.data) ? response.data : [])),
      );
    },
    defaultValue: [],
  });

  readonly myOrders = computed(() => this.readResourceValue(this.ordersResource, [] as MarketplaceMyOrderSummary[]));

  readonly orderProductsByCodeResource = rxResource<Record<string, string[]>, string[] | undefined>({
    params: () => {
      const codes = Array.from(new Set(
        this.myOrders()
          .map((order) => String(order?.code || '').trim().toUpperCase())
          .filter((code) => !!code),
      ));

      if (!codes.length) {
        return undefined;
      }

      return codes.sort((a, b) => a.localeCompare(b));
    },
    stream: ({ params }) => {
      if (!params?.length) {
        return of({});
      }

      return forkJoin(
        params.map((code) =>
          this.marketplaceService.getOrderByCode(code).pipe(
            map((response) => {
              const productNames = Array.from(new Set(
                (response?.data?.items || [])
                  .map((item) => String(item?.productName || '').trim())
                  .filter((name) => !!name),
              ));
              return [code, productNames] as const;
            }),
            catchError(() => of([code, []] as const)),
          ),
        ),
      ).pipe(
        map((entries) => {
          const productMap: Record<string, string[]> = {};
          for (const [code, productNames] of entries) {
            productMap[code] = [...productNames];
          }
          return productMap;
        }),
      );
    },
    defaultValue: {},
  });

  readonly detailResource = rxResource<MarketplaceOrderSummary | null, string | undefined>({
    params: () => this.selectedOrderCode() ?? undefined,
    stream: ({ params }) => {
      if (!params) {
        return of(null);
      }

      return this.marketplaceService.getOrderByCode(params).pipe(
        map((response) => response?.data ?? null),
      );
    },
    defaultValue: null,
  });

  readonly selectedOrderDetail = computed(() => this.readResourceValue(this.detailResource, null as MarketplaceOrderSummary | null));
  readonly loadingProfile = computed(() => this.profileResource.isLoading());
  readonly loadingOrders = computed(() => this.ordersResource.isLoading());
  readonly loadingOrderDetail = computed(() => this.detailResource.isLoading());
  readonly showingOrderDetail = computed(() => !!this.selectedOrderCode());
  readonly orderStatusOptions = computed<OrderStatusOption[]>(() => {
    const optionsMap = new Map<string, string>();

    for (const order of this.myOrders()) {
      const statusCode = String(order?.status || '').trim().toUpperCase();
      if (!statusCode) {
        continue;
      }

      const label = String(order?.publicStatus || '').trim() || this.humanizeStatus(statusCode);
      if (!optionsMap.has(statusCode)) {
        optionsMap.set(statusCode, label);
      }
    }

    return Array.from(optionsMap.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  readonly filteredOrders = computed(() => {
    const query = this.orderSearch().trim().toLowerCase();
    const statusFilter = String(this.orderStatusFilter() || 'ALL').toUpperCase();
    const fromDate = this.parseInputDateBoundary(this.orderDateFrom(), false);
    const toDate = this.parseInputDateBoundary(this.orderDateTo(), true);
    const productNamesByCode = this.readResourceValue(this.orderProductsByCodeResource, {} as Record<string, string[]>);

    return this.myOrders().filter((order) => {
      const status = String(order?.status || '').trim().toUpperCase();
      if (statusFilter !== 'ALL' && status !== statusFilter) {
        return false;
      }

      const createdAt = new Date(order.createdAt);
      const createdAtTime = createdAt.getTime();
      if (Number.isFinite(fromDate) && createdAtTime < (fromDate as number)) {
        return false;
      }
      if (Number.isFinite(toDate) && createdAtTime > (toDate as number)) {
        return false;
      }

      if (!query) {
        return true;
      }

      const code = String(order?.code || '').toLowerCase();
      const publicStatus = String(order?.publicStatus || '').toLowerCase();
      const technicalStatus = String(order?.status || '').toLowerCase();
      const productText = (productNamesByCode[String(order?.code || '').trim().toUpperCase()] || []).join(' ').toLowerCase();

      return (
        code.includes(query) ||
        publicStatus.includes(query) ||
        technicalStatus.includes(query) ||
        productText.includes(query)
      );
    });
  });

  readonly errorMessage = computed(() => {
    const manual = this.manualError();
    if (manual) {
      return manual;
    }

    const profileError = this.profileResource.error() as { error?: { message?: string }; message?: string } | undefined;
    if (profileError) {
      return profileError.error?.message || profileError.message || 'No se pudo cargar tu perfil.';
    }

    const ordersError = this.ordersResource.error() as { error?: { message?: string }; message?: string } | undefined;
    if (ordersError) {
      return ordersError.error?.message || ordersError.message || 'No se pudieron cargar tus pedidos.';
    }

    const detailError = this.detailResource.error() as { error?: { message?: string }; message?: string } | undefined;
    if (detailError) {
      return detailError.error?.message || detailError.message || 'No se pudo cargar el detalle del pedido.';
    }

    return '';
  });

  firstName = '';
  lastName = '';
  email = '';
  phone = '';
  address = '';

  constructor() {
    effect(() => {
      const profile = this.readResourceValue(this.profileResource, null as MarketplaceAuthUser | null);
      if (!profile) {
        return;
      }

      this.firstName = profile.firstName || '';
      this.lastName = profile.lastName || '';
      this.email = profile.email || '';
      this.phone = profile.phone || '';
      this.address = profile.address || '';
    });
  }

  ngOnInit(): void {
    this.seoService.setNoIndexPage({
      title: 'Mi cuenta mayorista',
      description: 'Gestiona tu perfil y consulta tus pedidos mayoristas.',
      path: '/marketplace/account',
      type: 'website',
    });
    this.seoService.clearJsonLd();

    if (!this.marketplaceAuthService.isAuthenticated()) {
      this.router.navigate(['/marketplace/auth'], { queryParams: { returnUrl: '/marketplace/account' } });
      return;
    }

    this.prefillFromSession();
    this.canLoad.set(true);
    const queryCode = String(this.route.snapshot.queryParamMap.get('code') || '').trim().toUpperCase();
    if (queryCode) {
      this.openOrderDetail(queryCode, false);
    }
  }

  saveProfile() {
    this.manualError.set('');
    this.successMessage.set('');

    if (!this.firstName.trim() || !this.lastName.trim() || !this.phone.trim()) {
      this.manualError.set('Nombre, apellido y telefono son obligatorios.');
      return;
    }

    this.savingProfile.set(true);
    this.marketplaceAuthService.updateProfile({
      firstName: this.firstName.trim(),
      lastName: this.lastName.trim(),
      phone: this.phone.trim(),
      address: this.address.trim() || null,
    }).subscribe({
      next: (user) => {
        this.savingProfile.set(false);
        this.firstName = user.firstName || '';
        this.lastName = user.lastName || '';
        this.phone = user.phone || '';
        this.address = user.address || '';
        this.successMessage.set('Perfil actualizado correctamente.');
        this.profileResource.reload();
      },
      error: (error) => {
        this.savingProfile.set(false);
        this.manualError.set(error?.error?.message || 'No se pudo actualizar el perfil.');
      },
    });
  }

  reloadOrders() {
    this.manualError.set('');
    this.ordersReloadVersion.update((version) => version + 1);
    this.ordersResource.reload();
  }

  clearOrderFilters() {
    this.orderSearch.set('');
    this.orderStatusFilter.set('ALL');
    this.orderDateFrom.set('');
    this.orderDateTo.set('');
  }

  openOrderDetail(orderCode: string, syncQueryParam: boolean = true) {
    const normalizedCode = String(orderCode || '').trim().toUpperCase();
    if (!normalizedCode) {
      return;
    }

    this.manualError.set('');
    this.selectedOrderCode.set(normalizedCode);

    if (syncQueryParam) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { code: normalizedCode },
        queryParamsHandling: 'merge',
      });
    }
  }

  goToOrderDetail(orderCode: string) {
    const normalizedCode = String(orderCode || '').trim().toUpperCase();
    if (!normalizedCode) {
      return;
    }

    this.router.navigate(['/marketplace/order-confirmation', normalizedCode]);
  }

  closeOrderDetail() {
    this.selectedOrderCode.set(null);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { code: null },
      queryParamsHandling: 'merge',
    });
  }

  private prefillFromSession() {
    const localUser = this.marketplaceAuthService.getCurrentUser();
    if (!localUser) {
      return;
    }

    this.firstName = localUser.firstName || '';
    this.lastName = localUser.lastName || '';
    this.email = localUser.email || '';
    this.phone = localUser.phone || '';
    this.address = localUser.address || '';
  }

  private humanizeStatus(status: string): string {
    const normalized = String(status || '').trim().toUpperCase();
    if (!normalized) {
      return '-';
    }

    return normalized
      .split('_')
      .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
      .join(' ');
  }

  private parseInputDateBoundary(value: string, endOfDay: boolean): number | null {
    const trimmed = String(value || '').trim();
    if (!trimmed) {
      return null;
    }

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = endOfDay
      ? new Date(year, monthIndex, day, 23, 59, 59, 999)
      : new Date(year, monthIndex, day, 0, 0, 0, 0);

    const timestamp = date.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  private readResourceValue<T>(resource: { value: () => T }, fallback: T): T {
    try {
      return resource.value();
    } catch {
      return fallback;
    }
  }
}
