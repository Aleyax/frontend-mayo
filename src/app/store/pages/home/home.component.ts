import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { MarketplaceCatalogProduct, MarketplaceCatalogResponse } from '../../interfaces/marketplace.interface';
import { MarketplaceService, PublicProductFilters } from '../../services/marketplace.service';
import { MarketplaceCartService } from '../../services/marketplace-cart.service';

interface FilterOption {
  id: number;
  name: string;
  hex?: string | null;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent {
  private readonly marketplaceService = inject(MarketplaceService);
  private readonly cartService = inject(MarketplaceCartService);
  private readonly productsQuery = signal<PublicProductFilters>({
    skip: 1,
    take: 60,
  });

  private readonly productsResource = rxResource<MarketplaceCatalogResponse, PublicProductFilters>({
    params: () => this.productsQuery(),
    stream: ({ params }) => this.marketplaceService.getProducts(params),
    defaultValue: {
      data: [],
      total: 0,
      page: 1,
      limit: 60,
      hasMore: false,
    },
  });

  readonly loading = computed(() => this.productsResource.isLoading());
  readonly errorMessage = computed(() => {
    const resourceError = this.productsResource.error() as { message?: string } | undefined;
    return resourceError ? (resourceError.message || 'No se pudo cargar el catalogo mayorista.') : '';
  });
  readonly products = computed<MarketplaceCatalogProduct[]>(() => this.productsResource.value()?.data ?? []);
  readonly totalProducts = computed(() => Number(this.productsResource.value()?.total ?? this.products().length));

  searchTerm = '';
  selectedCategoryId: number | null = null;
  selectedColorId: number | null = null;
  selectedSizeId: number | null = null;
  availabilityFilter: 'ALL' | 'IN_STOCK' | 'UNDER_ORDER' = 'ALL';
  showMobileFilters = false;

  readonly categories = computed(() => {
    const categoriesMap = new Map<number, FilterOption>();
    this.products().forEach((product) => {
      if (product.category?.id) {
        categoriesMap.set(product.category.id, {
          id: product.category.id,
          name: product.category.name,
        });
      }
    });
    return Array.from(categoriesMap.values());
  });

  readonly colors = computed(() => {
    const colorsMap = new Map<number, FilterOption>();
    this.products().forEach((product) => {
      (product.colors || []).forEach((color) => {
        colorsMap.set(color.id, {
          id: color.id,
          name: color.name,
          hex: color.hex ?? null,
        });
      });
    });
    return Array.from(colorsMap.values());
  });

  readonly sizes = computed(() => {
    const sizesMap = new Map<number, FilterOption>();
    this.products().forEach((product) => {
      (product.sizes || []).forEach((size) => {
        sizesMap.set(size.id, {
          id: size.id,
          name: size.name,
        });
      });
    });
    return Array.from(sizesMap.values());
  });

  get cartUnits() {
    return this.cartService.totalUnits();
  }

  loadProducts() {
    this.productsQuery.set({
      skip: 1,
      take: 60,
      search: this.searchTerm || undefined,
      categoryId: this.selectedCategoryId || undefined,
      colorId: this.selectedColorId || undefined,
      sizeId: this.selectedSizeId || undefined,
      inStock: this.availabilityFilter === 'IN_STOCK' ? true : (this.availabilityFilter === 'UNDER_ORDER' ? false : undefined),
      allowBackorder: this.availabilityFilter === 'IN_STOCK' ? false : undefined,
    });
  }

  applyFilters() {
    this.loadProducts();
    this.showMobileFilters = false;
  }

  clearFilters() {
    this.searchTerm = '';
    this.selectedCategoryId = null;
    this.selectedColorId = null;
    this.selectedSizeId = null;
    this.availabilityFilter = 'ALL';
    this.loadProducts();
  }

  toggleMobileFilters() {
    this.showMobileFilters = !this.showMobileFilters;
  }

  isProductAvailabilityWarning(product: MarketplaceCatalogProduct): boolean {
    const totalAvailableStock = Number(product?.totalAvailableStock || 0);
    return !product?.hasStock || totalAvailableStock < 3;
  }

  getProductAvailabilityLabel(product: MarketplaceCatalogProduct): string {
    const totalAvailableStock = Number(product?.totalAvailableStock || 0);
    if (!product?.hasStock || totalAvailableStock <= 0) {
      return 'Pedido sujeto a disponibilidad';
    }
    if (totalAvailableStock < 3) {
      return 'Por agotarse';
    }
    return 'Disponible';
  }
}
