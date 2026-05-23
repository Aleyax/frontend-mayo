import { Component, HostListener, OnInit, computed, effect, inject, signal } from '@angular/core';
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
  styleUrls: [
    './product-detail.component.layout-gallery.css',
    './product-detail.component.offer-drawer.css',
    './product-detail.component.drawer-responsive.css',
  ]
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
  readonly drawerOpen = signal(false);
  readonly selectedColorName = signal<string | null>(null);
  readonly selectedSizeName = signal<string | null>(null);
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
  readonly selectedVariant = computed<MarketplaceProductVariant | null>(() => {
    const product = this.product();
    if (!product) return null;

    const selectedColor = this.selectedColorName();
    const selectedSize = this.selectedSizeName();

    return (product.variants || []).find((variant) => {
      if (selectedColor && this.getColorName(variant) !== selectedColor) return false;
      if (selectedSize && this.getSizeName(variant) !== selectedSize) return false;
      return true;
    }) || null;
  });
  readonly selectedImageUrl = computed(() => {
    const product = this.product();
    if (!product) return '';
    const manualSelection = this.selectedImageOverride();
    if (manualSelection) return manualSelection;

    const selectedVariant = this.selectedVariant();
    if (selectedVariant?.imageUrl) return selectedVariant.imageUrl;

    const selectedColor = this.selectedColorName();
    if (selectedColor) {
      const colorImage = (product.variants || []).find(
        (variant) => this.getColorName(variant) === selectedColor && !!variant.imageUrl
      )?.imageUrl;
      if (colorImage) return colorImage;
    }

    return product.imageUrl || product.images?.[0]?.url || '';
  });
  readonly footerMessage = computed(() => this.addToCartMessage());
  readonly colorOptions = computed<Array<{ name: string; hex?: string | null }>>(() => {
    const product = this.product();
    if (!product) return [];

    if (Array.isArray(product.colors) && product.colors.length > 0) {
      return product.colors.map((color) => ({
        name: String(color?.name || 'Unico'),
        hex: color?.hex ?? null,
      }));
    }

    const map = new Map<string, { name: string; hex?: string | null }>();
    for (const variant of product.variants || []) {
      const colorName = this.getColorName(variant);
      if (!map.has(colorName)) {
        map.set(colorName, {
          name: colorName,
          hex: variant.color?.hex ?? null,
        });
      }
    }
    return Array.from(map.values());
  });

  readonly sizeOptions = computed<string[]>(() => {
    const product = this.product();
    if (!product) return [];

    const selectedColor = this.selectedColorName();
    const variants = (product.variants || []).filter((variant) => {
      if (!selectedColor) return true;
      return this.getColorName(variant) === selectedColor;
    });

    const names = new Set<string>();
    variants.forEach((variant) => names.add(this.getSizeName(variant)));

    return Array.from(names.values()).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  });

  readonly drawerVariants = computed<MarketplaceProductVariant[]>(() => {
    const product = this.product();
    if (!product) return [];

    const selectedColor = this.selectedColorName();

    return (product.variants || [])
      .filter((variant) => {
        if (selectedColor && this.getColorName(variant) !== selectedColor) return false;
        return true;
      })
      .sort((a, b) => {
        const colorSort = this.getColorName(a).localeCompare(this.getColorName(b));
        if (colorSort !== 0) return colorSort;
        return this.getSizeName(a).localeCompare(this.getSizeName(b), undefined, { numeric: true });
      });
  });

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

  readonly drawerSubtotal = computed(() => {
    this.quantityVersion();
    const product = this.product();
    if (!product) return 0;
    return (product.variants || []).reduce((sum, variant) => {
      const qty = Number(this.quantityByVariant.get(variant.id) || 0);
      return sum + (qty * Number(variant.price || 0));
    }, 0);
  });

  constructor() {
    effect(() => {
      const product = this.product();
      if (!product) return;

      const colors = this.colorOptions();
      if (!this.selectedColorName() && colors.length > 0) {
        this.selectedColorName.set(colors[0].name);
      }

      const sizes = this.sizeOptions();
      const currentSize = this.selectedSizeName();
      if (sizes.length === 0) {
        if (currentSize) this.selectedSizeName.set(null);
      } else if (!currentSize || !sizes.includes(currentSize)) {
        this.selectedSizeName.set(sizes[0]);
      }

      this.syncImageForCurrentSelection();
    });
  }

  ngOnInit() {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      this.addToCartMessage.set('');
      this.selectedImageOverride.set('');
      this.selectedColorName.set(null);
      this.selectedSizeName.set(null);
      this.drawerOpen.set(false);
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

  get cartUnits() {
    return this.cartService.totalUnits();
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

  selectColor(colorName: string, openDrawer = true) {
    this.selectedColorName.set(colorName);
    const sizes = this.sizeOptions();
    if (sizes.length > 0 && !sizes.includes(this.selectedSizeName() || '')) {
      this.selectedSizeName.set(sizes[0]);
    }
    this.syncImageForCurrentSelection();
    if (openDrawer) this.openVariantDrawer();
  }

  selectSize(sizeName: string, openDrawer = true) {
    this.selectedSizeName.set(sizeName);
    this.syncImageForCurrentSelection();
    if (openDrawer) this.openVariantDrawer();
  }

  openVariantDrawer() {
    this.drawerOpen.set(true);
    this.addToCartMessage.set('');
  }

  closeVariantDrawer() {
    this.drawerOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscapePressed() {
    if (this.drawerOpen()) {
      this.closeVariantDrawer();
    }
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

  getColorName(variant: MarketplaceProductVariant): string {
    return String(variant?.color?.name || 'Unico');
  }

  getSizeName(variant: MarketplaceProductVariant): string {
    return String(variant?.size?.name || 'Unica');
  }

  getColorPreviewImage(colorName: string): string {
    const product = this.product();
    if (!product) return '';
    const match = (product.variants || []).find(
      (variant) => this.getColorName(variant) === colorName && !!variant.imageUrl
    );
    return match?.imageUrl || '';
  }

  isDrawerVariantSelected(variant: MarketplaceProductVariant): boolean {
    return this.selectedSizeName() === this.getSizeName(variant);
  }

  getTierPrice(tier: 'starter' | 'business' | 'bulk'): number {
    const product = this.product();
    if (!product) return 0;

    const min = Number(product.minPrice || 0);
    const max = Number(product.maxPrice || min);

    if (tier === 'starter') {
      return max;
    }

    if (tier === 'business') {
      return Number(((max + min) / 2).toFixed(2));
    }

    return min;
  }

  isProductAvailabilityWarning(product: MarketplaceCatalogProduct): boolean {
    const totalAvailableStock = Number(product?.totalAvailableStock || 0);
    return !product?.hasStock || totalAvailableStock < 3;
  }

  getProductAvailabilityLabel(product: MarketplaceCatalogProduct): string {
    const totalAvailableStock = Number(product?.totalAvailableStock || 0);
    if (!product?.hasStock || totalAvailableStock <= 0) {
      return 'Puedes pedir bajo confirmacion de disponibilidad.';
    }
    if (totalAvailableStock < 3) {
      return 'Por agotarse';
    }
    return 'Disponible';
  }

  getVariantAvailabilityLabel(variant: MarketplaceProductVariant): string {
    const availableStock = Number(variant?.availableStock || 0);
    if (availableStock <= 0) {
      return 'Sujeto a disponibilidad';
    }
    if (availableStock < 3) {
      return 'Por agotarse';
    }
    return 'Disponible';
  }

  private syncImageForCurrentSelection() {
    const product = this.product();
    if (!product) return;

    const selectedColor = this.selectedColorName();
    const selectedSize = this.selectedSizeName();

    const match = (product.variants || []).find((variant) => {
      if (selectedColor && this.getColorName(variant) !== selectedColor) return false;
      if (selectedSize && this.getSizeName(variant) !== selectedSize) return false;
      return !!variant.imageUrl;
    });

    if (match?.imageUrl) {
      this.selectedImageOverride.set(match.imageUrl);
      return;
    }

    this.selectedImageOverride.set('');
  }

  private bumpQuantityVersion() {
    this.quantityVersion.update((value) => value + 1);
  }
}
