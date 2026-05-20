import { Component, OnInit, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MarketplaceCartService, MarketplaceCartItem } from '../../services/marketplace-cart.service';
import { MarketplaceCheckoutPaymentMethod } from '../../interfaces/marketplace.interface';
import { MarketplaceService } from '../../services/marketplace.service';

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
export class CartComponent implements OnInit {
  private readonly router = inject(Router);
  readonly cartService = inject(MarketplaceCartService);
  private readonly marketplaceService = inject(MarketplaceService);
  readonly taxRate = 0.18;
  paymentMethodsEnabled = false;
  loadingPaymentMethods = false;
  paymentMethods: MarketplaceCheckoutPaymentMethod[] = [];

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

  ngOnInit(): void {
    this.loadCheckoutPaymentMethods();
  }

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

  selectPaymentMethod(paymentMethodId: number) {
    this.cartService.setSelectedPaymentMethodId(paymentMethodId);
  }

  isPaymentMethodSelected(paymentMethodId: number): boolean {
    return Number(this.cartService.selectedPaymentMethodId()) === Number(paymentMethodId);
  }

  hasPendingConfirmation(item: MarketplaceCartItem): boolean {
    return Number(item.quantity || 0) > Number(item.availableStock || 0);
  }

  getAvailabilityMessage(item: MarketplaceCartItem): string {
    if (this.hasPendingConfirmation(item)) {
      return 'Cantidad sujeta a confirmacion';
    }

    const availableStock = Number(item.availableStock || 0);
    if (availableStock > 0 && availableStock < 3) {
      return 'Por agotarse';
    }

    return 'Disponible para reserva inmediata';
  }

  private loadCheckoutPaymentMethods() {
    this.loadingPaymentMethods = true;
    this.marketplaceService.getCheckoutPaymentMethods().subscribe({
      next: (response) => {
        const data = response?.data;
        this.paymentMethodsEnabled = data?.enabled === true;
        this.paymentMethods = Array.isArray(data?.methods) ? data.methods : [];
        this.ensureSelectedPaymentMethod();
        this.loadingPaymentMethods = false;
      },
      error: () => {
        this.paymentMethodsEnabled = false;
        this.paymentMethods = [];
        this.loadingPaymentMethods = false;
      },
    });
  }

  private ensureSelectedPaymentMethod() {
    if (!this.paymentMethodsEnabled || this.paymentMethods.length === 0) {
      this.cartService.setSelectedPaymentMethodId(null);
      return;
    }

    const selected = Number(this.cartService.selectedPaymentMethodId() || 0);
    const stillExists = this.paymentMethods.some((method) => Number(method.id) === selected);
    if (!stillExists) {
      this.cartService.setSelectedPaymentMethodId(this.paymentMethods[0].id);
    }
  }
}
