import { Component, HostListener, OnInit, computed, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { rxResource } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import {
  OrderService,
  PickingResponsibilityMode,
  PickingResponsibilityRequestAction,
  PickingUnpickAction,
} from '../services/order.service';
import { AlertService } from '../../shared/services/alert.service';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-picking-board',
  templateUrl: './picking-board.component.html',
  styleUrls: [
    './picking-board.component.layout.css',
    './picking-board.component.item-actions.css',
    './picking-board.component.theme-overrides.css',
  ],
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule]
})
export class PickingBoardComponent implements OnInit {
  private readonly mobileBreakpoint = 1024;
  private readonly statusFilter = signal<string>('');
  private readonly selectedOrderId = signal<number | undefined>(undefined);
  private cachedPicking: any | null = null;
  private wasReloadingDetail = false;
  readonly isMobileView = signal(false);
  readonly pickingStatusShortcuts = [
    { value: '', label: 'Todos' },
    { value: 'CONFIRMED', label: 'Confirmados' },
    { value: 'WAITING_TRANSFER', label: 'Transferencia' },
    { value: 'PREPARING', label: 'Preparando' },
    { value: 'READY', label: 'Listos' }
  ] as const;

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

  readonly orders = computed<any[]>(() =>
    (this.ordersResource.value() || []).filter((order) => {
      const normalizedStatus = String(order?.status || '').toUpperCase();
      return normalizedStatus !== 'DELIVERED' && normalizedStatus !== 'CANCELLED' && normalizedStatus !== 'CANCELED';
    })
  );

  selectedOrder: any = null;
  filterForm!: FormGroup;

