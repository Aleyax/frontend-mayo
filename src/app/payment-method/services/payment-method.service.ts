import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PaymentMethod, PaymentMethodListResponse } from '../interfaces/payment-method.interface';

const baseUrl = `${environment.apiUrl}/payment-methods`;

interface ListOptions {
  skip?: number;
  take?: number;
  isActive?: boolean;
  search?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PaymentMethodService {
  private readonly http = inject(HttpClient);

  list(options: ListOptions = {}): Observable<PaymentMethodListResponse> {
    const params = new URLSearchParams();
    params.set('skip', String(options.skip ?? 1));
    params.set('take', String(options.take ?? 100));
    if (options.isActive !== undefined) params.set('isActive', String(options.isActive));
    if (options.search) params.set('search', options.search);

    return this.http.get<PaymentMethodListResponse>(`${baseUrl}?${params.toString()}`).pipe(
      map((response) => ({
        ...response,
        data: Array.isArray(response?.data) ? response.data : [],
      })),
      catchError((error) => throwError(() => error)),
    );
  }

  listActive(): Observable<PaymentMethod[]> {
    return this.http.get<{ data: PaymentMethod[] }>(`${baseUrl}/active`).pipe(
      map((response) => Array.isArray(response?.data) ? response.data : []),
      catchError((error) => throwError(() => error)),
    );
  }

  create(name: string, code?: string): Observable<PaymentMethod> {
    return this.http.post<PaymentMethod>(baseUrl, { name, code }).pipe(
      catchError((error) => throwError(() => error)),
    );
  }

  update(id: number, payload: { name?: string; isActive?: boolean }): Observable<PaymentMethod> {
    return this.http.put<PaymentMethod>(`${baseUrl}/${id}`, payload).pipe(
      catchError((error) => throwError(() => error)),
    );
  }

  activate(id: number): Observable<PaymentMethod> {
    return this.update(id, { isActive: true });
  }

  deactivate(id: number): Observable<PaymentMethod> {
    return this.update(id, { isActive: false });
  }
}
