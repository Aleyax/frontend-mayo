import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { OrderService } from '../services/order.service';
import { UserService } from '../../shared/services/user.service';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, timeout } from 'rxjs';

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
  private readonly userService = inject(UserService);

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

  private readonly lastAutoPrintedOrderId = signal<number | null>(null);

  readonly orderResource = rxResource<any, number | undefined>({
    params: () => this.orderId(),
    stream: ({ params }) =>
      this.orderService.getOrderById(params).pipe(
        timeout(12000),
        map((response: any) => response?.data || response)
      )
  });

  readonly usersResource = rxResource<any[], true>({
    params: () => true,
    defaultValue: [],
    stream: () =>
      this.userService.getUsers().pipe(
        catchError((error) => {
          console.error('Error loading users:', error);
          return of([]);
        })
      )
  });

  statusForm!: FormGroup;
  assignForm!: FormGroup;

  showStatusModal = false;
  showAssignModal = false;
  showDeliverModal = false;

  orderStatusLabels: Record<string, string> = {
    PENDING: 'Pendiente',
    CONFIRMED: 'Confirmado',
    WAITING_TRANSFER: 'Esperando Transferencia',
    PREPARING: 'Preparando',
    READY: 'Listo',
    DELIVERED: 'Entregado',
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
    DELIVERED: [],
    CANCELLED: []
  };

  constructor() {
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
    return this.orderResource.value();
  }

  get loading(): boolean {
    return this.orderResource.isLoading();
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

  initializeForms() {
    this.statusForm = this.fb.group({
      status: ['', Validators.required],
      note: ['']
    });

    this.assignForm = this.fb.group({
      roleType: ['', Validators.required],
      userId: ['', Validators.required]
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
    this.orderService.updateOrderStatus(orderId, status, note).subscribe(
      () => {
        alert('Estado actualizado exitosamente');
        this.showStatusModal = false;
        this.orderResource.reload();
      },
      (error) => {
        alert(`Error: ${error.error?.error || 'Error al actualizar estado'}`);
      }
    );
  }

  openAssignModal() {
    this.assignForm.reset();
    this.showAssignModal = true;
  }

  submitAssign() {
    const orderId = this.orderId();
    if (!this.assignForm.valid || !orderId) {
      return;
    }

    const { roleType, userId } = this.assignForm.value;
    this.orderService.assignResponsible(orderId, roleType, userId).subscribe(
      () => {
        alert('Responsable asignado exitosamente');
        this.showAssignModal = false;
        this.orderResource.reload();
      },
      (error) => {
        alert(`Error: ${error.error?.error || 'Error al asignar responsable'}`);
      }
    );
  }

  openDeliverModal() {
    if (this.order?.status === 'READY') {
      this.showDeliverModal = true;
    } else {
      alert('El pedido debe estar en estado READY para entregarlo');
    }
  }

  submitDeliver() {
    const orderId = this.orderId();
    if (!orderId) return;

    this.orderService.updateOrderStatus(orderId, 'DELIVERED', 'Pedido entregado').subscribe(
      () => {
        alert('Pedido entregado exitosamente');
        this.showDeliverModal = false;
        this.orderResource.reload();
      },
      (error) => {
        alert(`Error: ${error.error?.error || 'Error al entregar pedido'}`);
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
    if (status === 'ACTIVE') return 'Activa';
    if (status === 'RELEASED') return 'Liberada';
    if (status === 'COMPLETED') return 'Consumida';
    return status || '-';
  }

  getStatusProgress(): number {
    const sequence = ['PENDING', 'CONFIRMED', 'WAITING_TRANSFER', 'PREPARING', 'READY', 'DELIVERED'];
    const currentStatus = String(this.order?.status || '');
    const index = sequence.indexOf(currentStatus);
    if (currentStatus === 'CANCELLED') return 100;
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

    if (order.status === 'CANCELLED') {
      events.push({
        label: 'Pedido cancelado',
        date: order.updatedAt ? new Date(order.updatedAt) : null,
        description: 'Reservas liberadas automaticamente'
      });
    }

    if (order.status !== 'CANCELLED' && order.status !== 'DELIVERED' && order.updatedAt) {
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
