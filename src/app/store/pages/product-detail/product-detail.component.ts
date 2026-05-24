import { Component, HostListener, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { MarketplaceCatalogProduct, MarketplaceProductVariant } from '../../interfaces/marketplace.interface';
import { MarketplaceService } from '../../services/marketplace.service';
import { MarketplaceCartService } from '../../services/marketplace-cart.service';
import { SeoService } from '../../../shared/services/seo.service';

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
  private readonly seoService = inject(SeoService);
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

  readonly isSingleSelectionProduct = computed(() => {
    const variants = this.product()?.variants || [];
    if (!variants.length) return false;
    return variants.every((variant) => Boolean(variant?.isSimpleVariant) || Boolean(variant?.isSizeOnlyVariant));
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

    effect(() => {
      const invalidMessage = this.invalidProductMessage();
      const product = this.product();
      const currentProductId = this.productId();

      if (invalidMessage) {
        this.seoService.setNoIndexPage({
          title: 'Producto invalido | Marketplace mayorista',
          description: 'No se encontro un producto valido para mostrar.',
          path: '/marketplace/products',
          type: 'product',
        });
        this.seoService.clearJsonLd();
        return;
      }

      if (!product) {
        const detailPath = (currentProductId ?? 0) > 0
          ? `/marketplace/products/${currentProductId}`
          : '/marketplace/products';
        this.seoService.setPage({
          title: 'Detalle de producto | Marketplace mayorista',
          description: 'Revisa variantes, stock y precios por volumen en nuestro marketplace mayorista.',
          path: detailPath,
          type: 'product',
          robots: 'index,follow',
        });
        this.seoService.clearJsonLd();
        return;
      }

      const detailPath = `/marketplace/products/${product.id}`;
      const description = this.buildSeoDescription(product);
      const image = this.resolveSeoImage(product);

      this.seoService.setPage({
        title: `${product.name} | Marketplace mayorista`,
        description,
        path: detailPath,
        image,
        type: 'product',
        robots: 'index,follow',
        keywords: `producto mayorista, ${product.name}, ${product.category?.name || 'catalogo mayorista'}`,
      });
      this.seoService.setJsonLd(this.buildProductJsonLd(product, detailPath, description));
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
    if (sanitized < 1) {
      this.quantityByVariant.delete(variantId);
      this.bumpQuantityVersion();
      return;
    }

    if (this.isSingleSelectionProduct()) {
      for (const variant of this.product()?.variants || []) {
        if (Number(variant.id) !== Number(variantId)) {
          this.quantityByVariant.delete(variant.id);
        }
      }
    }

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

    let selections = product.variants
      .map((variant) => ({ variant, quantity: this.getVariantQty(variant.id) }))
      .filter((entry) => entry.quantity > 0);

    if (this.isSingleSelectionProduct() && selections.length > 1) {
      const selectedVariantId = Number(this.selectedVariant()?.id || 0);
      const selectedEntry = selections.find((entry) => Number(entry.variant.id) === selectedVariantId);
      selections = [selectedEntry || selections[0]];
    }

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

  private resolveSeoImage(product: MarketplaceCatalogProduct): string | null {
    return product.imageUrl || product.images?.[0]?.url || null;
  }

  private buildSeoDescription(product: MarketplaceCatalogProduct): string {
    const source = product.description?.trim()
      || `${product.name} con variantes y precios por volumen para compras mayoristas.`;
    const normalized = source.replace(/\s+/g, ' ').trim();
    return normalized.length <= 160 ? normalized : `${normalized.slice(0, 157)}...`;
  }

  private buildProductJsonLd(product: MarketplaceCatalogProduct, detailPath: string, description: string): Record<string, unknown> {
    const absoluteUrl = this.seoService.buildAbsoluteUrl(detailPath) ?? detailPath;
    const images = [
      ...(product.imageUrl ? [product.imageUrl] : []),
      ...(product.images || []).map((image) => image.url).filter((url) => !!url),
    ];

    return {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      description,
      image: images,
      category: product.category?.name || undefined,
      sku: product.variants?.[0]?.sku || undefined,
      offers: {
        '@type': 'AggregateOffer',
        lowPrice: Number(product.minPrice || 0).toFixed(2),
        highPrice: Number(product.maxPrice || product.minPrice || 0).toFixed(2),
        priceCurrency: 'PEN',
        offerCount: Number(product.variants?.length || 0),
        availability: product.hasStock ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder',
        url: absoluteUrl,
      },
    };
  }
}
