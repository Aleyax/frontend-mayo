import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MarketplaceCartService, MarketplaceCartItem } from '../../services/marketplace-cart.service';

interface GroupedCartProduct {
  productId: number;
  productName: string;
  productImageUrl?: string | null;
  items: MarketplaceCartItem[];
}

@Component({
  selector: 'app-marketplace-cart',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './cart.component.html',
  styleUrl: './cart.component.css'
})
export class CartComponent {
  private readonly router = inject(Router);
  readonly cartService = inject(MarketplaceCartService);
  readonly taxRate = 0.18;

  readonly groupedProducts = computed(() => {
    const groups = new Map<number, GroupedCartProduct>();
    this.cartService.items().forEach((item) => {
      const current = groups.get(item.productId) || {
        productId: item.productId,
        productName: item.productName,
        productImageUrl: item.productImageUrl,
        items: [],
      };
      current.items.push(item);
      groups.set(item.productId, current);
    });
    return Array.from(groups.values());
  });

  readonly subtotal = computed(() => this.cartService.subtotal());
  readonly tax = computed(() => this.subtotal() * this.taxRate);
  readonly total = computed(() => this.subtotal() + this.tax());

  updateQty(variantId: number, value: number) {
    this.cartService.updateQuantity(variantId, value);
  }

  removeVariant(variantId: number) {
    this.cartService.removeVariant(variantId);
  }

  clearAll() {
    this.cartService.clear();
  }

  goCheckout() {
    if (this.cartService.items().length === 0) {
      return;
    }
    this.router.navigate(['/marketplace/checkout']);
  }
}

