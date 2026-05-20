import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { OrderResponsibleRole, OrderService, OrderStatus } from '../services/order.service';
import { AuthService } from '../../auth/auth.service';
import { SystemConfigService } from '../../admin/services/system-config.service';
import { UserService } from '../../shared/services/user.service';
import { AlertService } from '../../shared/services/alert.service';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, timeout } from 'rxjs';

type PrintLayout = 'invoice' | 'ticket';

@Component({
  selector: 'app-order-detail',
  templateUrl: './order-detail.component.html',
  styleUrls: ['./order-detail.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule]
})
export class OrderDetailComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly orderService = inject(OrderService);
  private readonly authService = inject(AuthService);
  private readonly systemConfigService = inject(SystemConfigService);
  private readonly userService = inject(UserService);
  private readonly alertService = inject(AlertService);

  private readonly orderId = toSignal(
    this.route.params.pipe(
      map((params) => {
        const rawId = Number(params['id']);
        return Number.isFinite(rawId) && rawId > 0 ? rawId : undefined;
      })
    ),
    { initialValue: undefined }
  );

  private readonly shouldAutoPrint = toSignal(
    this.route.queryParams.pipe(map((params) => String(params['print'] || '') === '1')),
    { initialValue: false }
  );

  private readonly preferredPrintLayout = toSignal(
    this.route.queryParams.pipe(
      map((params) => {
        const rawLayout = String(params['style'] || params['printStyle'] || '').toLowerCase();
        return rawLayout === 'ticket' ? 'ticket' : 'invoice';
      })
    ),
    { initialValue: 'invoice' as PrintLayout }
  );

  private readonly lastAutoPrintedOrderId = signal<number | null>(null);
  private readonly shouldLoadUsers = signal(false);
  private cachedOrder: any | undefined = undefined;
  private cachedPickingData: any | null = null;
  private wasReloadingPicking = false;
  usersLoadError = '';

  readonly orderResource = rxResource<any, number | undefined>({
    params: () => this.orderId(),
    stream: ({ params }) =>
      this.orderService.getOrderById(params).pipe(
        timeout(12000),
        map((response: any) => response?.data || response)
      )
  });

  readonly usersResource = rxResource<any[], boolean>({
    params: () => this.shouldLoadUsers(),
    defaultValue: [],
    stream: ({ params }) => {
      if (!params) {
        return of([]);
      }

      return this.userService.getUsers().pipe(
        timeout(12000),
        catchError((error: any) => {
          const statusCode = Number(error?.status || 0);
          this.usersLoadError = statusCode === 403
            ? 'No tienes permiso para listar usuarios.'
            : 'No se pudo cargar la lista de usuarios.';
          return of([]);
        })
      );
    }
  });

  readonly pickingResource = rxResource<any | null, number | undefined>({
    params: () => this.orderId(),
    defaultValue: null,
    stream: ({ params }) => {
      if (!params) {
        return of(null);
      }

      return this.orderService.getOrderPicking(params).pipe(
        timeout(12000),
        map((response: any) => response?.data || null),
        catchError(() => of(null))
      );
    }
  });

  readonly orderWorkflowSettingsResource = rxResource<{ returnResponsibilityManagementEnabled: boolean }, true>({
    params: () => true,
    defaultValue: { returnResponsibilityManagementEnabled: true },
    stream: () => this.systemConfigService.getOrderWorkflowSettings().pipe(
      timeout(12000),
      catchError(() => of({ returnResponsibilityManagementEnabled: true }))
    )
  });

  statusForm!: FormGroup;
  assignForm!: FormGroup;
  returnDelegateForm!: FormGroup;

  showStatusModal = false;
  showAssignModal = false;
  showDeliverModal = false;
  showReturnDelegateModal = false;
  printLayout: PrintLayout = 'invoice';
  startingPicking = false;
  finishingPicking = false;
  updatingPickingItemIds = new Set<number>();

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

  availableTransitions: Record<string, string[]> = {
    PENDING: ['CONFIRMED', 'WAITING_STOCK', 'CANCELLED'],
    CONFIRMED: ['PREPARING', 'WAITING_TRANSFER', 'CANCELLED'],
    WAITING_STOCK: ['CONFIRMED', 'CANCELLED'],
    WAITING_TRANSFER: ['PREPARING', 'CANCELLED'],
    PREPARING: ['READY', 'CANCELLED'],
    READY: ['DELIVERED', 'CANCELLED'],
    RETURN_PENDING: ['CANCELLED'],
    DELIVERED: [],
    CANCELLED: []
  };

  constructor() {
    effect(() => {
      const currentOrder = this.orderResource.value();
      if (currentOrder) {
        this.cachedOrder = currentOrder;
      }
    });

    effect(() => {
      const currentOrderId = this.orderId();
      const currentOrder = this.orderResource.value();
      if (!currentOrderId || currentOrder) {
        return;
      }

      if (this.cachedOrder && Number(this.cachedOrder.id) !== Number(currentOrderId)) {
        this.cachedOrder = undefined;
      }
    });

    effect(() => {
      const currentPicking = this.pickingResource.value();
      const currentOrderId = Number(this.orderId() || 0);

      if (
        currentPicking &&
        Number(currentPicking.orderId || 0) > 0 &&
        Number(currentPicking.orderId || 0) === currentOrderId
      ) {
        this.cachedPickingData = currentPicking;
      }

      if (!currentOrderId) {
        this.cachedPickingData = null;
      }
    });

    effect(() => {
      this.printLayout = this.preferredPrintLayout();
    });

    effect(() => {
      const isReloading = this.reloadingPicking;
      if (isReloading && !this.wasReloadingPicking) {
        this.alertService.show('Actualizando datos de picking...', 'info', 900);
      }
      this.wasReloadingPicking = isReloading;
    });

    effect(() => {
      const order = this.order;
      const shouldPrint = this.shouldAutoPrint();

      if (!order || !shouldPrint) {
        return;
      }

      const currentOrderId = Number(order.id || 0);
      if (!Number.isFinite(currentOrderId) || currentOrderId <= 0) {
        return;
      }

      if (this.lastAutoPrintedOrderId() === currentOrderId) {
        return;
      }

      this.lastAutoPrintedOrderId.set(currentOrderId);
      setTimeout(() => this.printOrder(), 300);
    });
  }

  ngOnInit() {
    this.initializeForms();
  }

  get order(): any | undefined {
    return this.orderResource.value() || this.cachedOrder;
  }

  get loading(): boolean {
    return this.orderResource.isLoading() && !this.order;
  }

  get loadError(): string {
    const currentOrderId = this.orderId();
    if (!currentOrderId) {
      return 'No se encontro un pedido valido para visualizar.';
    }

    const error = this.orderResource.error();
    if (!error) {
      return '';
    }

    return this.resolveOrderErrorMessage(error);
  }

  get users(): any[] {
    return this.usersResource.value() || [];
  }

  get loadingUsers(): boolean {
    return this.usersResource.isLoading() && this.shouldLoadUsers();
  }

  get pickingData(): any | null {
    const livePicking = this.pickingResource.value();
    if (livePicking) {
      return livePicking;
    }

    const currentOrderId = Number(this.orderId() || this.order?.id || 0);
    if (!this.cachedPickingData || currentOrderId <= 0) {
      return null;
    }

    return Number(this.cachedPickingData.orderId || 0) === currentOrderId ? this.cachedPickingData : null;
  }

  get loadingPicking(): boolean {
    return this.pickingResource.isLoading() && !this.pickingData;
  }

  get reloadingPicking(): boolean {
    return this.pickingResource.isLoading() && !!this.pickingData;
  }

  initializeForms() {
    this.statusForm = this.fb.group({
      status: [null as OrderStatus | null, Validators.required],
      note: ['']
    });

    this.assignForm = this.fb.group({
      roleType: [null as OrderResponsibleRole | null, Validators.required],
      userId: [null as number | null, Validators.required]
    });

    this.returnDelegateForm = this.fb.group({
      userId: [null as number | null, Validators.required],
      note: ['']
    });
  }

  openStatusModal() {
    const currentOrder = this.order;
    if (!currentOrder) {
      return;
    }

    const nextStates = this.availableTransitions[currentOrder.status] || [];
    this.statusForm.patchValue({
      status: nextStates.length > 0 ? nextStates[0] : ''
    });
    this.showStatusModal = true;
  }

  submitStatusChange() {
    const orderId = this.orderId();
    if (!this.statusForm.valid || !orderId) {
      return;
    }

    const { status, note } = this.statusForm.value;
    const previousStatus = String(this.order?.status || '').trim().toUpperCase();
    const normalizedStatus = String(status || '').trim().toUpperCase() as OrderStatus;
    this.orderService.updateOrderStatus(orderId, normalizedStatus, note).subscribe(
      (response: any) => {
        const updatedStatus = String(response?.data?.status || normalizedStatus).toUpperCase();
        if (updatedStatus === 'RETURN_PENDING') {
          this.alertService.show('Pedido cancelado y marcado como pendiente de devolucion', 'warning');
        } else if (
          updatedStatus === 'CANCELLED' &&
          (normalizedStatus === 'CANCELLED' || normalizedStatus === 'RETURN_PENDING') &&
          previousStatus !== 'RETURN_PENDING'
        ) {
          this.alertService.show('Pedido cancelado y reservas liberadas automaticamente', 'success');
        } else {
          this.alertService.show('Estado actualizado exitosamente', 'success');
        }
        this.showStatusModal = false;
        this.orderResource.reload();
      },
      (error) => {
        this.alertService.show(error.error?.error || 'Error al actualizar estado', 'error');
      }
    );
  }

  openAssignModal() {
    this.ensureUsersLoaded();
    this.assignForm.reset({
      roleType: null,
      userId: null
    });
    this.showAssignModal = true;
  }

  submitAssign() {
    const orderId = this.orderId();
    if (!this.assignForm.valid || !orderId) {
      return;
    }

    const { roleType, userId } = this.assignForm.value;
    const normalizedRole = String(roleType || '').trim().toLowerCase() as OrderResponsibleRole;
    const normalizedUserId = Number(userId);
    const validRoles: OrderResponsibleRole[] = ['seller', 'picker', 'dispenser'];

    if (!validRoles.includes(normalizedRole)) {
      this.alertService.show('Debes seleccionar un rol valido', 'warning');
      return;
    }

    if (!Number.isInteger(normalizedUserId) || normalizedUserId < 1) {
      this.alertService.show('Debes seleccionar un usuario valido', 'warning');
      return;
    }

    this.orderService.assignResponsible(orderId, normalizedRole, normalizedUserId).subscribe(
      () => {
        this.alertService.show('Responsable asignado exitosamente', 'success');
        this.showAssignModal = false;
        this.orderResource.reload();
      },
      (error) => {
        this.alertService.show(error.error?.error || 'Error al asignar responsable', 'error');
      }
    );
  }

  get returnWorkflow(): any | null {
    return this.order?.returnWorkflow || null;
  }

  isReturnResponsibilityManagementEnabled(): boolean {
    return this.orderWorkflowSettingsResource.value()?.returnResponsibilityManagementEnabled !== false;
  }

  isReturnPendingOrder(): boolean {
    return String(this.order?.status || '').toUpperCase() === 'RETURN_PENDING';
  }

  isReturnResponsibilityAccepted(): boolean {
    return String(this.returnWorkflow?.acceptanceStatus || '').toUpperCase() === 'ACCEPTED';
  }

  get currentUserId(): number | null {
    const rawId = Number(this.authService.getCurrentUser()?.id);
    return Number.isInteger(rawId) && rawId > 0 ? rawId : null;
  }

  isCurrentUserReturnResponsible(): boolean {
    const currentUserId = this.currentUserId;
    const responsibleId = Number(this.returnWorkflow?.responsible?.id || 0);
    return !!currentUserId && currentUserId === responsibleId;
  }

  isReturnDelegatedToCurrentUser(): boolean {
    const delegatedById = Number(this.returnWorkflow?.delegatedBy?.id || 0);
    return this.isCurrentUserReturnResponsible() && delegatedById > 0;
  }

  getReturnPendingReservations(): any[] {
    if (!this.isReturnPendingOrder()) {
      return [];
    }

    const reservations = Array.isArray(this.order?.reservations) ? this.order.reservations : [];
    return reservations.filter((reservation: any) => String(reservation?.status || '').toUpperCase() === 'ACTIVE');
  }

  getReturnPendingItems(): any[] {
    if (!this.isReturnPendingOrder()) {
      return [];
    }

    const items = Array.isArray(this.order?.items) ? this.order.items : [];
    return items
      .map((item: any) => {
        const rawPicked = Number(item?.pickedQuantity ?? item?.picked ?? this.getPickedQuantity(item) ?? 0);
        const returnQuantity = Math.max(0, rawPicked);
        return {
          ...item,
          returnQuantity
        };
      })
      .filter((item: any) => Number(item.returnQuantity || 0) > 0);
  }

  getReturnPendingUnits(): number {
    return this.getReturnPendingItems().reduce(
      (sum: number, item: any) => sum + Number(item?.returnQuantity || 0),
      0
    );
  }

  getReturnPendingItemsCount(): number {
    return this.getReturnPendingItems().length;
  }

  getReturnPendingStoresCount(): number {
    const storeIds = new Set<number>();
    for (const item of this.getReturnPendingItems()) {
      const variantId = Number(item?.variantId || 0);
      for (const reservation of this.getReturnPendingReservations()) {
        const reservationVariantId = Number(reservation?.variantId || reservation?.inventory?.variant?.id || 0);
        const storeId = Number(reservation?.inventory?.store?.id || 0);
        if (reservationVariantId === variantId && storeId > 0) {
          storeIds.add(storeId);
        }
      }
    }
    return storeIds.size;
  }

  getReturnPendingTitle(): string {
    if (!this.isReturnPendingOrder()) {
      return '';
    }

    if (this.isCurrentUserReturnResponsible()) {
      return 'Tienes una devolucion pendiente en este pedido';
    }

    return 'Esta devolucion esta pendiente de ejecucion';
  }

  getReturnPendingDescription(): string {
    if (!this.isReturnPendingOrder()) {
      return '';
    }

    if (!this.isReturnResponsibilityManagementEnabled()) {
      return 'Gestion de responsabilidades desactivada. Solo confirma la devolucion cuando termine el retorno fisico.';
    }

    if (!this.isCurrentUserReturnResponsible()) {
      return 'Revisa el responsable asignado para coordinar la devolucion.';
    }

    if (!this.isReturnResponsibilityAccepted()) {
      return 'Antes de devolver stock, acepta la responsabilidad para confirmar que tomaras esta tarea.';
    }

    if (this.getReturnPendingUnits() <= 0) {
      return 'No hay unidades separadas fisicamente. Puedes confirmar devolucion para liberar reservas.';
    }

    return 'Devuelve los items listados y luego confirma la devolucion para cerrar la cancelacion.';
  }

  getReturnItemLabel(item: any): string {
    const product = String(item?.variant?.product?.name || 'Producto');
    const color = String(item?.variant?.color?.name || '-');
    const size = String(item?.variant?.size?.name || '-');
    return `${product} (${color} - ${size})`;
  }

  getReturnItemStoresLabel(item: any): string {
    const variantId = Number(item?.variantId || 0);
    const stores = new Set<string>();
    for (const reservation of this.getReturnPendingReservations()) {
      const reservationVariantId = Number(reservation?.variantId || reservation?.inventory?.variant?.id || 0);
      const storeName = String(reservation?.inventory?.store?.name || '').trim();
      if (reservationVariantId === variantId && storeName) {
        stores.add(storeName);
      }
    }

    if (stores.size > 0) {
      return Array.from(stores).join(', ');
    }

    return String(this.order?.sourceStore?.name || '-');
  }

  canDelegateReturnResponsibility(): boolean {
    if (!this.isReturnResponsibilityManagementEnabled()) {
      return false;
    }

    const order = this.order;
    if (!order || String(order.status || '').toUpperCase() !== 'RETURN_PENDING') {
      return false;
    }

    const currentUserId = this.currentUserId;
    if (!currentUserId) {
      return false;
    }

    const workflow = this.returnWorkflow;
    const responsibleId = Number(workflow?.responsible?.id || 0);
    const cancelledById = Number(workflow?.cancelledBy?.id || 0);
    return currentUserId === responsibleId || currentUserId === cancelledById;
  }

  canAcceptReturnResponsibility(): boolean {
    if (!this.isReturnResponsibilityManagementEnabled()) {
      return false;
    }

    const order = this.order;
    if (!order || String(order.status || '').toUpperCase() !== 'RETURN_PENDING') {
      return false;
    }

    const workflow = this.returnWorkflow;
    const currentUserId = this.currentUserId;
    const responsibleId = Number(workflow?.responsible?.id || 0);
    const acceptance = String(workflow?.acceptanceStatus || '').toUpperCase();
    return !!currentUserId && currentUserId === responsibleId && acceptance !== 'ACCEPTED';
  }

  canCompleteReturnAndCancel(): boolean {
    const order = this.order;
    if (!order || String(order.status || '').toUpperCase() !== 'RETURN_PENDING') {
      return false;
    }

    if (!this.isReturnResponsibilityManagementEnabled()) {
      return this.currentUserId !== null;
    }

    const workflow = this.returnWorkflow;
    const currentUserId = this.currentUserId;
    const responsibleId = Number(workflow?.responsible?.id || 0);
    const acceptance = String(workflow?.acceptanceStatus || '').toUpperCase();
    return !!currentUserId && currentUserId === responsibleId && acceptance === 'ACCEPTED';
  }

  openReturnDelegateModal() {
    if (!this.canDelegateReturnResponsibility()) {
      this.alertService.show('No tienes permisos para delegar esta devolucion', 'warning');
      return;
    }

    this.ensureUsersLoaded();
    this.returnDelegateForm.reset({
      userId: null,
      note: ''
    });
    this.showReturnDelegateModal = true;
  }

  submitReturnDelegation() {
    const orderId = this.orderId();
    if (!orderId || !this.returnDelegateForm.valid) {
      return;
    }

    const userId = Number(this.returnDelegateForm.get('userId')?.value);
    const note = String(this.returnDelegateForm.get('note')?.value || '').trim();
    if (!Number.isInteger(userId) || userId < 1) {
      this.alertService.show('Debes seleccionar un usuario valido', 'warning');
      return;
    }

    this.orderService.delegateReturnResponsibility(orderId, userId, note || undefined).subscribe({
      next: () => {
        this.alertService.show('Responsabilidad de devolucion delegada', 'success');
        this.showReturnDelegateModal = false;
        this.orderResource.reload();
      },
      error: (error) => {
        this.alertService.show(error?.error?.error || 'No se pudo delegar la devolucion', 'error');
      }
    });
  }

  private ensureUsersLoaded() {
    this.usersLoadError = '';
    if (!this.shouldLoadUsers()) {
      this.shouldLoadUsers.set(true);
    }
    this.usersResource.reload();
  }

  acceptReturnResponsibility() {
    const orderId = this.orderId();
    if (!orderId) return;

    this.orderService.acceptReturnResponsibility(orderId).subscribe({
      next: () => {
        this.alertService.show('Responsabilidad de devolucion aceptada', 'success');
        this.orderResource.reload();
      },
      error: (error) => {
        this.alertService.show(error?.error?.error || 'No se pudo aceptar la devolucion', 'error');
      }
    });
  }

  completeReturnAndCancel() {
    const orderId = this.orderId();
    if (!orderId) return;

    this.orderService.updateOrderStatus(orderId, 'CANCELLED', 'Devolucion de stock completada').subscribe({
      next: () => {
        this.alertService.show('Devolucion confirmada y cancelacion finalizada', 'success');
        this.orderResource.reload();
      },
      error: (error) => {
        this.alertService.show(error?.error?.error || 'No se pudo finalizar la devolucion', 'error');
      }
    });
  }

  openDeliverModal() {
    if (this.order?.status === 'READY') {
      this.showDeliverModal = true;
    } else {
      this.alertService.show('El pedido debe estar en estado READY para entregarlo', 'warning');
    }
  }

  submitDeliver() {
    const orderId = this.orderId();
    if (!orderId) return;

    this.orderService.updateOrderStatus(orderId, 'DELIVERED', 'Pedido entregado').subscribe(
      () => {
        this.alertService.show('Pedido entregado exitosamente', 'success');
        this.showDeliverModal = false;
        this.orderResource.reload();
      },
      (error) => {
        this.alertService.show(error.error?.error || 'Error al entregar pedido', 'error');
      }
    );
  }

  getNextStates(): string[] {
    const status = this.order?.status;
    if (!status) return [];
    return this.availableTransitions[status] || [];
  }

  getStatusColor(status: string): string {
    return this.orderStatusColors[status] || '#95a5a6';
  }

  getStatusLabel(status: string): string {
    return this.orderStatusLabels[status] || status;
  }

  getSalesChannelLabel(): string {
    const channel = String(this.order?.salesChannel || '').toUpperCase();
    if (channel === 'POS') return 'POS';
    if (channel === 'ECOMMERCE') return 'Ecommerce';
    if (channel === 'INTERNAL') return 'Interno';
    return 'No definido';
  }

  getPaymentMethod(): string {
    const note = String(this.order?.note || '');
    const match = note.match(/Metodo de pago:\s*([^|]+)/i);
    return match?.[1]?.trim() || 'No especificado';
  }

  getPaymentReference(): string {
    const note = String(this.order?.note || '');
    const match = note.match(/Ref:\s*([^|]+)/i);
    return match?.[1]?.trim() || '-';
  }

  getPickedQuantity(item: any): number {
    const sessionItems = this.order?.pickingSession?.items || [];
    const match = sessionItems.find((sessionItem: any) => Number(sessionItem.variantId) === Number(item.variantId));
    return Number(match?.pickedQuantity || 0);
  }

  getPickingStatus(item: any): 'PENDING' | 'PARTIAL' | 'COMPLETED' {
    const picked = this.getPickedQuantity(item);
    const requested = Number(item?.quantity || 0);
    if (picked <= 0) return 'PENDING';
    if (picked >= requested) return 'COMPLETED';
    return 'PARTIAL';
  }

  getPickingStatusLabel(item: any): string {
    const status = this.getPickingStatus(item);
    if (status === 'COMPLETED') return 'Completo';
    if (status === 'PARTIAL') return 'Parcial';
    return 'Pendiente';
  }

  getReservationStatusLabel(status: string): string {
    if (status === 'ACTIVE' && String(this.order?.status || '').toUpperCase() === 'RETURN_PENDING') {
      return 'Activa (pendiente devolucion)';
    }
    if (status === 'ACTIVE') return 'Activa';
    if (status === 'RELEASED') return 'Liberada';
    if (status === 'COMPLETED') return 'Consumida';
    return status || '-';
  }

  getPickingItemsForDetail(): any[] {
    if (Array.isArray(this.pickingData?.items)) {
      return this.pickingData.items;
    }

    const orderItems = this.order?.items || [];
    return orderItems.map((item: any) => {
      const requestedQuantity = Number(item?.quantity || 0);
      const pickedQuantity = this.getPickedQuantity(item);
      const missingQuantity = Math.max(0, requestedQuantity - pickedQuantity);
      return {
        pickingItemId: null,
        variantId: item?.variantId,
        variant: item?.variant,
        requestedQuantity,
        pickedQuantity,
        missingQuantity,
        status: this.getPickingStatus(item)
      };
    });
  }

  canStartPickingFromDetail(): boolean {
    const order = this.order;
    if (!order || this.startingPicking) return false;

    if (this.pickingData?.pickingSession) return false;
    const status = String(order.status || '').toUpperCase();
    return status === 'CONFIRMED' || status === 'PREPARING' || status === 'WAITING_TRANSFER';
  }

  canCompletePickingFromDetail(): boolean {
    if (!this.pickingData?.pickingSession || this.finishingPicking) return false;
    if (this.isPickingFinalizedForDetail()) return false;
    return !!this.pickingData?.summary?.completed;
  }

  isPickingFinalizedForDetail(): boolean {
    const sessionStatus = String(this.pickingData?.pickingSession?.status || '').toUpperCase();
    const orderStatus = String(this.order?.status || this.pickingData?.orderStatus || '').toUpperCase();
    return sessionStatus === 'COMPLETED' && (orderStatus === 'READY' || orderStatus === 'DELIVERED');
  }

  getPickingProgressForDetail(): number {
    const progress = Number(this.pickingData?.summary?.progress);
    if (Number.isFinite(progress)) {
      return Math.max(0, Math.min(100, progress));
    }

    const items = this.getPickingItemsForDetail();
    const totalRequested = items.reduce((sum: number, item: any) => sum + Number(item.requestedQuantity || 0), 0);
    const totalPicked = items.reduce((sum: number, item: any) => sum + Number(item.pickedQuantity || 0), 0);
    if (totalRequested <= 0) return 0;
    return Math.round((totalPicked / totalRequested) * 100);
  }

  getPickingItemStatusLabel(status: string): string {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'COMPLETED') return 'Completo';
    if (normalized === 'PARTIAL') return 'Parcial';
    return 'Pendiente';
  }

  getPickingItemStatusClass(status: string): string {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'COMPLETED') return 'picked';
    if (normalized === 'PARTIAL') return 'partial';
    return 'pending';
  }

  isPickingItemUpdating(item: any): boolean {
    const itemId = Number(item?.pickingItemId || 0);
    return itemId > 0 && this.updatingPickingItemIds.has(itemId);
  }

  startPickingFromDetail() {
    const orderId = this.orderId();
    if (!orderId || !this.canStartPickingFromDetail()) return;

    this.startingPicking = true;
    this.orderService.startOrderPicking(orderId).subscribe({
      next: () => {
        this.startingPicking = false;
        this.orderResource.reload();
        this.pickingResource.reload();
      },
      error: (error) => {
        this.startingPicking = false;
        this.alertService.show(error?.error?.error || 'No se pudo iniciar picking', 'error');
      }
    });
  }

  markPickingItemFromDetail(item: any, action: 'inc' | 'dec' | 'complete') {
    const pickingItemId = Number(item?.pickingItemId || 0);
    if (!pickingItemId || this.updatingPickingItemIds.has(pickingItemId)) {
      return;
    }

    const requested = Number(item?.requestedQuantity || 0);
    const current = Number(item?.pickedQuantity || 0);
    let nextQuantity = current;

    if (action === 'inc') nextQuantity = Math.min(requested, current + 1);
    if (action === 'dec') nextQuantity = Math.max(0, current - 1);
    if (action === 'complete') nextQuantity = requested;

    if (nextQuantity === current) return;

    this.updatingPickingItemIds.add(pickingItemId);
    this.orderService.updatePickingItem(pickingItemId, nextQuantity).subscribe({
      next: () => {
        this.updatingPickingItemIds.delete(pickingItemId);
        this.orderResource.reload();
        this.pickingResource.reload();
      },
      error: (error) => {
        this.updatingPickingItemIds.delete(pickingItemId);
        this.alertService.show(error?.error?.error || 'No se pudo actualizar item de picking', 'error');
      }
    });
  }

  completePickingFromDetail() {
    const orderId = this.orderId();
    if (!orderId || !this.canCompletePickingFromDetail()) return;

    this.finishingPicking = true;
    this.orderService.completeOrderPicking(orderId).subscribe({
      next: () => {
        this.finishingPicking = false;
        this.orderResource.reload();
        this.pickingResource.reload();
        this.alertService.show('Picking finalizado. El pedido quedo en estado READY.', 'success');
      },
      error: (error) => {
        this.finishingPicking = false;
        this.alertService.show(error?.error?.error || 'No se pudo finalizar picking', 'error');
      }
    });
  }

  getPrintItemDescription(item: any): string {
    const productName = item?.variant?.product?.name || 'Producto';
    const colorName = item?.variant?.color?.name || '';
    const sizeName = item?.variant?.size?.name || '';

    const details = [colorName, sizeName].filter((value: string) => value.trim().length > 0).join(' - ');
    return details ? `${productName} (${details})` : productName;
  }

  getStatusProgress(): number {
    const sequence = ['PENDING', 'CONFIRMED', 'WAITING_TRANSFER', 'PREPARING', 'READY', 'DELIVERED'];
    const currentStatus = String(this.order?.status || '');
    const index = sequence.indexOf(currentStatus);
    if (currentStatus === 'CANCELLED') return 100;
    if (currentStatus === 'RETURN_PENDING') return 90;
    if (currentStatus === 'WAITING_STOCK') return 20;
    if (index < 0) return 0;
    return Math.round(((index + 1) / sequence.length) * 100);
  }

  getTimelineEvents(): Array<{ label: string; date: Date | null; description: string }> {
    const events: Array<{ label: string; date: Date | null; description: string }> = [];
    const order = this.order;
    if (!order) return events;

    events.push({
      label: 'Orden creada',
      date: order.createdAt ? new Date(order.createdAt) : null,
      description: 'Pedido registrado en el sistema'
    });

    if (Array.isArray(order.reservations) && order.reservations.length > 0) {
      const firstReservationDate = order.reservations
        .map((reservation: any) => reservation?.createdAt ? new Date(reservation.createdAt) : null)
        .filter((value: Date | null): value is Date => value instanceof Date)
        .sort((a: Date, b: Date) => a.getTime() - b.getTime())[0];

      events.push({
        label: 'Stock reservado',
        date: firstReservationDate || null,
        description: `${order.reservations.length} reserva(s) asociada(s)`
      });
    }

    if (order.pickingSession?.createdAt) {
      events.push({
        label: 'Picking iniciado',
        date: new Date(order.pickingSession.createdAt),
        description: 'Se inicio la preparacion del pedido'
      });
    }

    if (order.pickingSession?.status === 'COMPLETED') {
      events.push({
        label: 'Picking completado',
        date: order.pickingSession.updatedAt ? new Date(order.pickingSession.updatedAt) : null,
        description: 'Productos separados completamente'
      });
    }

    if (order.status === 'READY') {
      events.push({
        label: 'Pedido listo',
        date: order.updatedAt ? new Date(order.updatedAt) : null,
        description: 'Listo para despacho/entrega'
      });
    }

    if (order.status === 'DELIVERED') {
      events.push({
        label: 'Pedido entregado',
        date: order.updatedAt ? new Date(order.updatedAt) : null,
        description: 'Entrega confirmada'
      });
    }

    if (order.status === 'RETURN_PENDING') {
      events.push({
        label: 'Cancelacion en proceso',
        date: order.returnWorkflow?.requestedAt ? new Date(order.returnWorkflow.requestedAt) : (order.updatedAt ? new Date(order.updatedAt) : null),
        description: 'Pendiente devolucion de stock'
      });
    }

    if (order.status === 'CANCELLED') {
      events.push({
        label: 'Pedido cancelado',
        date: order.updatedAt ? new Date(order.updatedAt) : null,
        description: 'Cancelacion finalizada y reservas liberadas'
      });
    }

    if (order.status !== 'CANCELLED' && order.status !== 'DELIVERED' && order.status !== 'RETURN_PENDING' && order.updatedAt) {
      events.push({
        label: `Estado actual: ${this.getStatusLabel(order.status)}`,
        date: new Date(order.updatedAt),
        description: 'Ultima actualizacion registrada'
      });
    }

    return events
      .sort((a, b) => {
        const dateA = a.date ? a.date.getTime() : 0;
        const dateB = b.date ? b.date.getTime() : 0;
        return dateA - dateB;
      });
  }

  private resolveOrderErrorMessage(rawError: unknown): string {
    const errorWithCause = rawError as { cause?: unknown };
    const error = (errorWithCause?.cause || rawError) as {
      name?: string;
      error?: { error?: string; message?: string };
      message?: string;
    };

    if (error?.name === 'TimeoutError') {
      return 'La carga del pedido excedio el tiempo de espera.';
    }

    return error?.error?.error || error?.error?.message || error?.message || 'No se pudo cargar el pedido.';
  }

  printOrder() {
    window.print();
  }

  goBack() {
    this.router.navigate(['/admin/orders/list']);
  }
}
