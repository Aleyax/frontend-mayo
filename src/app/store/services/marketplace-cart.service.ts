import { Injectable, computed, signal } from '@angular/core';
import { MarketplaceCatalogProduct, MarketplaceProductVariant } from '../interfaces/marketplace.interface';

export interface MarketplaceCartItem {
  productId: number;
  productName: string;
  productImageUrl?: string | null;
  variantId: number;
  sku: string;
  colorName: string;
  sizeName: string;
  unitPrice: number;
  quantity: number;
  availableStock: number;
}

@Injectable({
  providedIn: 'root',
})
export class MarketplaceCartService {
  private readonly storageKey = 'marketplace_wholesale_cart_v1';
  readonly items = signal<MarketplaceCartItem[]>(this.loadInitialItems());

  readonly totalUnits = computed(() =>
    this.items().reduce((sum, item) => sum + Number(item.quantity || 0), 0),
  );

  readonly subtotal = computed(() =>
    this.items().reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0),
  );

  readonly pendingUnits = computed(() =>
    this.items().reduce((sum, item) => {
      const pending = Math.max(0, Number(item.quantity || 0) - Number(item.availableStock || 0));
      return sum + pending;
    }, 0),
  );

  addVariants(product: MarketplaceCatalogProduct, selections: Array<{ variant: MarketplaceProductVariant; quantity: number }>) {
    if (!selections.length) {
      return;
    }

    this.items.update((current) => {
      const next = [...current];

      selections.forEach(({ variant, quantity }) => {
        if (!quantity || quantity < 1) return;
        const idx = next.findIndex((item) => Number(item.variantId) === Number(variant.id));
        if (idx >= 0) {
          const merged = { ...next[idx] };
          merged.quantity += quantity;
          merged.availableStock = Number(variant.availableStock || 0);
          merged.unitPrice = Number(variant.price || merged.unitPrice || 0);
          next[idx] = merged;
          return;
        }

        next.push({
          productId: product.id,
          productName: product.name,
          productImageUrl: variant.imageUrl || product.imageUrl || null,
          variantId: variant.id,
          sku: variant.sku || 'SIN-SKU',
          colorName: variant.color?.name || 'Unico',
          sizeName: variant.size?.name || 'Unica',
          unitPrice: Number(variant.price || 0),
          quantity,
          availableStock: Number(variant.availableStock || 0),
        });
      });

      return next;
    });

    this.persist();
  }

  updateQuantity(variantId: number, quantity: number) {
    this.items.update((current) => {
      const sanitized = Math.max(0, Math.floor(Number(quantity || 0)));
      if (sanitized === 0) {
        return current.filter((item) => Number(item.variantId) !== Number(variantId));
      }
      return current.map((item) =>
        Number(item.variantId) === Number(variantId)
          ? { ...item, quantity: sanitized }
          : item,
      );
    });
    this.persist();
  }

  removeVariant(variantId: number) {
    this.items.update((current) => current.filter((item) => Number(item.variantId) !== Number(variantId)));
    this.persist();
  }

  clear() {
    this.items.set([]);
    this.persist();
  }

  private loadInitialItems(): MarketplaceCartItem[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as MarketplaceCartItem[];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item) => Number(item.variantId) > 0 && Number(item.quantity) > 0)
        .map((item) => ({
          ...item,
          quantity: Math.max(1, Math.floor(Number(item.quantity || 1))),
          unitPrice: Number(item.unitPrice || 0),
          availableStock: Number(item.availableStock || 0),
        }));
    } catch {
      return [];
    }
  }

  private persist() {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(this.items()));
    } catch {
      // noop
    }
  }
}

