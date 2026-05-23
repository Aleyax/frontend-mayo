import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { map, of } from 'rxjs';
import {
  MarketplaceMyOrderSummary,
  MarketplaceOrderSummary,
  MarketplaceTrackResponse,
} from '../../interfaces/marketplace.interface';
import { MarketplaceService } from '../../services/marketplace.service';
import { MarketplaceAuthService } from '../../services/marketplace-auth.service';

type OrdersQuery =
  | { mode: 'auth' }
  | { mode: 'guest'; phone: string; email?: string; take?: number };

type TrackQuery = {
  code: string;
  phone: string;
};

type OrderDetailView = {
  code: string;
  status: string;
  publicStatus: string;
  createdAt: string;
  reviewMessage: string;
  clientName?: string;
  clientPhone?: string;
  totals?: {
    subtotal: number;
    tax: number;
    total: number;
  };
  items: Array<{
    productName: string;
    colorName: string;
    sizeName: string;
    requestedQuantity: number;
    reservedQuantity: number;
    pendingQuantity: number;
    unitPrice?: number;
    subtotal?: number;
  }>;
};

@Component({
  selector: 'app-marketplace-track-order',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './track-order.component.html',
  styleUrl: './track-order.component.css'
})
export class TrackOrderComponent implements OnInit {
  private readonly marketplaceService = inject(MarketplaceService);
  private readonly marketplaceAuthService = inject(MarketplaceAuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly manualError = signal('');
  private readonly ordersQuery = signal<OrdersQuery | null>(null);
  private readonly trackQuery = signal<TrackQuery | null>(null);
  private readonly detailCodeQuery = signal<string | null>(null);
  private readonly ordersRequestMode = signal<'none' | 'auth' | 'guest'>('none');
  private readonly didRequestOrders = signal(false);

  code = '';
  phone = '';
  email = '';

  readonly ordersResource = rxResource<MarketplaceMyOrderSummary[], OrdersQuery | undefined>({
    params: () => this.ordersQuery() ?? undefined,
    stream: ({ params }) => {
      if (!params) {
        return of([]);
      }

      if (params.mode === 'auth') {
        return this.marketplaceService.listMyOrdersAuthenticated().pipe(
          map((response) => (Array.isArray(response?.data) ? response.data : [])),
        );
      }

      return this.marketplaceService.listMyOrders(
        params.phone,
        params.email,
        params.take ?? 20,
      ).pipe(
        map((response) => (Array.isArray(response?.data) ? response.data : [])),
      );
    },
    defaultValue: [],
  });

  readonly trackResource = rxResource<MarketplaceTrackResponse | null, TrackQuery | undefined>({
    params: () => this.trackQuery() ?? undefined,
    stream: ({ params }) => {
      if (!params) {
        return of(null);
      }

      return this.marketplaceService.trackOrder(params.code, params.phone).pipe(
        map((response) => response?.data ?? null),
      );
    },
    defaultValue: null,
  });

  readonly detailResource = rxResource<MarketplaceOrderSummary | null, string | undefined>({
    params: () => this.detailCodeQuery() ?? undefined,
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

  readonly myOrders = computed(() => this.readResourceValue(this.ordersResource, [] as MarketplaceMyOrderSummary[]));
  readonly result = computed<OrderDetailView | null>(() => {
    const detailed = this.readResourceValue(this.detailResource, null as MarketplaceOrderSummary | null);
    if (detailed) {
      return this.mapSummaryToDetailView(detailed);
    }

    const tracked = this.readResourceValue(this.trackResource, null as MarketplaceTrackResponse | null);
    if (tracked) {
      return this.mapTrackToDetailView(tracked);
    }

    return null;
  });
  readonly showingDetail = computed(() => !!this.detailCodeQuery() || !!this.trackQuery());
  readonly loadingOrders = computed(() => this.ordersResource.isLoading());
  readonly loadingTrack = computed(() => this.trackResource.isLoading() || this.detailResource.isLoading());
  readonly detailSummary = computed(() => {
    const order = this.result();
    if (!order) {
      return {
        products: 0,
        requestedUnits: 0,
        reservedUnits: 0,
        pendingUnits: 0,
      };
    }

    const requestedUnits = (order.items || []).reduce((sum, item) => sum + Number(item.requestedQuantity || 0), 0);
    const reservedUnits = (order.items || []).reduce((sum, item) => sum + Number(item.reservedQuantity || 0), 0);
    const pendingUnits = (order.items || []).reduce((sum, item) => sum + Number(item.pendingQuantity || 0), 0);

    return {
      products: (order.items || []).length,
      requestedUnits,
      reservedUnits,
      pendingUnits,
    };
  });
  readonly errorMessage = computed(() => {
    const manual = this.manualError();
    if (manual) {
      return manual;
    }

    const ordersError = this.ordersResource.error() as { error?: { message?: string }; message?: string } | undefined;
    if (ordersError) {
      return ordersError.error?.message || ordersError.message || 'No se pudieron consultar tus pedidos.';
    }

    const trackError = this.trackResource.error() as { error?: { message?: string }; message?: string } | undefined;
    if (trackError) {
      return trackError.error?.message || trackError.message || 'No se encontro el pedido.';
    }

    const detailError = this.detailResource.error() as { error?: { message?: string }; message?: string } | undefined;
    if (detailError) {
      return detailError.error?.message || detailError.message || 'No se pudo cargar el detalle del pedido.';
    }

    if (!this.showingDetail() && this.didRequestOrders() && !this.loadingOrders() && this.myOrders().length === 0) {
      return this.ordersRequestMode() === 'auth'
        ? 'No tienes pedidos registrados con tu cuenta.'
        : 'No se encontraron pedidos con esos datos.';
    }

    return '';
  });

  constructor() {
    this.prefillFromSession();
  }

  ngOnInit(): void {
    const codeFromQuery = this.route.snapshot.queryParamMap.get('code');
    if (codeFromQuery) {
      this.code = codeFromQuery.trim().toUpperCase();
    }

    if (this.marketplaceAuthService.isAuthenticated()) {
      const code = this.code.trim().toUpperCase();
      this.router.navigate(['/marketplace/account'], code ? { queryParams: { code } } : undefined);
      return;
    }
  }

  viewMyOrders() {
    this.manualError.set('');
    this.trackQuery.set(null);
    this.detailCodeQuery.set(null);

    const hasMarketplaceSession = this.marketplaceAuthService.isAuthenticated();

    if (hasMarketplaceSession) {
      this.didRequestOrders.set(true);
      this.ordersRequestMode.set('auth');
      this.ordersQuery.set({ mode: 'auth' });
      return;
    }

    if (!this.phone.trim()) {
      this.manualError.set('Ingresa el telefono de validacion.');
      return;
    }

    this.didRequestOrders.set(true);
    this.ordersRequestMode.set('guest');
    this.ordersQuery.set({
      mode: 'guest',
      phone: this.phone.trim(),
      email: this.email.trim() || undefined,
      take: 20,
    });
  }

  searchByCode(keepOrdersVisible: boolean = false) {
    this.manualError.set('');
    const trimmedCode = this.code.trim().toUpperCase();

    if (!trimmedCode) {
      this.manualError.set('Ingresa un codigo para buscar el pedido.');
      return;
    }

    if (this.marketplaceAuthService.isAuthenticated()) {
      if (!keepOrdersVisible) {
        this.ordersQuery.set(null);
        this.didRequestOrders.set(false);
        this.ordersRequestMode.set('none');
      }
      this.trackQuery.set(null);
      this.detailCodeQuery.set(trimmedCode);
      return;
    }

    if (!keepOrdersVisible) {
      this.ordersQuery.set(null);
      this.didRequestOrders.set(false);
      this.ordersRequestMode.set('none');
    }

    if (!this.phone.trim()) {
      this.manualError.set('Ingresa el telefono de validacion.');
      return;
    }

    this.trackQuery.set({
      code: trimmedCode,
      phone: this.phone.trim(),
    });
    this.detailCodeQuery.set(null);
  }

  openOrder(orderCode: string) {
    const normalizedCode = String(orderCode || '').trim().toUpperCase();
    if (!normalizedCode) {
      return;
    }

    this.manualError.set('');
    this.code = normalizedCode;
    this.trackQuery.set(null);
    this.detailCodeQuery.set(normalizedCode);
  }

  closeOrderDetail() {
    this.manualError.set('');
    this.trackQuery.set(null);
    this.detailCodeQuery.set(null);
    this.code = '';
  }

  private prefillFromSession() {
    if (!this.marketplaceAuthService.isAuthenticated()) {
      return;
    }

    const currentUser = this.marketplaceAuthService.getCurrentUser();
    if (!currentUser) {
      return;
    }

    if (!this.phone.trim()) {
      this.phone = currentUser.phone || '';
    }
    if (!this.email.trim()) {
      this.email = currentUser.email || '';
    }
  }

  private mapTrackToDetailView(order: MarketplaceTrackResponse): OrderDetailView {
    return {
      code: order.code,
      status: order.status,
      publicStatus: order.publicStatus,
      createdAt: order.createdAt,
      reviewMessage: order.reviewMessage,
      items: (order.items || []).map((item) => ({
        productName: item.productName,
        colorName: item.colorName,
        sizeName: item.sizeName,
        requestedQuantity: Number(item.requestedQuantity || 0),
        reservedQuantity: Number(item.reservedQuantity || 0),
        pendingQuantity: Number(item.pendingQuantity || 0),
      })),
    };
  }

  private mapSummaryToDetailView(order: MarketplaceOrderSummary): OrderDetailView {
    return {
      code: order.code,
      status: order.status,
      publicStatus: order.publicStatus,
      createdAt: order.createdAt,
      reviewMessage: order.reviewMessage,
      clientName: order.clientName,
      clientPhone: order.clientPhone,
      totals: order.totals,
      items: (order.items || []).map((item) => ({
        productName: item.productName,
        colorName: item.colorName,
        sizeName: item.sizeName,
        requestedQuantity: Number(item.requestedQuantity || 0),
        reservedQuantity: Number(item.reservedQuantity || 0),
        pendingQuantity: Number(item.pendingQuantity || 0),
        unitPrice: Number(item.unitPrice || 0),
        subtotal: Number(item.subtotal || 0),
      })),
    };
  }

  private readResourceValue<T>(resource: { value: () => T }, fallback: T): T {
    try {
      return resource.value();
    } catch {
      return fallback;
    }
  }
}
