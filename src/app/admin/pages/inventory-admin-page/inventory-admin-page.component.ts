import { Component, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { InventoryService } from '../../../inventory/services/inventory.service';
import { Inventory } from '../../../inventory/interfaces/inventory.interface';
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

@Component({
  selector: 'app-inventory-admin-page',
  templateUrl: './inventory-admin-page.component.html',
  styleUrls: ['./inventory-admin-page.component.css'],
  standalone: true,
  imports: [DatePipe]
})
export class InventoryAdminPageComponent implements OnInit, OnDestroy {
  private inventoryService = inject(InventoryService);
  private alertService = inject(AlertService);
  private storeService = inject(StoreService);
  private productService = inject(ProductService);

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
  historyMode = signal<boolean>(false);
  selectedInventory = signal<Inventory | null>(null);
  movementsData = signal<any[]>([]);
  searchSubject = new Subject<string>();
  searchParam = signal<string>('');
  skuFilter = signal<string>('');
  includeZero = signal<boolean>(true);
  reservedOnly = signal<boolean>(false);
  lowStockThreshold = signal<number>(0);

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
          label: `${product.name} • ${colorName} / ${sizeName} • ${sku}`,
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

  get canSaveMovement() {
    return !!this.movementStoreId() && !!this.movementVariantId() && this.movementQuantity() > 0 && !this.creatingMovement();
  }

  get movementDrawerTitle() {
    return this.historyMode() ? 'Historial de movimientos' : 'Registrar movimiento';
  }

  get selectedInventoryMovements() {
    const selected = this.selectedInventory();
    if (!selected) {
      return this.movementsData();
    }
    return this.movementsData().filter((movement) => movement.inventory?.id === selected.id);
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

      return (
        matchesSearch &&
        matchesSku &&
        matchesStore &&
        matchesProduct &&
        matchesSize &&
        matchesColor &&
        matchesReservedOnly &&
        matchesZero &&
        matchesLowStock
      );
    });
  }

  ngOnInit() {
    this.loadInventories();
    this.loadStoreOptions();
    this.loadProductCatalog();
    this.loadMovements();
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

  private loadMovements() {
    this.inventoryService.listMovements().subscribe({
      next: (movements) => {
        this.movementsData.set(movements);
      },
      error: (error: unknown) => {
        console.error('Error al cargar movimientos:', error);
        this.alertService.show('Error al cargar movimientos', 'error', 3000);
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
    this.historyMode.set(false);
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
    this.historyMode.set(false);
    this.movementDrawerOpen.set(true);
  }

  openHistoryDrawer(inventory?: Inventory) {
    this.blurActiveElement();
    this.selectedInventory.set(inventory ?? null);
    this.movementErrorMessage.set('');
    this.historyMode.set(true);
    this.movementDrawerOpen.set(true);
    if (!this.movementsData().length) {
      this.loadMovements();
    }
  }

  private blurActiveElement() {
    requestAnimationFrame(() => {
      const active = document.activeElement as HTMLElement | null;
      if (active && typeof active.blur === 'function') {
        active.blur();
      }
    });
  }

  showTransferNotice() {
    this.alertService.show('Transferencias pendiente de implementación', 'info', 3000);
  }

  closeMovementDrawer() {
    this.movementDrawerOpen.set(false);
    this.selectedInventory.set(null);
    this.movementStoreId.set(null);
    this.movementVariantId.set(null);
    this.movementVariantSearch.set('');
    this.historyMode.set(false);
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
        this.loadMovements();
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
    this.loadMovements();
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
    this.includeZero.set(true);
    this.searchSubject.next('');
  }

  computeAvailableStock(item: Inventory) {
    return item.stock - item.reservedStock;
  }

  getMovementActionLabel(movement: any): string {
    const actionByType: Record<string, string> = {
      IN: 'Ingreso',
      OUT: 'Salida',
      ADJUSTMENT: 'Ajuste',
      TRANSFER_OUT: 'Transferencia salida',
      TRANSFER_IN: 'Transferencia ingreso',
      RESERVED: 'Comprometido',
      UNRESERVED: 'Liberado',
    };

    return actionByType[movement?.type] ?? movement?.type ?? '-';
  }

  getMovementCommittedProduct(movement: any): string {
    const variant = movement?.inventory?.variant;
    const productName = variant?.product?.name;
    const sku = variant?.sku;

    if (!productName && !sku) {
      return '-';
    }

    if (productName && sku) {
      return `${productName} - ${sku}`;
    }

    return productName || sku || '-';
  }
}

