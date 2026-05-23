import { Injectable, computed, signal } from '@angular/core';
import { MarketplaceCatalogProduct, MarketplaceProductVariant } from '../interfaces/marketplace.interface';

export interface MarketplaceCartItem {
  cartKey: string;
  productId: number;
  productName: string;
  productImageUrl?: string | null;
  displayVariantId: number;
  variantId: number;
  sourceVariantId?: number;
  isVirtualMarketplaceVariant?: boolean;
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
  private readonly storageKey = 'marketplace_wholesale_cart_v2';
  private readonly paymentMethodStorageKey = 'marketplace_wholesale_checkout_payment_method_id_v1';
  readonly items = signal<MarketplaceCartItem[]>(this.loadInitialItems());
  readonly selectedPaymentMethodId = signal<number | null>(this.loadInitialPaymentMethodId());

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
        const cartKey = this.buildCartKey(variant);
        const sourceVariantId = Number(variant.sourceVariantId || variant.id);
        const idx = next.findIndex((item) => String(item.cartKey) === cartKey);
        if (idx >= 0) {
          const merged = { ...next[idx] };
          merged.quantity += quantity;
          merged.availableStock = Number(variant.availableStock || 0);
          merged.unitPrice = Number(variant.price || merged.unitPrice || 0);
          next[idx] = merged;
          return;
        }

        next.push({
          cartKey,
          productId: product.id,
          productName: product.name,
          productImageUrl: variant.imageUrl || product.imageUrl || null,
          displayVariantId: Number(variant.id),
          variantId: sourceVariantId,
          sourceVariantId,
          isVirtualMarketplaceVariant: variant.isVirtualMarketplaceVariant === true,
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

  updateQuantity(cartKey: string, quantity: number) {
    this.items.update((current) => {
      const sanitized = Math.max(0, Math.floor(Number(quantity || 0)));
      if (sanitized === 0) {
        return current.filter((item) => String(item.cartKey) !== String(cartKey));
      }
      return current.map((item) =>
        String(item.cartKey) === String(cartKey)
          ? { ...item, quantity: sanitized }
          : item,
      );
    });
    this.persist();
  }

  removeVariant(cartKey: string) {
    this.items.update((current) => current.filter((item) => String(item.cartKey) !== String(cartKey)));
    this.persist();
  }

  clear() {
    this.items.set([]);
    this.persist();
  }

  setSelectedPaymentMethodId(paymentMethodId: number | null) {
    const normalizedId = Number(paymentMethodId);
    if (!Number.isInteger(normalizedId) || normalizedId < 1) {
      this.selectedPaymentMethodId.set(null);
      this.persistPaymentMethod();
      return;
    }

    this.selectedPaymentMethodId.set(normalizedId);
    this.persistPaymentMethod();
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
          cartKey: String(item.cartKey || `legacy-${item.variantId}-${item.colorName || ''}-${item.sizeName || ''}`),
          displayVariantId: Number(item.displayVariantId || item.variantId),
          sourceVariantId: Number(item.sourceVariantId || item.variantId),
          isVirtualMarketplaceVariant: item.isVirtualMarketplaceVariant === true,
          quantity: Math.max(1, Math.floor(Number(item.quantity || 1))),
          unitPrice: Number(item.unitPrice || 0),
          availableStock: Number(item.availableStock || 0),
        }));
    } catch {
      return [];
    }
  }

  private buildCartKey(variant: MarketplaceProductVariant): string {
    const variantId = Number(variant.id || 0);
    const sourceVariantId = Number(variant.sourceVariantId || variant.id || 0);
    if (variant.isVirtualMarketplaceVariant) {
      return `virtual-${sourceVariantId}-${variantId}`;
    }
    return `variant-${variantId}`;
  }

  private loadInitialPaymentMethodId(): number | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(this.paymentMethodStorageKey);
      if (!raw) return null;

      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 1) {
        return null;
      }
      return parsed;
    } catch {
      return null;
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

  private persistPaymentMethod() {
    if (typeof window === 'undefined') return;
    try {
      const value = this.selectedPaymentMethodId();
      if (!value || value < 1) {
        window.localStorage.removeItem(this.paymentMethodStorageKey);
        return;
      }

      window.localStorage.setItem(this.paymentMethodStorageKey, String(value));
    } catch {
      // noop
    }
  }
}
