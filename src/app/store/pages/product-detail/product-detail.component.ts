import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { MarketplaceCatalogProduct, MarketplaceProductVariant } from '../../interfaces/marketplace.interface';
import { MarketplaceService } from '../../services/marketplace.service';
import { MarketplaceCartService } from '../../services/marketplace-cart.service';

@Component({
  selector: 'app-marketplace-product-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './product-detail.component.html',
  styleUrl: './product-detail.component.css'
})
export class ProductDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly marketplaceService = inject(MarketplaceService);
  private readonly cartService = inject(MarketplaceCartService);
  private readonly productId = signal<number | null>(null);
  private readonly invalidProductMessage = signal('');
  private readonly addToCartMessage = signal('');
  private readonly selectedImageOverride = signal('');
  private readonly quantityVersion = signal(0);
  private readonly productResource = rxResource<MarketplaceCatalogProduct | null, number | undefined>({
    params: () => this.productId() ?? undefined,
    stream: ({ params }) => {
      if (!params) return of(null);
      return this.marketplaceService.getProductById(params);
    },
    defaultValue: null,
  });

  readonly product = computed(() => this.productResource.value());
  readonly loading = computed(() => this.productResource.isLoading());
  readonly errorMessage = computed(() => {
    const invalidMessage = this.invalidProductMessage();
    if (invalidMessage) return invalidMessage;
    const resourceError = this.productResource.error() as { message?: string } | undefined;
    return resourceError ? (resourceError.message || 'No pudimos cargar este producto.') : '';
  });
  readonly selectedImageUrl = computed(() => {
    const product = this.product();
    if (!product) return '';
    const manualSelection = this.selectedImageOverride();
    if (manualSelection) return manualSelection;
    return product.imageUrl || product.images?.[0]?.url || '';
  });
  readonly footerMessage = computed(() => this.addToCartMessage());

  readonly quantityByVariant = new Map<number, number>();

  readonly totalSelectedUnits = computed(() => {
    this.quantityVersion();
    return Array.from(this.quantityByVariant.values()).reduce((sum, qty) => sum + Number(qty || 0), 0);
  });

  readonly estimatedSubtotal = computed(() => {
    this.quantityVersion();
    const product = this.product();
    if (!product) return 0;
    return product.variants.reduce((sum, variant) => {
      const qty = Number(this.quantityByVariant.get(variant.id) || 0);
      return sum + (qty * Number(variant.price || 0));
    }, 0);
  });

  ngOnInit() {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      this.addToCartMessage.set('');
      this.selectedImageOverride.set('');
      this.quantityByVariant.clear();
      this.bumpQuantityVersion();

      if (!Number.isInteger(id) || id < 1) {
        this.invalidProductMessage.set('Producto invalido.');
        this.productId.set(null);
        return;
      }
      this.invalidProductMessage.set('');
      this.productId.set(id);
    });
  }

  get colorGroups(): Array<{ colorName: string; colorHex?: string | null; variants: MarketplaceProductVariant[] }> {
    const product = this.product();
    if (!product) return [];
    const groups = new Map<string, { colorName: string; colorHex?: string | null; variants: MarketplaceProductVariant[] }>();
    product.variants.forEach((variant) => {
      const colorName = variant.color?.name || 'Unico';
      const current = groups.get(colorName) || {
        colorName,
        colorHex: variant.color?.hex || null,
        variants: [],
      };
      current.variants.push(variant);
      groups.set(colorName, current);
    });

    return Array.from(groups.values()).map((group) => ({
      ...group,
      variants: [...group.variants].sort((a, b) =>
        (a.size?.name || 'Unica').localeCompare(b.size?.name || 'Unica'),
      ),
    }));
  }

  get sizeColumns(): string[] {
    const product = this.product();
    if (!product) return [];
    const unique = new Set<string>();
    product.variants.forEach((variant) => unique.add(variant.size?.name || 'Unica'));
    return Array.from(unique.values());
  }

  get colorRows(): string[] {
    const product = this.product();
    if (!product) return [];
    const unique = new Set<string>();
    product.variants.forEach((variant) => unique.add(variant.color?.name || 'Unico'));
    return Array.from(unique.values());
  }

  get cartUnits() {
    return this.cartService.totalUnits();
  }

  getVariantByMatrix(colorName: string, sizeName: string): MarketplaceProductVariant | undefined {
    const product = this.product();
    if (!product) return undefined;
    return product.variants.find((variant) => {
      const variantColor = variant.color?.name || 'Unico';
      const variantSize = variant.size?.name || 'Unica';
      return variantColor === colorName && variantSize === sizeName;
    });
  }

  getVariantQty(variantId: number): number {
    return Number(this.quantityByVariant.get(variantId) || 0);
  }

  setVariantQty(variantId: number, value: number) {
    const sanitized = Math.max(0, Math.floor(Number(value || 0)));
    this.quantityByVariant.set(variantId, sanitized);
    this.bumpQuantityVersion();
  }

  incrementVariant(variantId: number) {
    this.setVariantQty(variantId, this.getVariantQty(variantId) + 1);
  }

  decrementVariant(variantId: number) {
    this.setVariantQty(variantId, this.getVariantQty(variantId) - 1);
  }

  addSelectionToCart() {
    const product = this.product();
    if (!product) return;

    const selections = product.variants
      .map((variant) => ({ variant, quantity: this.getVariantQty(variant.id) }))
      .filter((entry) => entry.quantity > 0);

    if (!selections.length) {
      this.addToCartMessage.set('Selecciona al menos una variante con cantidad mayor a 0.');
      return;
    }

    this.addToCartMessage.set('');
    this.cartService.addVariants(product, selections);
    this.quantityByVariant.clear();
    this.bumpQuantityVersion();
    this.router.navigate(['/marketplace/cart']);
  }

  selectImage(imageUrl: string) {
    this.selectedImageOverride.set(imageUrl);
  }

  private bumpQuantityVersion() {
    this.quantityVersion.update((value) => value + 1);
  }
}
