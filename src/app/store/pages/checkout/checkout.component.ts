import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MarketplaceCartService } from '../../services/marketplace-cart.service';
import { MarketplaceCheckoutPaymentMethod } from '../../interfaces/marketplace.interface';
import { MarketplacePublicStore, MarketplaceService } from '../../services/marketplace.service';
import { MarketplaceAuthService } from '../../services/marketplace-auth.service';

@Component({
  selector: 'app-marketplace-checkout',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.css'
})
export class CheckoutComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly marketplaceAuthService = inject(MarketplaceAuthService);
  readonly cartService = inject(MarketplaceCartService);
  private readonly marketplaceService = inject(MarketplaceService);

  stores: MarketplacePublicStore[] = [];
  loadingStores = false;
  loadingPaymentMethods = false;
  submitting = false;
  errorMessage = '';
  readonly includeIgv = signal(true);
  readonly igvRate = signal(0.18);
  paymentMethodsEnabled = false;
  paymentMethods: MarketplaceCheckoutPaymentMethod[] = [];
  selectedPaymentMethodId: number | null = null;
  showGuestRegistrationPrompt = false;
  guestCheckoutConfirmed = false;

  clientName = '';
  clientPhone = '';
  clientEmail = '';
  companyName = '';
  ruc = '';
  note = '';

  deliveryType: 'PICKUP' | 'DELIVERY' = 'PICKUP';
  sourceStoreId: number | null = null;
  pickupStoreId: number | null = null;
  deliveryAddress = '';
  deliveryReference = '';

  readonly subtotal = computed(() => this.cartService.subtotal());
  readonly tax = computed(() => this.includeIgv() ? this.subtotal() * this.igvRate() : 0);
  readonly total = computed(() => this.subtotal() + this.tax());

  get igvLabel(): string {
    if (!this.includeIgv()) {
      return 'IGV (no incluido)';
    }
    return `IGV (${Math.round(this.igvRate() * 100)}%)`;
  }

  ngOnInit() {
    this.prefillCustomerFromSession();
    this.loadStores();
    this.loadCheckoutPaymentMethods();
  }

  submitOrder() {
    this.errorMessage = '';
    this.showGuestRegistrationPrompt = false;
    const sourceStoreIdToUse = this.deliveryType === 'PICKUP'
      ? (this.pickupStoreId ?? this.sourceStoreId)
      : this.sourceStoreId;

    if (!this.marketplaceAuthService.isAuthenticated() && !this.guestCheckoutConfirmed) {
      this.showGuestRegistrationPrompt = true;
      return;
    }

    if (this.cartService.items().length === 0) {
      this.errorMessage = 'Tu carrito esta vacio.';
      return;
    }
    if (!this.clientName.trim()) {
      this.errorMessage = 'El nombre es obligatorio.';
      return;
    }
    if (!this.clientPhone.trim()) {
      this.errorMessage = 'El telefono es obligatorio.';
      return;
    }
    if (!sourceStoreIdToUse) {
      this.errorMessage = 'No hay tienda configurada para procesar el pedido.';
      return;
    }
    if (this.deliveryType === 'DELIVERY' && !this.deliveryAddress.trim()) {
      this.errorMessage = 'La direccion es obligatoria para delivery.';
      return;
    }
    if (this.deliveryType === 'PICKUP' && !this.pickupStoreId) {
      this.errorMessage = 'Selecciona la tienda de recojo.';
      return;
    }
    if (this.paymentMethodsEnabled && this.paymentMethods.length === 0) {
      this.errorMessage = 'No hay metodos de pago disponibles para este marketplace.';
      return;
    }
    if (this.paymentMethodsEnabled && !this.selectedPaymentMethodId) {
      this.errorMessage = 'Selecciona un metodo de pago.';
      return;
    }

    this.submitting = true;

    this.marketplaceService.createMarketplaceOrder({
      sourceStoreId: sourceStoreIdToUse,
      deliveryType: this.deliveryType,
      clientName: this.clientName.trim(),
      clientPhone: this.clientPhone.trim(),
      clientEmail: this.clientEmail.trim() || undefined,
      companyName: this.companyName.trim() || undefined,
      ruc: this.ruc.trim() || undefined,
      pickupStoreId: this.deliveryType === 'PICKUP' ? this.pickupStoreId ?? undefined : undefined,
      deliveryAddress: this.deliveryType === 'DELIVERY' ? this.deliveryAddress.trim() : undefined,
      deliveryReference: this.deliveryType === 'DELIVERY' ? this.deliveryReference.trim() || undefined : undefined,
      paymentMethodId: this.paymentMethodsEnabled ? this.selectedPaymentMethodId ?? undefined : undefined,
      note: this.note.trim() || undefined,
      items: this.cartService.items().map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    }).subscribe({
      next: (response) => {
        const code = response?.data?.code;
        this.cartService.clear();
        this.cartService.setSelectedPaymentMethodId(this.selectedPaymentMethodId);
        if (code) {
          this.router.navigate(['/marketplace/order-confirmation', code]);
          return;
        }
        this.router.navigate(['/marketplace']);
      },
      error: (error) => {
        this.errorMessage = error?.error?.message || 'No se pudo registrar el pedido.';
        this.submitting = false;
      },
    });
  }

  selectPaymentMethod(paymentMethodId: number) {
    this.selectedPaymentMethodId = paymentMethodId;
    this.cartService.setSelectedPaymentMethodId(paymentMethodId);
  }

  isPaymentMethodSelected(paymentMethodId: number): boolean {
    return Number(this.selectedPaymentMethodId) === Number(paymentMethodId);
  }

  goToRegister() {
    this.router.navigate(['/marketplace/auth'], {
      queryParams: {
        returnUrl: '/marketplace/checkout',
      },
    });
  }

  continueAsGuest() {
    this.guestCheckoutConfirmed = true;
    this.showGuestRegistrationPrompt = false;
    this.submitOrder();
  }

  private loadStores() {
    this.loadingStores = true;
    this.marketplaceService.getStores().subscribe({
      next: (response) => {
        this.stores = response?.data ?? [];
        if (this.stores.length > 0) {
          const primaryStoreId = this.stores[0]?.id ?? null;
          this.sourceStoreId = primaryStoreId;
          this.pickupStoreId = primaryStoreId;
        }
        this.loadingStores = false;
      },
      error: () => {
        this.loadingStores = false;
      },
    });
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
        this.syncSelectedPaymentMethod();
        this.loadingPaymentMethods = false;
      },
      error: () => {
        this.includeIgv.set(true);
        this.igvRate.set(0.18);
        this.paymentMethodsEnabled = false;
        this.paymentMethods = [];
        this.selectedPaymentMethodId = null;
        this.loadingPaymentMethods = false;
      },
    });
  }

  private syncSelectedPaymentMethod() {
    if (!this.paymentMethodsEnabled || this.paymentMethods.length === 0) {
      this.selectedPaymentMethodId = null;
      this.cartService.setSelectedPaymentMethodId(null);
      return;
    }

    const preferredId = Number(this.cartService.selectedPaymentMethodId() || 0);
    const resolvedId = this.paymentMethods.some((method) => Number(method.id) === preferredId)
      ? preferredId
      : this.paymentMethods[0].id;

    this.selectedPaymentMethodId = resolvedId;
    this.cartService.setSelectedPaymentMethodId(resolvedId);
  }

  private prefillCustomerFromSession() {
    if (!this.marketplaceAuthService.isAuthenticated()) {
      return;
    }

    const currentUser = this.marketplaceAuthService.getCurrentUser();
    if (!currentUser) {
      return;
    }

    if (!this.clientName.trim()) {
      this.clientName = `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim();
    }
    if (!this.clientPhone.trim()) {
      this.clientPhone = currentUser.phone || '';
    }
    if (!this.clientEmail.trim()) {
      this.clientEmail = currentUser.email || '';
    }
  }
}
