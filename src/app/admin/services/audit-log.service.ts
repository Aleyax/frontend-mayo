import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export type AuditLogEntry = {
  id: number;
  createdAt: string;
  actor: {
    id: number | null;
    email: string | null;
    role: string | null;
  };
  request: {
    method: string;
    path: string;
    query: unknown;
    params: unknown;
    body: unknown;
  };
  response: {
    statusCode: number;
    durationMs: number;
    isError: boolean;
  };
  context: {
    ipAddress: string | null;
    userAgent: string | null;
  };
};

export type AuditLogPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type AuditLogListResult = {
  data: AuditLogEntry[];
  pagination: AuditLogPagination;
};

export type AuditLogListFilters = {
  page?: number;
  limit?: number;
  search?: string;
  method?: string;
  statusCode?: number;
  actorUserId?: number;
  path?: string;
  startDate?: string;
  endDate?: string;
};

const baseUrl = `${environment.apiUrl}/audit-logs`;

@Injectable({
  providedIn: 'root'
})
export class AuditLogService {
  private readonly http = inject(HttpClient);

  list(filters: AuditLogListFilters = {}): Observable<AuditLogListResult> {
    let params = new HttpParams();

    if (filters.page !== undefined) params = params.set('page', String(filters.page));
    if (filters.limit !== undefined) params = params.set('limit', String(filters.limit));
    if (filters.search) params = params.set('search', filters.search);
    if (filters.method) params = params.set('method', filters.method);
    if (filters.statusCode !== undefined) params = params.set('statusCode', String(filters.statusCode));
    if (filters.actorUserId !== undefined) params = params.set('actorUserId', String(filters.actorUserId));
    if (filters.path) params = params.set('path', filters.path);
    if (filters.startDate) params = params.set('startDate', filters.startDate);
    if (filters.endDate) params = params.set('endDate', filters.endDate);

    return this.http.get<{
      success: boolean;
      data: AuditLogEntry[];
      pagination?: Partial<AuditLogPagination>;
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
