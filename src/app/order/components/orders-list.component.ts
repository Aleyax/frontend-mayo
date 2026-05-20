import { Component, computed, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { OrderService, OrderStatus } from '../services/order.service';
import { StoreService } from '../../store/services/store.service';
import { AlertService } from '../../shared/services/alert.service';

type OrdersFilters = {
  status?: string;
  storeId?: number;
  startDate?: string;
  endDate?: string;
  search?: string;
  channel?: 'POS' | 'ECOMMERCE' | 'INTERNAL';
};

type OrdersQuery = OrdersFilters & {
  page: number;
  limit: number;
};

@Component({
  selector: 'app-orders-list',
  templateUrl: './orders-list.component.html',
  styleUrls: ['./orders-list.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule]
})
export class OrdersListComponent implements OnInit {
  private readonly appliedFilters = signal<OrdersFilters>({});
  readonly currentPage = signal(1);
  readonly pageSize = 10;

  private readonly ordersQuery = computed<OrdersQuery>(() => ({
    page: this.currentPage(),
    limit: this.pageSize,
    ...this.appliedFilters()
  }));

  private readonly storesResource = rxResource<any[], void>({
    defaultValue: [],
    stream: () => this.storeService.getStores({ skip: 1, take: 100 })
  });

  private readonly ordersResource = rxResource<any, OrdersQuery>({
    defaultValue: {
      data: [],
      pagination: {
        page: 1,
        limit: this.pageSize,
        total: 0,
        totalPages: 1
      }
    },
    params: () => this.ordersQuery(),
    stream: ({ params }) => this.orderService.listOrders(params)
  });

  readonly stores = computed<any[]>(() => this.normalizeStores(this.storesResource.value()));
  readonly orders = computed<any[]>(() => this.normalizeOrders(this.ordersResource.value()));
  readonly totalOrders = computed<number>(() => {
    const response = this.ordersResource.value();
    const pagination = response?.pagination || {};
    return Number(pagination?.total || this.orders().length || 0);
  });
  readonly totalPages = computed<number>(() => {
    const response = this.ordersResource.value();
    const pagination = response?.pagination || {};
    return Math.max(1, Number(pagination?.totalPages || 1));
  });
  readonly loading = computed<boolean>(() => this.ordersResource.isLoading());
  readonly loadError = computed<string>(() => this.extractOrderErrorMessage(this.ordersResource.error()));

  readonly statusOptions = [
    { value: '', label: 'Todos los estados' },
    { value: 'PENDING', label: 'Pendiente' },
    { value: 'CONFIRMED', label: 'Confirmado' },
    { value: 'WAITING_TRANSFER', label: 'Esperando transferencia' },
    { value: 'PREPARING', label: 'Preparando' },
    { value: 'READY', label: 'Listo' },
    { value: 'DELIVERED', label: 'Entregado' },
    { value: 'RETURN_PENDING', label: 'Pendiente devolucion' },
    { value: 'CANCELLED', label: 'Cancelado' },
    { value: 'WAITING_STOCK', label: 'Sin stock' }
  ];

  readonly channelOptions = [
    { value: '', label: 'Todos los canales' },
    { value: 'POS', label: 'POS' },
    { value: 'ECOMMERCE', label: 'Ecommerce' },
    { value: 'INTERNAL', label: 'Interno' }
  ];

  filterForm!: FormGroup;
  selectedOrder: any = null;
  showDetail = false;

  orderStatusColors: Record<string, string> = {
    PENDING: '#f39c12',
    CONFIRMED: '#3498db',
    WAITING_TRANSFER: '#9b59b6',
    PREPARING: '#e67e22',
    READY: '#27ae60',
    DELIVERED: '#16a085',
    RETURN_PENDING: '#d35400',
    CANCELLED: '#e74c3c',
    WAITING_STOCK: '#c0392b'
  };

  orderStatusLabels: Record<string, string> = {
    PENDING: 'Pendiente',
    CONFIRMED: 'Confirmado',
    WAITING_TRANSFER: 'Esperando Transferencia',
    PREPARING: 'Preparando',
    READY: 'Listo',
    DELIVERED: 'Entregado',
    RETURN_PENDING: 'Pendiente Devolucion',
    CANCELLED: 'Cancelado',
    WAITING_STOCK: 'Sin Stock'
  };

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private orderService: OrderService,
    private storeService: StoreService,
    private alertService: AlertService
  ) {}

  ngOnInit() {
    this.initializeForm();
  }

  initializeForm() {
    this.filterForm = this.fb.group({
      search: [''],
      channel: [''],
      status: [''],
      storeId: [''],
      startDate: [''],
      endDate: ['']
    });
  }

  loadOrders() {
    const startDate = this.toLocalDateBoundaryIso(this.filterForm.get('startDate')?.value, false);
    const endDate = this.toLocalDateBoundaryIso(this.filterForm.get('endDate')?.value, true);

    const filters: OrdersFilters = {
      search: this.normalizeSearch(this.filterForm.get('search')?.value),
      channel: this.normalizeChannel(this.filterForm.get('channel')?.value),
      status: this.filterForm.get('status')?.value || undefined,
      storeId: this.filterForm.get('storeId')?.value ? Number(this.filterForm.get('storeId')?.value) : undefined,
      startDate,
      endDate
    };

    this.appliedFilters.set(this.compactFilters(filters));
  }

  private toLocalDateBoundaryIso(value: unknown, endOfDay: boolean): string | undefined {
    if (typeof value !== 'string' || !value.trim()) {
      return undefined;
    }

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      return value;
    }

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);

    if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || !Number.isInteger(day)) {
      return value;
    }

    const date = endOfDay
      ? new Date(year, monthIndex, day, 23, 59, 59, 999)
      : new Date(year, monthIndex, day, 0, 0, 0, 0);

    return date.toISOString();
  }

  private compactFilters(filters: OrdersFilters): OrdersFilters {
    const nextFilters: OrdersFilters = {};
    const entries = Object.entries(filters) as [keyof OrdersFilters, OrdersFilters[keyof OrdersFilters]][];
    const writableFilters = nextFilters as Record<string, unknown>;

    for (const [key, value] of entries) {
      if (value !== undefined && value !== null && value !== '') {
        writableFilters[key] = value;
      }
    }

    return nextFilters;
  }

  private normalizeSearch(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  private normalizeChannel(value: unknown): OrdersFilters['channel'] | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const normalized = value.trim().toUpperCase();
    if (normalized === 'POS' || normalized === 'ECOMMERCE' || normalized === 'INTERNAL') {
      return normalized;
    }
    return undefined;
  }

  private normalizeStores(storesResponse: any): any[] {
    if (Array.isArray(storesResponse)) {
      return storesResponse;
    }
    if (Array.isArray(storesResponse?.data)) {
      return storesResponse.data;
    }
    if (Array.isArray(storesResponse?.value)) {
      return storesResponse.value;
    }
    if (Array.isArray(storesResponse?.result)) {
      return storesResponse.result;
    }
    return [];
  }

  private normalizeOrders(response: any): any[] {
    if (Array.isArray(response?.data)) {
      return response.data;
    }
    if (Array.isArray(response)) {
      return response;
    }
    return [];
  }

  private extractOrderErrorMessage(error: unknown): string {
    if (!error) {
      return '';
    }

    const parsedError = error as any;
    return parsedError?.error?.error || parsedError?.error?.message || parsedError?.message || 'No se pudieron cargar las ordenes.';
  }

  applyFilters() {
    this.currentPage.set(1);
    this.loadOrders();
  }

  clearFilters() {
    this.filterForm.reset({
      search: '',
      channel: '',
      status: '',
      storeId: '',
      startDate: '',
      endDate: ''
    });
    this.applyFilters();
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  viewOrderDetail(order: any) {
    this.router.navigate(['/admin/orders', order.id]);
  }

  printOrder(order: any) {
    const urlTree = this.router.createUrlTree(['/admin/orders', order.id], {
      queryParams: { print: '1' }
    });
    const url = this.router.serializeUrl(urlTree);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  closeDetail() {
    this.showDetail = false;
    this.selectedOrder = null;
  }

  updateOrderStatus(order: any, newStatus: OrderStatus) {
    if (!confirm(`Cambiar estado a ${this.orderStatusLabels[newStatus]}?`)) {
      return;
    }

    this.orderService.updateOrderStatus(order.id, newStatus).subscribe({
      next: () => {
        this.ordersResource.reload();
      },
      error: (error) => {
        this.alertService.show(error?.error?.error || 'Error al actualizar', 'error');
      }
    });
  }

  getStatusColor(status: string): string {
    return this.orderStatusColors[status] || '#95a5a6';
  }

  getStatusLabel(status: string): string {
    return this.orderStatusLabels[status] || status;
  }

  getSalesChannelLabel(order: any): string {
    const channel = String(order?.salesChannel || '').toUpperCase();
    if (channel === 'POS') return 'POS';
    if (channel === 'ECOMMERCE') return 'Ecommerce';
    if (channel === 'INTERNAL') return 'Interno';
    return 'No definido';
  }

  getResponsibleLabel(order: any): string {
    const responsible = order?.primaryResponsible;
    if (!responsible) {
      return 'Sin asignar';
    }

    const fullName = `${responsible.firstName || ''} ${responsible.lastName || ''}`.trim() || 'Sin nombre';
    const role = String(responsible.role || '').toUpperCase();

    if (role === 'SELLER') return `${fullName} (Vendedor)`;
    if (role === 'PICKER') return `${fullName} (Picker)`;
    if (role === 'DISPENSER') return `${fullName} (Despachador)`;
    return fullName;
  }
}
