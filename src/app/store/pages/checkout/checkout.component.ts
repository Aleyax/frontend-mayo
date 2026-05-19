import { Component, OnInit, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MarketplaceCartService } from '../../services/marketplace-cart.service';
import {
  MarketplacePublicStore,
  MarketplaceService,
} from '../../services/marketplace.service';

@Component({
  selector: 'app-marketplace-checkout',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.css'
})
export class CheckoutComponent implements OnInit {
  private readonly router = inject(Router);
  readonly cartService = inject(MarketplaceCartService);
  private readonly marketplaceService = inject(MarketplaceService);

  stores: MarketplacePublicStore[] = [];
  loadingStores = false;
  submitting = false;
  errorMessage = '';

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
  readonly tax = computed(() => this.subtotal() * 0.18);
  readonly total = computed(() => this.subtotal() + this.tax());

  ngOnInit() {
    this.loadStores();
  }

  submitOrder() {
    this.errorMessage = '';

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
    if (!this.sourceStoreId) {
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

    this.submitting = true;

    this.marketplaceService.createMarketplaceOrder({
      sourceStoreId: this.sourceStoreId,
      deliveryType: this.deliveryType,
      clientName: this.clientName.trim(),
      clientPhone: this.clientPhone.trim(),
      clientEmail: this.clientEmail.trim() || undefined,
      companyName: this.companyName.trim() || undefined,
      ruc: this.ruc.trim() || undefined,
      pickupStoreId: this.deliveryType === 'PICKUP' ? this.pickupStoreId ?? undefined : undefined,
      deliveryAddress: this.deliveryType === 'DELIVERY' ? this.deliveryAddress.trim() : undefined,
      deliveryReference: this.deliveryType === 'DELIVERY' ? this.deliveryReference.trim() || undefined : undefined,
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
}

