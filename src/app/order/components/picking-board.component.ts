import { Component, OnInit, computed, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { rxResource } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import { OrderService } from '../services/order.service';
import { AlertService } from '../../shared/services/alert.service';

@Component({
  selector: 'app-picking-board',
  templateUrl: './picking-board.component.html',
  styleUrls: ['./picking-board.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule]
})
export class PickingBoardComponent implements OnInit {
  private readonly statusFilter = signal<string>('');
  private readonly selectedOrderId = signal<number | undefined>(undefined);
  private cachedPicking: any | null = null;
  private wasReloadingDetail = false;

  readonly ordersResource = rxResource<any[], string>({
    params: () => this.statusFilter(),
    defaultValue: [],
    stream: ({ params }) => {
      const filters: any = { page: 1, limit: 50 };
      if (params) {
        filters.status = params;
      }

      return this.orderService.listOrders(filters).pipe(
        map((response: any) => response?.data || []),
        catchError((error) => {
          console.error('Error loading orders:', error);
          return of([]);
        })
      );
    }
  });

  readonly pickingResource = rxResource<any | null, number | undefined>({
    params: () => this.selectedOrderId(),
    defaultValue: null,
    stream: ({ params }) => {
      if (!params) {
        return of(null);
      }

      return this.orderService.getOrderPicking(params).pipe(
        map((response: any) => response?.data || null),
        catchError((error) => {
          console.error('Error loading picking:', error);
          return of(null);
        })
      );
    }
  });

  readonly orders = computed<any[]>(() => this.ordersResource.value() || []);

  selectedOrder: any = null;
  filterForm!: FormGroup;

  startingPicking = false;
  completingPicking = false;
  updatingItemIds = new Set<number>();

  orderStatusColors: Record<string, string> = {
    CONFIRMED: '#3498db',
    WAITING_TRANSFER: '#9b59b6',
    PREPARING: '#e67e22',
    READY: '#27ae60',
    DELIVERED: '#16a085',
    RETURN_PENDING: '#d35400',
    CANCELLED: '#e74c3c'
  };

  orderStatusLabels: Record<string, string> = {
    CONFIRMED: 'Confirmado',
    WAITING_TRANSFER: 'Esperando transferencia',
    PREPARING: 'Preparando',
    READY: 'Listo',
    DELIVERED: 'Entregado',
    RETURN_PENDING: 'Pendiente devolucion',
    CANCELLED: 'Cancelado'
  };

  constructor(
    private fb: FormBuilder,
    private orderService: OrderService,
    private alertService: AlertService
  ) {
    effect(() => {
      const selectedOrderId = this.selectedOrderId();
      if (!selectedOrderId) {
        return;
      }

      const currentOrders = this.orders();
      const refreshedOrder = currentOrders.find((order) => Number(order?.id) === Number(selectedOrderId));
      if (refreshedOrder) {
        this.selectedOrder = refreshedOrder;
      }
    });

    effect(() => {
      const currentPicking = this.pickingResource.value();
      const currentOrderId = Number(this.selectedOrderId() || 0);

      if (
        currentPicking &&
        Number(currentPicking.orderId || 0) > 0 &&
        Number(currentPicking.orderId || 0) === currentOrderId
      ) {
        this.cachedPicking = currentPicking;
      }

      if (!currentOrderId) {
        this.cachedPicking = null;
      }
    });

    effect(() => {
      const isReloading = this.reloadingDetail;
      if (isReloading && !this.wasReloadingDetail) {
        this.alertService.show('Actualizando tabla de picking...', 'info', 900);
      }
      this.wasReloadingDetail = isReloading;
    });
  }

  ngOnInit() {
    this.initializeForm();
  }

  get loading(): boolean {
    return this.ordersResource.isLoading();
  }

  get selectedPicking(): any | null {
    const livePicking = this.pickingResource.value();
    if (livePicking) {
      return livePicking;
    }

    const currentOrderId = Number(this.selectedOrderId() || this.selectedOrder?.id || 0);
    if (!this.cachedPicking || currentOrderId <= 0) {
      return null;
    }

    return Number(this.cachedPicking.orderId || 0) === currentOrderId ? this.cachedPicking : null;
  }

  get loadingDetail(): boolean {
    return this.pickingResource.isLoading() && !this.selectedPicking;
  }

  get reloadingDetail(): boolean {
    return this.pickingResource.isLoading() && !!this.selectedPicking;
  }

  initializeForm() {
    this.filterForm = this.fb.group({
      status: ['']
    });
  }

  selectOrder(order: any) {
    this.selectedOrder = order;
    this.cachedPicking = null;

    const id = Number(order?.id || 0);
    this.selectedOrderId.set(Number.isFinite(id) && id > 0 ? id : undefined);
  }

  startPicking() {
    if (!this.selectedOrder || this.startingPicking) return;

    this.startingPicking = true;
    this.orderService.startOrderPicking(this.selectedOrder.id).subscribe({
      next: () => {
        this.startingPicking = false;
        this.ordersResource.reload();
        this.pickingResource.reload();
      },
      error: (error: any) => {
        this.alertService.show(error?.error?.error || 'No se pudo iniciar picking', 'error');
        this.startingPicking = false;
      }
    });
  }

  markItemPicked(item: any) {
    const requested = Number(item?.requestedQuantity || 0);
    const current = Number(item?.pickedQuantity || 0);
    this.updateItemPickedQuantity(item, Math.min(requested, current + 1));
  }

  markItemUnpicked(item: any) {
    const current = Number(item?.pickedQuantity || 0);
    this.updateItemPickedQuantity(item, Math.max(0, current - 1));
  }

  markItemComplete(item: any) {
    const requested = Number(item?.requestedQuantity || 0);
    this.updateItemPickedQuantity(item, requested);
  }

  private updateItemPickedQuantity(item: any, nextQuantity: number) {
    if (!item?.pickingItemId || this.updatingItemIds.has(Number(item.pickingItemId))) {
      return;
    }

    const pickingItemId = Number(item.pickingItemId);
    this.updatingItemIds.add(pickingItemId);

    this.orderService.updatePickingItem(pickingItemId, nextQuantity).subscribe({
      next: () => {
        this.updatingItemIds.delete(pickingItemId);
        this.pickingResource.reload();
        this.ordersResource.reload();
      },
      error: (error: any) => {
        this.alertService.show(error?.error?.error || 'No se pudo actualizar el item de picking', 'error');
        this.updatingItemIds.delete(pickingItemId);
      }
    });
  }

  completeOrder() {
    if (!this.selectedOrder || !this.selectedPicking?.summary?.completed || this.completingPicking) {
      return;
    }

    this.completingPicking = true;
    this.orderService.completeOrderPicking(this.selectedOrder.id).subscribe({
      next: () => {
        this.completingPicking = false;
        this.ordersResource.reload();
        this.pickingResource.reload();
        this.alertService.show('Picking finalizado. El pedido quedo en READY.', 'success');
      },
      error: (error: any) => {
        this.alertService.show(error?.error?.error || 'No se pudo finalizar picking', 'error');
        this.completingPicking = false;
      }
    });
  }

  getPickingProgress(order: any): number {
    const progress = Number(order?.pickingSummary?.progress);
    if (Number.isFinite(progress)) {
      return Math.max(0, Math.min(100, progress));
    }

    const items = Array.isArray(order?.items) ? order.items : [];
    const totalRequested = items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
    const totalPicked = items.reduce((sum: number, item: any) => sum + Number(item.pickedQuantity || item.picked || 0), 0);
    if (totalRequested <= 0) return 0;

    return Math.round((totalPicked / totalRequested) * 100);
  }

  getItemProgress(item: any): number {
    const picked = Number(item?.pickedQuantity || 0);
    const total = Number(item?.requestedQuantity || 0);
    if (total <= 0) return 0;
    return Math.round((picked / total) * 100);
  }

  canStartPicking(): boolean {
    if (!this.selectedOrder) return false;

    const hasSession = !!this.selectedPicking?.pickingSession;
    if (hasSession) return false;

    const status = String(this.selectedPicking?.orderStatus || this.selectedOrder.status || '').toUpperCase();
    return status === 'CONFIRMED' || status === 'WAITING_TRANSFER' || status === 'PREPARING';
  }

  isPickingFinalized(): boolean {
    const sessionStatus = String(this.selectedPicking?.pickingSession?.status || '').toUpperCase();
    const orderStatus = String(this.selectedPicking?.orderStatus || this.selectedOrder?.status || '').toUpperCase();
    return sessionStatus === 'COMPLETED' && (orderStatus === 'READY' || orderStatus === 'DELIVERED');
  }

  isItemUpdating(item: any): boolean {
    return this.updatingItemIds.has(Number(item?.pickingItemId || 0));
  }

  getItemStatusLabel(status: string): string {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'COMPLETED') return 'Completo';
    if (normalized === 'PARTIAL') return 'Parcial';
    return 'Pendiente';
  }

  getItemStatusClass(status: string): string {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'COMPLETED') return 'completed';
    if (normalized === 'PARTIAL') return 'partial';
    return 'pending';
  }

  onFilterChange() {
    const status = String(this.filterForm.get('status')?.value || '').trim();
    this.statusFilter.set(status);
    this.clearSelection();
  }

  getStatusColor(status: string): string {
    return this.orderStatusColors[status] || '#95a5a6';
  }

  getStatusLabel(status: string): string {
    return this.orderStatusLabels[status] || status;
  }

  clearSelection() {
    this.selectedOrder = null;
    this.cachedPicking = null;
    this.selectedOrderId.set(undefined);
  }
}
