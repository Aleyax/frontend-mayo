import { Component, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { InventoryService } from '../../../inventory/services/inventory.service';
import { Inventory, InventoryReservation } from '../../../inventory/interfaces/inventory.interface';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { AlertService } from '../../../shared/services/alert.service';
import { StoreService } from '../../../store/services/store.service';
import { ProductService } from '../../../product/services/product.service';
import { Store } from '../../../store/interfaces/store.interface';
import { Product } from '../../../product/interfaces/product.interface';

interface InventoryVariantOption {
  variantId: number;
  sku: string;
  productName: string;
  colorName: string;
  sizeName: string;
  label: string;
}

type InventoryStockScope = 'ALL' | 'OUT' | 'CRITICAL' | 'LOW' | 'NORMAL';

@Component({
  selector: 'app-inventory-admin-page',
  templateUrl: './inventory-admin-page.component.html',
  styleUrls: ['./inventory-admin-page.component.css'],
  standalone: true
})
export class InventoryAdminPageComponent implements OnInit, OnDestroy {
  private inventoryService = inject(InventoryService);
  private alertService = inject(AlertService);
  private storeService = inject(StoreService);
  private productService = inject(ProductService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  inventoryData = signal<Inventory[]>([]);
  productCatalog = signal<Product[]>([]);
  storeOptions = signal<Store[]>([]);
  selectedStoreId = signal<number | null>(null);
  selectedProductId = signal<number | null>(null);
  selectedSizeId = signal<number | null>(null);
  selectedColorId = signal<number | null>(null);
  movementStoreId = signal<number | null>(null);
  movementVariantId = signal<number | null>(null);
  movementVariantSearch = signal<string>('');
  movementQuantity = signal<number>(0);
  movementType = signal<'IN' | 'OUT' | 'ADJUSTMENT'>('IN');
  movementNote = signal<string>('');
  movementErrorMessage = signal<string>('');
  creatingMovement = signal<boolean>(false);
  showAdvancedFilters = signal<boolean>(false);
  movementDrawerOpen = signal<boolean>(false);
  selectedInventory = signal<Inventory | null>(null);
  reservationsData = signal<InventoryReservation[]>([]);
  searchSubject = new Subject<string>();
  searchParam = signal<string>('');
  skuFilter = signal<string>('');
  includeZero = signal<boolean>(true);
  reservedOnly = signal<boolean>(false);
  lowStockThreshold = signal<number>(0);
  stockScope = signal<InventoryStockScope>('ALL');
  reconcilingReserved = signal<boolean>(false);

  productOptions = computed(() => {
    const products = new Map<number, string>();
    this.inventoryData().forEach((item) => {
      products.set(item.variant.product.id, item.variant.product.name);
    });
    return Array.from(products.entries()).map(([id, name]) => ({ id, name }));
  });

  sizeOptions = computed(() => {
    const sizes = new Map<number, string>();
    this.inventoryData().forEach((item) => {
      sizes.set(item.variant.size.id, item.variant.size.name);
    });
    return Array.from(sizes.entries()).map(([id, name]) => ({ id, name }));
  });

  colorOptions = computed(() => {
    const colors = new Map<number, string>();
    this.inventoryData().forEach((item) => {
      colors.set(item.variant.color.id, item.variant.color.name);
    });
    return Array.from(colors.entries()).map(([id, name]) => ({ id, name }));
  });

  variantCatalog = computed<InventoryVariantOption[]>(() => {
    const options: InventoryVariantOption[] = [];

    this.productCatalog().forEach((product) => {
      (product.variants ?? []).forEach((variant) => {
        if (variant.isActive === false) {
          return;
        }

        const colorName = variant.color?.name ?? 'Sin color';
        const sizeName = variant.size?.name ?? 'Sin talla';
        const sku = variant.sku;

        options.push({
          variantId: variant.id,
          sku,
          productName: product.name,
          colorName,
          sizeName,
          label: `${product.name} - ${colorName} / ${sizeName} - ${sku}`,
        });
      });
    });

    return options.sort((a, b) => a.label.localeCompare(b.label));
  });

  filteredVariantCatalog = computed<InventoryVariantOption[]>(() => {
    const search = this.movementVariantSearch().trim().toLowerCase();
    if (!search) {
      return this.variantCatalog();
    }

    return this.variantCatalog().filter((variant) =>
      variant.sku.toLowerCase().includes(search) ||
      variant.productName.toLowerCase().includes(search) ||
      variant.colorName.toLowerCase().includes(search) ||
      variant.sizeName.toLowerCase().includes(search)
    );
  });

  selectedMovementVariant = computed<InventoryVariantOption | null>(() => {
    const selectedVariantId = this.movementVariantId();
    if (!selectedVariantId) {
      return null;
    }

    return this.variantCatalog().find((variant) => variant.variantId === selectedVariantId) ?? null;
  });

  ListaInventarios = computed(() => this.getFilteredInventories());

  get filteredCount() {
    return this.ListaInventarios().length;
  }

  get totalCount() {
    return this.inventoryData().length;
  }

  get mismatchedCount() {
    return this.ListaInventarios().filter((item) => this.hasReservedMismatch(item)).length;
  }

  get canSaveMovement() {
    return !!this.movementStoreId() && !!this.movementVariantId() && this.movementQuantity() > 0 && !this.creatingMovement();
  }

  private getFilteredInventories(): Inventory[] {
    const search = this.searchParam().toLowerCase();
    const skuSearch = this.skuFilter().trim().toLowerCase();
    const selectedStoreId = this.selectedStoreId();
    const selectedProductId = this.selectedProductId();
    const selectedSizeId = this.selectedSizeId();
    const selectedColorId = this.selectedColorId();
    const reservedOnly = this.reservedOnly();
    const lowStockThreshold = this.lowStockThreshold();
    const stockScope = this.stockScope();

    return this.inventoryData().filter((item) => {
      const skuValue = item.variant.sku.toLowerCase();
      const productName = item.variant.product.name.toLowerCase();
      const storeName = item.store.name.toLowerCase();
      const sizeName = item.variant.size.name.toLowerCase();
      const colorName = item.variant.color.name.toLowerCase();
      const availableStock = this.computeAvailableStock(item);

      const matchesSearch =
        !search ||
        skuValue.includes(search) ||
        productName.includes(search) ||
        storeName.includes(search) ||
        sizeName.includes(search) ||
        colorName.includes(search);

      const matchesSku = !skuSearch || skuValue.includes(skuSearch);
      const matchesStore = !selectedStoreId || item.store.id === selectedStoreId;
      const matchesProduct = !selectedProductId || item.variant.product.id === selectedProductId;
      const matchesSize = !selectedSizeId || item.variant.size.id === selectedSizeId;
      const matchesColor = !selectedColorId || item.variant.color.id === selectedColorId;
      const matchesReservedOnly = !reservedOnly || item.reservedStock > 0;
      const matchesZero = this.includeZero() || item.stock > 0;
      const matchesLowStock = lowStockThreshold <= 0 || availableStock <= lowStockThreshold;
      const matchesStockScope = this.matchesStockScopeFilter(availableStock, stockScope);

      return (
        matchesSearch &&
        matchesSku &&
        matchesStore &&
        matchesProduct &&
        matchesSize &&
        matchesColor &&
        matchesReservedOnly &&
        matchesZero &&
        matchesLowStock &&
        matchesStockScope
      );
    });
  }

  private matchesStockScopeFilter(availableStock: number, scope: InventoryStockScope): boolean {
    if (scope === 'OUT') {
      return availableStock <= 0;
    }
    if (scope === 'CRITICAL') {
      return availableStock >= 1 && availableStock <= 3;
    }
    if (scope === 'LOW') {
      return availableStock >= 4 && availableStock <= 10;
    }
    if (scope === 'NORMAL') {
      return availableStock > 10;
    }
    return true;
  }

  private applyFiltersFromQueryParams(queryParams: ParamMap): boolean {
    const previousIncludeZero = this.includeZero();

    const search = String(queryParams.get('search') || '').trim();
    const sku = String(queryParams.get('sku') || '').trim();
    const stockScopeQuery = this.normalizeStockScopeFromQuery(queryParams.get('stockScope'));
    const includeZeroQuery = this.normalizeBooleanFromQuery(queryParams.get('includeZero'));
    const reservedOnlyQuery = this.normalizeBooleanFromQuery(queryParams.get('reservedOnly'));
    const lowStockThresholdQuery = this.normalizeNumberFromQuery(queryParams.get('lowStockThreshold'));
    const showAdvancedQuery = this.normalizeBooleanFromQuery(queryParams.get('showAdvanced'));

    this.searchParam.set(search);
    this.skuFilter.set(sku);
    this.selectedStoreId.set(this.normalizeIdFromQuery(queryParams.get('storeId')));
    this.selectedProductId.set(this.normalizeIdFromQuery(queryParams.get('productId')));
    this.selectedSizeId.set(this.normalizeIdFromQuery(queryParams.get('sizeId')));
    this.selectedColorId.set(this.normalizeIdFromQuery(queryParams.get('colorId')));
    this.reservedOnly.set(reservedOnlyQuery ?? false);
    this.stockScope.set('ALL');
    this.includeZero.set(includeZeroQuery ?? true);
    this.lowStockThreshold.set(lowStockThresholdQuery ?? 0);

    if (stockScopeQuery === 'critical-total') {
      this.stockScope.set('ALL');
      this.includeZero.set(true);
      this.lowStockThreshold.set(3);
    } else if (stockScopeQuery === 'out') {
      this.stockScope.set('OUT');
      this.lowStockThreshold.set(0);
      this.includeZero.set(true);
    } else if (stockScopeQuery === 'critical') {
      this.stockScope.set('CRITICAL');
      this.lowStockThreshold.set(0);
      this.includeZero.set(true);
    } else if (stockScopeQuery === 'low') {
      this.stockScope.set('LOW');
      this.lowStockThreshold.set(0);
      this.includeZero.set(true);
    } else if (stockScopeQuery === 'normal') {
      this.stockScope.set('NORMAL');
      this.lowStockThreshold.set(0);
      this.includeZero.set(true);
    }

    if (showAdvancedQuery !== null) {
      this.showAdvancedFilters.set(showAdvancedQuery);
    } else {
      this.showAdvancedFilters.set(stockScopeQuery !== null);
    }

    return previousIncludeZero !== this.includeZero();
  }

  private normalizeIdFromQuery(value: string | null): number | null {
    const parsed = Number(value || 0);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  }

  private normalizeBooleanFromQuery(value: string | null): boolean | null {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
      return true;
    }
    if (normalized === '0' || normalized === 'false' || normalized === 'no') {
      return false;
    }
    return null;
  }

  private normalizeNumberFromQuery(value: string | null): number | null {
    const parsed = Number(value || '');
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }
    return parsed;
  }

  private normalizeStockScopeFromQuery(value: string | null): 'critical-total' | 'out' | 'critical' | 'low' | 'normal' | null {
    const normalized = String(value || '').trim().toLowerCase();
    if (
      normalized === 'critical-total' ||
      normalized === 'out' ||
      normalized === 'critical' ||
      normalized === 'low' ||
      normalized === 'normal'
    ) {
      return normalized;
    }
    return null;
  }

  ngOnInit() {
    let firstQuerySync = true;
    this.route.queryParamMap.subscribe((queryParams) => {
      const includeZeroChanged = this.applyFiltersFromQueryParams(queryParams);
      if (!firstQuerySync && includeZeroChanged) {
        this.loadInventories();
      }
      firstQuerySync = false;
    });
    this.loadInventories();
    this.loadStoreOptions();
    this.loadProductCatalog();
    this.loadReservations();
    this.searchSubject.pipe(debounceTime(400)).subscribe((param) => {
      this.searchParam.set(param);
    });
  }

  ngOnDestroy() {
    this.searchSubject.unsubscribe();
  }

  private loadInventories() {
    this.inventoryService
      .getInventories({ skip: 1, take: 100, includeZero: this.includeZero() })
      .subscribe({
        next: (inventories: Inventory[]) => {
          this.inventoryData.set(inventories);
        },
        error: (error: unknown) => {
          console.error('Error al cargar inventario:', error);
          this.alertService.show('Error al cargar el inventario', 'error', 3000);
        }
      });
  }

  private loadStoreOptions() {
    this.storeService.getStores({ skip: 1, take: 100 }).subscribe({
      next: (stores: Store[]) => this.storeOptions.set(stores),
      error: (error: unknown) => {
        console.error('Error al cargar tiendas:', error);
        this.alertService.show('Error al cargar las tiendas', 'error', 3000);
      }
    });
  }

  private loadReservations() {
    this.inventoryService.listReservations().subscribe({
      next: (reservations) => {
        this.reservationsData.set(reservations || []);
      },
      error: (error: unknown) => {
        console.error('Error al cargar reservas:', error);
        this.alertService.show('Error al cargar reservas de inventario', 'error', 3000);
      }
    });
  }

  private loadProductCatalog() {
    this.productService.getProducts({ skip: 1, take: 500 }).subscribe({
      next: (response) => {
        this.productCatalog.set(response?.data ?? []);
      },
      error: (error: unknown) => {
        console.error('Error al cargar catálogo de productos:', error);
        this.alertService.show('Error al cargar variantes de productos', 'error', 3000);
      }
    });
  }

  openMovementDrawer(inventory: Inventory, type: 'IN' | 'OUT' | 'ADJUSTMENT') {
    this.blurActiveElement();
    this.selectedInventory.set(inventory);
    this.movementStoreId.set(inventory.store.id);
    this.movementVariantId.set(inventory.variant.id);
    this.movementVariantSearch.set('');
    this.movementType.set(type);
    this.movementQuantity.set(0);
    this.movementNote.set('');
    this.movementErrorMessage.set('');
    this.movementDrawerOpen.set(true);
  }

  openManualMovementDrawer(type: 'IN' | 'OUT' | 'ADJUSTMENT' = 'IN') {
    this.blurActiveElement();
    this.selectedInventory.set(null);
    this.movementStoreId.set(this.selectedStoreId() || null);
    this.movementVariantId.set(null);
    this.movementVariantSearch.set('');
    this.movementType.set(type);
    this.movementQuantity.set(0);
    this.movementNote.set('');
    this.movementErrorMessage.set('');
    this.movementDrawerOpen.set(true);
  }

  private blurActiveElement() {
    requestAnimationFrame(() => {
      const active = document.activeElement as HTMLElement | null;
      if (active && typeof active.blur === 'function') {
        active.blur();
      }
    });
  }

  openTransfersModule() {
    this.router.navigate(['/admin/transfers']);
  }

  openMovementsPage(inventory?: Inventory) {
    const inventoryId = Number(inventory?.id || 0);
    const queryParams = Number.isInteger(inventoryId) && inventoryId > 0 ? { inventoryId } : undefined;
    this.router.navigate(['/admin/inventory/movements'], queryParams ? { queryParams } : undefined);
  }

  openTraceabilityPage(inventory?: Inventory) {
    const inventoryId = Number(inventory?.id || 0);
    const queryParams = Number.isInteger(inventoryId) && inventoryId > 0 ? { inventoryId } : undefined;
    this.router.navigate(['/admin/inventory/traceability'], queryParams ? { queryParams } : undefined);
  }

  closeMovementDrawer() {
    this.movementDrawerOpen.set(false);
    this.selectedInventory.set(null);
    this.movementStoreId.set(null);
    this.movementVariantId.set(null);
    this.movementVariantSearch.set('');
    this.movementErrorMessage.set('');
  }

  saveMovement() {
    const storeId = this.movementStoreId();
    const variantId = this.movementVariantId();

    if (!storeId || !variantId || this.movementQuantity() <= 0) {
      this.alertService.show('Selecciona tienda, variante y una cantidad valida', 'warning', 3000);
      return;
    }

    this.movementErrorMessage.set('');
    this.creatingMovement.set(true);

    this.inventoryService.createMovement({
      storeId,
      variantId,
      quantity: this.movementQuantity(),
      type: this.movementType(),
      note: this.movementNote() || undefined,
    }).subscribe({
      next: () => {
        this.alertService.show('Movimiento registrado correctamente', 'success', 3000);
        this.resetMovementForm();
        this.closeMovementDrawer();
        this.loadInventories();
        this.loadReservations();
      },
      error: (error: unknown) => {
        const message = this.getErrorMessage(error, 'Error al registrar movimiento');
        console.error('Error al registrar movimiento:', error);
        this.movementErrorMessage.set(message);
        this.creatingMovement.set(false);
      },
      complete: () => {
        this.creatingMovement.set(false);
      }
    });
  }

  private resetMovementForm() {
    this.movementQuantity.set(0);
    this.movementNote.set('');
    this.movementType.set('IN');
    this.selectedInventory.set(null);
    this.movementStoreId.set(null);
    this.movementVariantId.set(null);
    this.movementVariantSearch.set('');
  }
  private getErrorMessage(error: unknown, fallback: string) {
    if (error instanceof HttpErrorResponse) {
      return error.error?.message || error.message || fallback;
    }
    if (typeof error === 'object' && error !== null) {
      const anyError = error as any;
      return anyError.error?.message || anyError.message || fallback;
    }
    return fallback;
  }

  setStoreId(value: string) {
    const id = Number(value);
    this.selectedStoreId.set(Number.isFinite(id) && id > 0 ? id : null);
  }

  setMovementStoreId(value: string) {
    const id = Number(value);
    this.movementStoreId.set(Number.isFinite(id) && id > 0 ? id : null);
  }

  setMovementVariantId(value: string) {
    const id = Number(value);
    this.movementVariantId.set(Number.isFinite(id) && id > 0 ? id : null);
  }

  setMovementVariantSearch(value: string) {
    this.movementVariantSearch.set(value);
  }

  setMovementType(value: string) {
    const type = value as 'IN' | 'OUT' | 'ADJUSTMENT';
    this.movementType.set(type);
  }

  setMovementNote(value: string) {
    this.movementNote.set(value);
  }

  setMovementQuantity(value: string) {
    const quantity = Number(value);
    this.movementQuantity.set(Number.isFinite(quantity) ? quantity : 0);
  }

  toggleAdvancedFilters() {
    this.showAdvancedFilters.update((value) => !value);
  }

  refresh() {
    this.loadInventories();
    this.loadReservations();
  }

  onSearch(param: string) {
    this.searchSubject.next(param);
  }

  toggleIncludeZero(value: boolean) {
    this.includeZero.set(value);
    this.loadInventories();
  }

  setProductId(value: string) {
    const id = Number(value);
    this.selectedProductId.set(Number.isFinite(id) && id > 0 ? id : null);
  }

  setSizeId(value: string) {
    const id = Number(value);
    this.selectedSizeId.set(Number.isFinite(id) && id > 0 ? id : null);
  }

  setSkuFilter(value: string) {
    this.skuFilter.set(value);
  }

  toggleReservedOnly(value: boolean) {
    this.reservedOnly.set(value);
  }

  setLowStockThreshold(value: string) {
    const threshold = Number(value);
    this.lowStockThreshold.set(Number.isFinite(threshold) ? threshold : 0);
  }

  setColorId(value: string) {
    const id = Number(value);
    this.selectedColorId.set(Number.isFinite(id) && id > 0 ? id : null);
  }

  resetFilters() {
    this.searchParam.set('');
    this.skuFilter.set('');
    this.selectedStoreId.set(null);
    this.selectedProductId.set(null);
    this.selectedSizeId.set(null);
    this.selectedColorId.set(null);
    this.reservedOnly.set(false);
    this.lowStockThreshold.set(0);
    this.stockScope.set('ALL');
    this.includeZero.set(true);
    this.showAdvancedFilters.set(false);
    this.searchSubject.next('');
  }

  computeAvailableStock(item: Inventory) {
    return item.stock - item.reservedStock;
  }

  getTrackedReservedStock(item: Inventory) {
    return this.reservationsData()
      .filter((reservation) => reservation.inventoryId === item.id && reservation.status === 'ACTIVE')
      .reduce((sum, reservation) => sum + Number(reservation.quantity || 0), 0);
  }

  getTrackedReservedOrdersCount(item: Inventory) {
    const orderIds = new Set<number>();
    this.reservationsData()
      .filter((reservation) => reservation.inventoryId === item.id && reservation.status === 'ACTIVE')
      .forEach((reservation) => {
        const orderId = Number(reservation.orderId || 0);
        if (orderId > 0) {
          orderIds.add(orderId);
        }
      });
    return orderIds.size;
  }

  hasReservedMismatch(item: Inventory) {
    return Number(item.reservedStock || 0) !== this.getTrackedReservedStock(item);
  }

  reconcileReservedStock(item?: Inventory) {
    if (this.reconcilingReserved()) {
      return;
    }

    const targetIds = item
      ? [item.id]
      : this.ListaInventarios()
        .filter((inventoryItem) => this.hasReservedMismatch(inventoryItem))
        .map((inventoryItem) => inventoryItem.id);

    if (targetIds.length === 0) {
      this.alertService.show('No hay descuadres de reservados para reconciliar.', 'info', 3000);
      return;
    }

    const actionLabel = item ? 'esta variante' : `${targetIds.length} inventario(s)`;
    const confirmed = window.confirm(`Se reconciliara el reservado de ${actionLabel}. Deseas continuar?`);
    if (!confirmed) {
      return;
    }

    this.reconcilingReserved.set(true);
    this.inventoryService.reconcileReservedStock(targetIds).subscribe({
      next: (result) => {
        const adjusted = Number(result?.adjustedCount || 0);
        const unchanged = Number(result?.unchangedCount || 0);
        this.alertService.show(
          `Reconciliacion completada: ${adjusted} ajustado(s), ${unchanged} sin cambios.`,
          'success',
          3500
        );
        this.loadInventories();
        this.loadReservations();
      },
      error: (error: unknown) => {
        const message = this.getErrorMessage(error, 'Error al reconciliar reservados');
        this.alertService.show(message, 'error', 3500);
      },
      complete: () => {
        this.reconcilingReserved.set(false);
      }
    });
  }

}

