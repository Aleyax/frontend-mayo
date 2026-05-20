import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

export type OrderWorkflowSettings = {
  returnResponsibilityManagementEnabled: boolean;
  marketplacePaymentMethodsEnabled: boolean;
  marketplacePaymentMethodIds: number[];
};

const baseUrl = `${environment.apiUrl}/system-config`;

@Injectable({
  providedIn: 'root'
})
export class SystemConfigService {
  private readonly http = inject(HttpClient);

  getOrderWorkflowSettings(): Observable<OrderWorkflowSettings> {
    return this.http.get<{ data: OrderWorkflowSettings }>(`${baseUrl}/order-workflow`).pipe(
      map((response) => ({
        returnResponsibilityManagementEnabled:
          response?.data?.returnResponsibilityManagementEnabled !== false,
        marketplacePaymentMethodsEnabled:
          response?.data?.marketplacePaymentMethodsEnabled === true,
        marketplacePaymentMethodIds:
          Array.isArray(response?.data?.marketplacePaymentMethodIds)
            ? response.data.marketplacePaymentMethodIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0)
            : [],
      })),
      catchError((error) => throwError(() => error)),
    );
  }

  updateOrderWorkflowSettings(payload: {
    returnResponsibilityManagementEnabled: boolean;
    marketplacePaymentMethodsEnabled: boolean;
    marketplacePaymentMethodIds: number[];
  }): Observable<OrderWorkflowSettings> {
    return this.http.patch<{ data: OrderWorkflowSettings }>(`${baseUrl}/order-workflow`, {
      returnResponsibilityManagementEnabled: payload.returnResponsibilityManagementEnabled,
      marketplacePaymentMethodsEnabled: payload.marketplacePaymentMethodsEnabled,
      marketplacePaymentMethodIds: payload.marketplacePaymentMethodIds,
    }).pipe(
      map((response) => ({
        returnResponsibilityManagementEnabled:
          response?.data?.returnResponsibilityManagementEnabled !== false,
        marketplacePaymentMethodsEnabled:
          response?.data?.marketplacePaymentMethodsEnabled === true,
        marketplacePaymentMethodIds:
          Array.isArray(response?.data?.marketplacePaymentMethodIds)
            ? response.data.marketplacePaymentMethodIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0)
            : [],
      })),
      catchError((error) => throwError(() => error)),
    );
  }
}
