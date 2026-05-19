import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  MarketplaceCatalogProduct,
  MarketplaceCatalogResponse,
  MarketplaceOrderSummary,
  MarketplaceTrackResponse,
} from '../interfaces/marketplace.interface';

export interface PublicProductFilters {
  skip?: number;
  take?: number;
  search?: string;
  categoryId?: number;
  colorId?: number;
  sizeId?: number;
  inStock?: boolean;
  allowBackorder?: boolean;
}

export interface MarketplacePublicStore {
  id: number;
  name: string;
  code: string;
  type: 'STORE' | 'WAREHOUSE';
}

export interface MarketplaceCheckoutPayload {
  sourceStoreId: number;
  deliveryType: 'PICKUP' | 'DELIVERY';
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  companyName?: string;
  ruc?: string;
  pickupStoreId?: number;
  deliveryAddress?: string;
  deliveryReference?: string;
  note?: string;
  items: Array<{
    variantId: number;
    quantity: number;
    unitPrice?: number;
  }>;
}

@Injectable({
  providedIn: 'root',
})
export class MarketplaceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/public`;

  getProducts(filters: PublicProductFilters = {}): Observable<MarketplaceCatalogResponse> {
    let params = new HttpParams()
      .set('skip', String(filters.skip ?? 1))
      .set('take', String(filters.take ?? 30));

    if (filters.search) params = params.set('search', filters.search);
    if (filters.categoryId) params = params.set('categoryId', String(filters.categoryId));
    if (filters.colorId) params = params.set('colorId', String(filters.colorId));
    if (filters.sizeId) params = params.set('sizeId', String(filters.sizeId));
    if (filters.inStock !== undefined) params = params.set('inStock', String(filters.inStock));
    if (filters.allowBackorder !== undefined) params = params.set('allowBackorder', String(filters.allowBackorder));

    return this.http.get<MarketplaceCatalogResponse>(`${this.baseUrl}/products`, { params });
  }

  getProductById(id: number): Observable<MarketplaceCatalogProduct> {
    return this.http.get<MarketplaceCatalogProduct>(`${this.baseUrl}/products/${id}`);
  }

  getStores(): Observable<{ data: MarketplacePublicStore[] }> {
    return this.http.get<{ data: MarketplacePublicStore[] }>(`${this.baseUrl}/stores`);
  }

  createMarketplaceOrder(payload: MarketplaceCheckoutPayload): Observable<{ success: boolean; data: any; message: string }> {
    return this.http.post<{ success: boolean; data: any; message: string }>(`${this.baseUrl}/orders`, payload);
  }

  getOrderByCode(code: string): Observable<{ success: boolean; data: MarketplaceOrderSummary }> {
    return this.http.get<{ success: boolean; data: MarketplaceOrderSummary }>(`${this.baseUrl}/orders/${code}`);
  }

  trackOrder(code: string, phone: string): Observable<{ success: boolean; data: MarketplaceTrackResponse }> {
    const params = new HttpParams().set('code', code).set('phone', phone);
    return this.http.get<{ success: boolean; data: MarketplaceTrackResponse }>(`${this.baseUrl}/orders/track`, { params });
  }
}
