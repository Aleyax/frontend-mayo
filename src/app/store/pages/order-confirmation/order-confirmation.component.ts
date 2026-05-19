import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { map, of } from 'rxjs';
import { MarketplaceOrderSummary } from '../../interfaces/marketplace.interface';
import { MarketplaceService } from '../../services/marketplace.service';

@Component({
  selector: 'app-marketplace-order-confirmation',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './order-confirmation.component.html',
  styleUrl: './order-confirmation.component.css'
})
export class OrderConfirmationComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly marketplaceService = inject(MarketplaceService);
  private readonly orderCode = signal<string | null>(null);
  private readonly invalidCodeMessage = signal('');
  private readonly orderResource = rxResource<MarketplaceOrderSummary | null, string | undefined>({
    params: () => this.orderCode() ?? undefined,
    stream: ({ params }) => {
      if (!params) return of(null);
      return this.marketplaceService.getOrderByCode(params).pipe(
        map((response) => response?.data ?? null),
      );
    },
    defaultValue: null,
  });

  readonly order = computed(() => this.orderResource.value());
  readonly loading = computed(() => this.orderResource.isLoading());
  readonly errorMessage = computed(() => {
    const invalid = this.invalidCodeMessage();
    if (invalid) return invalid;
    const resourceError = this.orderResource.error() as { error?: { message?: string }; message?: string } | undefined;
    if (!resourceError) return '';
    return resourceError.error?.message || resourceError.message || 'No se pudo cargar la confirmacion del pedido.';
  });

  ngOnInit() {
    this.route.paramMap.subscribe((params) => {
      const code = params.get('code');
      if (!code) {
        this.invalidCodeMessage.set('Codigo de pedido invalido.');
        this.orderCode.set(null);
        return;
      }
      this.invalidCodeMessage.set('');
      this.orderCode.set(code.trim().toUpperCase());
    });
  }
}
