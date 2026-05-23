import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export type UserActivityProduct = {
  variantId: number;
  sku: string | null;
  productName: string | null;
  color: string | null;
  size: string | null;
  quantity: number | null;
};

export type UserActivityEntry = {
  id: number;
  createdAt: string;
  user: {
    id: number | null;
    email: string | null;
    role: string | null;
  };
  module: string;
  actionType: string;
  actionLabel: string;
  entity: {
    type: string;
    id: number | null;
    code: string | null;
  };
  description: string | null;
  products: UserActivityProduct[];
  context: Record<string, unknown>;
};

export type UserActivityPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type UserActivityListResult = {
  data: UserActivityEntry[];
  pagination: UserActivityPagination;
};

export type UserActivityListFilters = {
  page?: number;
  limit?: number;
  search?: string;
  userId?: number;
  module?: string;
  actionType?: string;
  entityType?: string;
  startDate?: string;
  endDate?: string;
};

const baseUrl = `${environment.apiUrl}/user-activities`;

@Injectable({
  providedIn: 'root'
})
export class UserActivityService {
  private readonly http = inject(HttpClient);

  list(filters: UserActivityListFilters = {}): Observable<UserActivityListResult> {
    let params = new HttpParams();

    if (filters.page !== undefined) params = params.set('page', String(filters.page));
    if (filters.limit !== undefined) params = params.set('limit', String(filters.limit));
    if (filters.search) params = params.set('search', filters.search);
    if (filters.userId !== undefined) params = params.set('userId', String(filters.userId));
    if (filters.module) params = params.set('module', filters.module);
    if (filters.actionType) params = params.set('actionType', filters.actionType);
    if (filters.entityType) params = params.set('entityType', filters.entityType);
    if (filters.startDate) params = params.set('startDate', filters.startDate);
    if (filters.endDate) params = params.set('endDate', filters.endDate);

    return this.http.get<{
      success: boolean;
      data: UserActivityEntry[];
      pagination?: Partial<UserActivityPagination>;
    }>(baseUrl, { params }).pipe(
      map((response) => ({
        data: Array.isArray(response?.data) ? response.data : [],
        pagination: {
          page: Number(response?.pagination?.page || filters.page || 1),
          limit: Number(response?.pagination?.limit || filters.limit || 20),
          total: Number(response?.pagination?.total || 0),
          totalPages: Number(response?.pagination?.totalPages || 0),
        },
      })),
    );
  }
}