  startingPicking = false;
  completingPicking = false;
  updatingItemIds = new Set<number>();
  requestingResponsibilityMode: PickingResponsibilityMode | null = null;
  resolvingRequestIds = new Set<number>();
  requestingUnpickItemIds = new Set<number>();
  resolvingUnpickRequestIds = new Set<number>();
  openUnpickRequestItemId: number | null = null;
  unpickRequestDraftByItemId = new Map<number, { quantity: number; note: string }>();

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
    private alertService: AlertService,
    private authService: AuthService,
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
    this.syncViewportMode();
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.syncViewportMode();
  }

  @HostListener('document:keydown.escape')
  onEscapeKey() {
    if (this.isMobileView() && this.selectedOrder) {
      this.clearSelection();
    }
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

  get currentUserId(): number | null {
    const rawId = Number(this.authService.getCurrentUser()?.id);
    return Number.isInteger(rawId) && rawId > 0 ? rawId : null;
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
    if (!this.canCurrentUserOperatePicking()) {
      this.alertService.show('No tienes responsabilidad asignada para iniciar este picking', 'warning');
      return;
    }

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
    if (!this.canCurrentUserOperatePicking()) {
      this.alertService.show('No tienes responsabilidad asignada para actualizar este picking', 'warning');
      return;
    }
    const requested = this.getItemPickLimit(item);
    const current = Number(item?.pickedQuantity || 0);
    this.updateItemPickedQuantity(item, Math.min(requested, current + 1));
  }

  markItemUnpicked(item: any) {
    if (!this.canCurrentUserOperatePicking()) {
      this.alertService.show('No tienes responsabilidad asignada para actualizar este picking', 'warning');
      return;
    }
    if (this.isPickingResponsibilityFlowEnabled() && !this.canCurrentUserUnpickDirectly(item)) {
      this.openUnpickRequestForm(item);
      this.alertService.show('No puedes restar unidades separadas por otro usuario. Usa "Solicitar accion".', 'info');
      return;
    }
    const current = Number(item?.pickedQuantity || 0);
    this.updateItemPickedQuantity(item, Math.max(0, current - 1));
  }

  markItemComplete(item: any) {
    if (!this.canCurrentUserOperatePicking()) {
      this.alertService.show('No tienes responsabilidad asignada para actualizar este picking', 'warning');
      return;
    }
    const requested = this.getItemPickLimit(item);
    this.updateItemPickedQuantity(item, requested);
  }

  getItemPickLimit(item: any): number {
    const requestedQuantity = Math.max(0, Number(item?.requestedQuantity || 0));
    const explicitMax = Number(item?.maxPickableQuantity);
    if (Number.isFinite(explicitMax) && explicitMax >= 0) {
      return Math.min(requestedQuantity, explicitMax);
    }

    const reservedQuantity = Number(item?.reservedQuantity);
    if (Number.isFinite(reservedQuantity) && reservedQuantity >= 0) {
      return Math.min(requestedQuantity, reservedQuantity);
    }

    return requestedQuantity;
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
    if (!this.canCurrentUserOperatePicking()) {
      this.alertService.show('No tienes responsabilidad asignada para finalizar este picking', 'warning');
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

    if (this.isPickingResponsibilityFlowEnabled() && !this.canCurrentUserOperatePicking() && !!this.getPickingPrimaryResponsible()) {
      return false;
    }

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

  isPickingResponsibilityFlowEnabled(): boolean {
    return this.selectedPicking?.pickingResponsibility?.enabled === true;
  }

  getPickingPrimaryResponsible(): any | null {
    return this.selectedPicking?.pickingResponsibility?.primaryResponsible || null;
  }

  getPickingPrimaryResponsibleLabel(): string {
    const primary = this.getPickingPrimaryResponsible();
    if (!primary) {
      return this.selectedPicking?.pickingSession?.assignedUser?.firstName
        || this.selectedOrder?.pickerUser?.firstName
        || 'No asignado';
    }

    const firstName = String(primary?.firstName || '').trim();
    const lastName = String(primary?.lastName || '').trim();
    const fullName = `${firstName} ${lastName}`.trim();
    if (fullName) return fullName;
    return primary?.email || `Usuario #${primary?.id || '-'}`;
  }

  getSharedResponsibles(): any[] {
    const shared = this.selectedPicking?.pickingResponsibility?.sharedResponsibles;
    return Array.isArray(shared) ? shared : [];
  }

  getPendingResponsibilityRequests(): any[] {
    const pending = this.selectedPicking?.pickingResponsibility?.pendingRequests;
    return Array.isArray(pending) ? pending : [];
  }

  isCurrentUserPrimaryResponsible(): boolean {
    const currentUserId = this.currentUserId;
    const primaryUserId = Number(this.getPickingPrimaryResponsible()?.id || 0);
    return !!currentUserId && currentUserId === primaryUserId;
  }

  isCurrentUserSharedResponsible(): boolean {
    const currentUserId = this.currentUserId;
    if (!currentUserId) {
      return false;
    }
    return this.getSharedResponsibles().some((entry: any) => Number(entry?.user?.id || 0) === currentUserId);
  }

  canCurrentUserOperatePicking(): boolean {
    if (!this.isPickingResponsibilityFlowEnabled()) {
      return true;
    }

    const currentUserId = this.currentUserId;
    if (!currentUserId) {
      return false;
    }

    const primaryResponsible = this.getPickingPrimaryResponsible();
    if (!primaryResponsible) {
      return true;
    }

    return this.isCurrentUserPrimaryResponsible() || this.isCurrentUserSharedResponsible();
  }

  getItemContributions(item: any): any[] {
    const contributions = item?.contributions;
    return Array.isArray(contributions) ? contributions : [];
  }

  getPendingUnpickRequests(item: any): any[] {
    const pending = item?.pendingUnpickRequests;
    return Array.isArray(pending) ? pending : [];
  }

  getCurrentUserContribution(item: any): number {
    const currentUserId = this.currentUserId;
    if (!currentUserId) {
      return 0;
    }

    const own = this.getItemContributions(item).find(
      (entry: any) => Number(entry?.user?.id || 0) === currentUserId,
    );
    return Math.max(0, Number(own?.quantity || 0));
  }

  getUnpickRequestableQuantity(item: any): number {
    const pickedQuantity = Math.max(0, Number(item?.pickedQuantity || 0));
    const ownContribution = this.getCurrentUserContribution(item);
    return Math.max(0, pickedQuantity - ownContribution);
  }

  canCurrentUserUnpickDirectly(item: any): boolean {
    if (!this.isPickingResponsibilityFlowEnabled()) {
      return true;
    }

    const contributions = this.getItemContributions(item);
    if (contributions.length === 0) {
      return true;
    }

    return this.getCurrentUserContribution(item) > 0;
  }

  canShowUnpickRequestButton(item: any): boolean {
    if (!this.isPickingResponsibilityFlowEnabled() || !this.canCurrentUserOperatePicking()) {
      return false;
    }
    if (Number(item?.pickedQuantity || 0) <= 0) {
      return false;
    }
    return this.getUnpickRequestableQuantity(item) > 0;
  }

  isUnpickRequestFormOpen(item: any): boolean {
    const pickingItemId = Number(item?.pickingItemId || 0);
    return Number.isInteger(pickingItemId) && this.openUnpickRequestItemId === pickingItemId;
  }

  isRequestingUnpickForItem(item: any): boolean {
    const pickingItemId = Number(item?.pickingItemId || 0);
    return Number.isInteger(pickingItemId) && this.requestingUnpickItemIds.has(pickingItemId);
  }

  openUnpickRequestForm(item: any) {
    const pickingItemId = Number(item?.pickingItemId || 0);
    if (!Number.isInteger(pickingItemId) || pickingItemId < 1 || !this.canShowUnpickRequestButton(item)) {
      return;
    }

    const existingDraft = this.unpickRequestDraftByItemId.get(pickingItemId);
    if (!existingDraft) {
      this.unpickRequestDraftByItemId.set(pickingItemId, {
        quantity: Math.max(1, Math.min(this.getUnpickRequestableQuantity(item), 1)),
        note: '',
      });
    } else {
      existingDraft.quantity = Math.max(1, Math.min(existingDraft.quantity || 1, this.getUnpickRequestableQuantity(item)));
      this.unpickRequestDraftByItemId.set(pickingItemId, existingDraft);
    }

    this.openUnpickRequestItemId = pickingItemId;
  }

  closeUnpickRequestForm(item?: any) {
    if (!item) {
      this.openUnpickRequestItemId = null;
      return;
    }

    const pickingItemId = Number(item?.pickingItemId || 0);
    if (Number.isInteger(pickingItemId) && this.openUnpickRequestItemId === pickingItemId) {
      this.openUnpickRequestItemId = null;
    }
  }

  toggleUnpickRequestForm(item: any) {
    if (this.isUnpickRequestFormOpen(item)) {
      this.closeUnpickRequestForm(item);
      return;
    }
    this.openUnpickRequestForm(item);
  }

  getUnpickRequestDraft(item: any): { quantity: number; note: string } {
    const pickingItemId = Number(item?.pickingItemId || 0);
    const existingDraft = this.unpickRequestDraftByItemId.get(pickingItemId);
    if (existingDraft) {
      return existingDraft;
    }

    const draft = {
      quantity: 1,
      note: '',
    };
    this.unpickRequestDraftByItemId.set(pickingItemId, draft);
    return draft;
  }

  updateUnpickRequestDraftQuantity(item: any, rawQuantity: string | number) {
    const pickingItemId = Number(item?.pickingItemId || 0);
    if (!Number.isInteger(pickingItemId) || pickingItemId < 1) {
      return;
    }

    const maxQuantity = this.getUnpickRequestableQuantity(item);
    const parsedRaw = Number(rawQuantity);
    const normalizedQuantity = Math.max(1, Math.min(maxQuantity, Number.isFinite(parsedRaw) ? Math.floor(parsedRaw) : 1));
    const currentDraft = this.getUnpickRequestDraft(item);
    this.unpickRequestDraftByItemId.set(pickingItemId, {
      ...currentDraft,
      quantity: normalizedQuantity,
    });
  }

  updateUnpickRequestDraftNote(item: any, note: string) {
    const pickingItemId = Number(item?.pickingItemId || 0);
    if (!Number.isInteger(pickingItemId) || pickingItemId < 1) {
      return;
    }

    const currentDraft = this.getUnpickRequestDraft(item);
    this.unpickRequestDraftByItemId.set(pickingItemId, {
      ...currentDraft,
      note: String(note || ''),
    });
  }

  canSubmitUnpickRequest(item: any): boolean {
    if (!this.selectedOrder || !this.canShowUnpickRequestButton(item) || this.isRequestingUnpickForItem(item)) {
      return false;
    }

    const draft = this.getUnpickRequestDraft(item);
    const quantity = Number(draft?.quantity || 0);
    const maxQuantity = this.getUnpickRequestableQuantity(item);
    return Number.isInteger(quantity) && quantity > 0 && quantity <= maxQuantity;
  }

  submitUnpickRequest(item: any) {
    if (!this.selectedOrder || !this.canSubmitUnpickRequest(item)) {
      return;
    }

    const pickingItemId = Number(item?.pickingItemId || 0);
    const draft = this.getUnpickRequestDraft(item);
    this.requestingUnpickItemIds.add(pickingItemId);
    this.orderService.requestPickingUnpickAction(
      this.selectedOrder.id,
      pickingItemId,
      Number(draft.quantity || 0),
      draft.note || undefined,
    ).subscribe({
      next: () => {
        this.requestingUnpickItemIds.delete(pickingItemId);
        this.openUnpickRequestItemId = null;
        this.unpickRequestDraftByItemId.delete(pickingItemId);
        this.ordersResource.reload();
        this.pickingResource.reload();
        this.alertService.show('Solicitud de accion enviada', 'success');
      },
      error: (error: any) => {
        this.requestingUnpickItemIds.delete(pickingItemId);
        this.alertService.show(error?.error?.error || 'No se pudo enviar la solicitud', 'error');
      },
    });
  }

  isResolvingUnpickRequest(requestId: number): boolean {
    const normalizedRequestId = Number(requestId);
    return Number.isInteger(normalizedRequestId) && this.resolvingUnpickRequestIds.has(normalizedRequestId);
  }

  canResolveUnpickRequest(item: any, request: any): boolean {
    if (!this.isPickingResponsibilityFlowEnabled()) {
      return false;
    }
    const currentUserId = this.currentUserId;
    if (!currentUserId) {
      return false;
    }
    const requesterId = Number(request?.requester?.id || 0);
    if (requesterId === currentUserId) {
      return false;
    }
    if (this.isCurrentUserPrimaryResponsible()) {
      return true;
    }

    const ownContribution = this.getCurrentUserContribution(item);
    const requestedQuantity = Number(request?.quantity || 0);
    return ownContribution >= requestedQuantity && requestedQuantity > 0;
  }

  resolveUnpickRequest(item: any, requestId: number, action: PickingUnpickAction) {
    const normalizedRequestId = Number(requestId);
    const request = this.getPendingUnpickRequests(item).find((entry: any) => Number(entry?.id || 0) === normalizedRequestId);
    if (!this.selectedOrder || !request || !this.canResolveUnpickRequest(item, request)) {
      return;
    }
    if (!Number.isInteger(normalizedRequestId) || normalizedRequestId < 1 || this.resolvingUnpickRequestIds.has(normalizedRequestId)) {
      return;
    }

    this.resolvingUnpickRequestIds.add(normalizedRequestId);
    this.orderService.resolvePickingUnpickAction(this.selectedOrder.id, normalizedRequestId, action).subscribe({
      next: () => {
        this.resolvingUnpickRequestIds.delete(normalizedRequestId);
        this.ordersResource.reload();
        this.pickingResource.reload();
        this.alertService.show(
          action === 'APPROVE' ? 'Solicitud de unpick aprobada' : 'Solicitud de unpick rechazada',
          action === 'APPROVE' ? 'success' : 'info',
        );
      },
      error: (error: any) => {
        this.resolvingUnpickRequestIds.delete(normalizedRequestId);
        this.alertService.show(error?.error?.error || 'No se pudo resolver la solicitud', 'error');
      },
    });
  }

  hasPendingRequestByCurrentUser(mode?: PickingResponsibilityMode): boolean {
    const currentUserId = this.currentUserId;
    if (!currentUserId) {
      return false;
    }

    return this.getPendingResponsibilityRequests().some((request: any) => {
      const requesterId = Number(request?.requester?.id || 0);
      const requestMode = String(request?.mode || '').toUpperCase();
      if (requesterId !== currentUserId) {
        return false;
      }
      if (!mode) {
        return true;
      }
      return requestMode === mode;
    });
  }

  canRequestResponsibility(mode: PickingResponsibilityMode): boolean {
    if (!this.selectedOrder || !this.selectedPicking || this.requestingResponsibilityMode !== null) {
      return false;
    }
    if (!this.isPickingResponsibilityFlowEnabled()) {
      return false;
    }
    if (this.isCurrentUserPrimaryResponsible() || this.isCurrentUserSharedResponsible()) {
      return false;
    }
    if (this.hasPendingRequestByCurrentUser(mode)) {
      return false;
    }
    return true;
  }

  requestResponsibility(mode: PickingResponsibilityMode) {
    if (!this.selectedOrder || !this.canRequestResponsibility(mode)) {
      return;
    }

    this.requestingResponsibilityMode = mode;
    this.orderService.requestPickingResponsibility(this.selectedOrder.id, mode).subscribe({
      next: () => {
        this.requestingResponsibilityMode = null;
        this.ordersResource.reload();
        this.pickingResource.reload();
        this.alertService.show(
          mode === 'TRANSFER'
            ? 'Solicitud para tomar responsabilidad enviada'
            : 'Solicitud para responsabilidad compartida enviada',
          'success',
        );
      },
      error: (error: any) => {
        this.requestingResponsibilityMode = null;
        this.alertService.show(error?.error?.error || 'No se pudo enviar la solicitud', 'error');
      },
    });
  }

  canResolveResponsibilityRequests(): boolean {
    return this.isPickingResponsibilityFlowEnabled() && this.isCurrentUserPrimaryResponsible();
  }

  resolveResponsibilityRequest(requestId: number, action: PickingResponsibilityRequestAction) {
    if (!this.selectedOrder || !this.canResolveResponsibilityRequests()) {
      return;
    }

    const normalizedRequestId = Number(requestId);
    if (!Number.isInteger(normalizedRequestId) || normalizedRequestId < 1 || this.resolvingRequestIds.has(normalizedRequestId)) {
      return;
    }

    this.resolvingRequestIds.add(normalizedRequestId);
    this.orderService.resolvePickingResponsibilityRequest(this.selectedOrder.id, normalizedRequestId, action).subscribe({
      next: () => {
        this.resolvingRequestIds.delete(normalizedRequestId);
        this.ordersResource.reload();
        this.pickingResource.reload();
        this.alertService.show(
          action === 'APPROVE' ? 'Solicitud aprobada' : 'Solicitud rechazada',
          action === 'APPROVE' ? 'success' : 'info',
        );
      },
      error: (error: any) => {
        this.resolvingRequestIds.delete(normalizedRequestId);
        this.alertService.show(error?.error?.error || 'No se pudo resolver la solicitud', 'error');
      },
    });
  }

  isResolvingResponsibilityRequest(requestId: number): boolean {
    const normalizedRequestId = Number(requestId);
    return Number.isInteger(normalizedRequestId) && this.resolvingRequestIds.has(normalizedRequestId);
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
    const status = String(this.filterForm.get('status')?.value || '').trim().toUpperCase();
    this.statusFilter.set(status);
    this.clearSelection();
  }

  applyStatusShortcut(status: string) {
    if (!this.filterForm) {
      return;
    }
    this.filterForm.patchValue({ status });
    this.onFilterChange();
  }

  isStatusShortcutActive(status: string): boolean {
    if (!this.filterForm) {
      return status === '';
    }
    const current = String(this.filterForm.get('status')?.value || '').trim().toUpperCase();
    return current === String(status || '').trim().toUpperCase();
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
    this.requestingResponsibilityMode = null;
    this.resolvingRequestIds.clear();
    this.requestingUnpickItemIds.clear();
    this.resolvingUnpickRequestIds.clear();
    this.unpickRequestDraftByItemId.clear();
    this.openUnpickRequestItemId = null;
    this.selectedOrderId.set(undefined);
  }

  private syncViewportMode() {
    if (typeof window === 'undefined') {
      return;
    }
    this.isMobileView.set(window.innerWidth <= this.mobileBreakpoint);
  }
}

