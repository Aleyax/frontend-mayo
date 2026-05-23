import { Component, OnInit, computed, inject, signal } from '@angular/core';
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
  readonly igvRate = signal(0.18);
  readonly includeIgv = signal(true);
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
  readonly tax = computed(() => this.includeIgv() ? this.subtotal() * this.igvRate() : 0);
  readonly total = computed(() => this.subtotal() + this.tax());

  get igvLabel(): string {
    if (!this.includeIgv()) {
      return 'IGV (no incluido)';
    }
    return `IGV (${Math.round(this.igvRate() * 100)}%)`;
  }

  ngOnInit(): void {
    this.loadCheckoutPaymentMethods();
  }

  updateQty(cartKey: string, value: number) {
    this.cartService.updateQuantity(cartKey, value);
  }

  removeVariant(cartKey: string) {
    this.cartService.removeVariant(cartKey);
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
        this.includeIgv.set(data?.includeIgv !== false);
        this.igvRate.set(Number(data?.igvRate || 0.18));
        this.paymentMethods = Array.isArray(data?.methods) ? data.methods : [];
        this.ensureSelectedPaymentMethod();
        this.loadingPaymentMethods = false;
      },
      error: () => {
        this.paymentMethodsEnabled = false;
        this.includeIgv.set(true);
        this.igvRate.set(0.18);
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
