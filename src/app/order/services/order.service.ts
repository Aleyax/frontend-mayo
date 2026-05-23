import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'WAITING_TRANSFER'
  | 'PREPARING'
  | 'READY'
  | 'DELIVERED'
  | 'RETURN_PENDING'
  | 'CANCELLED'
  | 'WAITING_STOCK';

export type OrderResponsibleRole = 'seller' | 'picker' | 'dispenser';
export type PickingResponsibilityMode = 'SHARED' | 'TRANSFER';
export type PickingResponsibilityRequestAction = 'APPROVE' | 'REJECT';
export type PickingUnpickAction = 'APPROVE' | 'REJECT';

@Injectable({
  providedIn: 'root'
})
export class OrderService {
  private readonly apiUrl = `${environment.apiUrl}/orders`;

  constructor(private http: HttpClient) {}

  // Crear pedido
  createOrder(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}`, data, { timeout: 20000 });
  }

  // Listar pedidos
  listOrders(params: any = {}): Observable<any> {
    let httpParams = new HttpParams();

    if (params.page) httpParams = httpParams.set('page', params.page);
    if (params.limit) httpParams = httpParams.set('limit', params.limit);
    if (params.status) httpParams = httpParams.set('status', params.status);
    if (params.storeId) httpParams = httpParams.set('storeId', params.storeId);
    if (params.responsibleUserId) httpParams = httpParams.set('responsibleUserId', params.responsibleUserId);
    if (params.startDate) httpParams = httpParams.set('startDate', params.startDate);
    if (params.endDate) httpParams = httpParams.set('endDate', params.endDate);
    if (params.search) httpParams = httpParams.set('search', params.search);
    if (params.channel) httpParams = httpParams.set('channel', params.channel);

    return this.http.get<any>(`${this.apiUrl}`, { params: httpParams, timeout: 10000 });
  }

  // Obtener pedido por ID
  getOrderById(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`);
  }

  // Actualizar estado del pedido
  updateOrderStatus(id: number, status: OrderStatus, note?: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/status`, {
      status,
      note
    });
  }

  // Actualizar picking del pedido
  updateOrderPicking(id: number, pickingData: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/picking`, pickingData);
  }

  // Obtener reservas de una orden
  getOrderReservations(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}/reservations`);
  }

  // Obtener picking de una orden
  getOrderPicking(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}/picking`);
  }

  // Iniciar picking de una orden
  startOrderPicking(id: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/picking/start`, {});
  }

  // Actualizar item de picking
  updatePickingItem(itemId: number, pickedQuantity: number): Observable<any> {
    return this.http.patch(`${this.apiUrl}/picking/items/${itemId}`, { pickedQuantity });
  }

  // Actualizar picking por fila de orden (orderItem)
  updatePickingOrderItem(orderId: number, orderItemId: number, pickedQuantity: number): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${orderId}/picking/order-items/${orderItemId}`, { pickedQuantity });
  }

  requestPickingUnpickAction(orderId: number, itemId: number, quantity: number, note?: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${orderId}/picking/items/${itemId}/unpick-request`, {
      quantity,
      note,
    });
  }

  resolvePickingUnpickAction(
    orderId: number,
    requestId: number,
    action: PickingUnpickAction,
    note?: string,
  ): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${orderId}/picking/unpick-requests/${requestId}`, {
      action,
      note,
    });
  }

  // Completar picking de una orden
  completeOrderPicking(id: number): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/picking/complete`, {});
  }

  // Asignar responsable
  assignResponsible(id: number, roleType: OrderResponsibleRole, userId: number): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/assign`, {
      roleType,
      userId
    });
  }

  requestPickingResponsibility(id: number, mode: PickingResponsibilityMode = 'SHARED', note?: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/picking/responsibility/request`, {
      mode,
      note,
    });
  }

  delegatePickingResponsibility(id: number, userId: number, mode: PickingResponsibilityMode = 'TRANSFER', note?: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/picking/responsibility/delegate`, {
      userId,
      mode,
      note,
    });
  }

  resolvePickingResponsibilityRequest(
    id: number,
    requestId: number,
    action: PickingResponsibilityRequestAction,
    note?: string,
  ): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/picking/responsibility/requests/${requestId}`, {
      action,
      note,
    });
  }

  // Delegar responsabilidad de devolucion
  delegateReturnResponsibility(id: number, userId: number, note?: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/return-responsibility/delegate`, {
      userId,
      note
    });
  }

  // Aceptar responsabilidad de devolucion
  acceptReturnResponsibility(id: number): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/return-responsibility/accept`, {});
  }

  // Obtener stock remoto
  getRemoteStock(variantId: number, excludeStoreId: number): Observable<any> {
    const params = new HttpParams().set('excludeStoreId', excludeStoreId);

    return this.http.get(`${this.apiUrl}/remote-stock/${variantId}`, { params });
  }

  // Obtener stock de variantes para una tienda
  getVariantStock(storeId: number, variantIds: number[]): Observable<any> {
    const params = new HttpParams()
      .set('storeId', storeId)
      .set('variantIds', variantIds.join(','));

    return this.http.get(`${this.apiUrl}/variant-stock`, { params });
  }

  // Reservar stock remoto
  reserveRemoteStock(id: number, sourceStoreId: number, variantId: number, quantity: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/reserve-remote`, {
      sourceStoreId,
      variantId,
      quantity
    });
  }
}
