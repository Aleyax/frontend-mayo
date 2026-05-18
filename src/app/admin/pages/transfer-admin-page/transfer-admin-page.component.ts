import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { InventoryService } from '../../../inventory/services/inventory.service';
import { Inventory, StockTransfer, StockTransferStatus } from '../../../inventory/interfaces/inventory.interface';
import { StoreService } from '../../../store/services/store.service';
import { Store } from '../../../store/interfaces/store.interface';
import { ProductService } from '../../../product/services/product.service';
import { Product } from '../../../product/interfaces/product.interface';
import { AlertService } from '../../../shared/services/alert.service';

interface TransferVariantOption {
  variantId: number;
  sku: string;
  productName: string;
  colorName: string;
  sizeName: string;
  label: string;
}

interface TransferDraftItem {
  rowId: number;
  variantId: number | null;
  quantity: number;
}

@Component({
  selector: 'app-transfer-admin-page',
  templateUrl: './transfer-admin-page.component.html',
  styleUrls: ['./transfer-admin-page.component.css'],
  standalone: true,
  imports: [CommonModule, DatePipe, RouterLink]
})
export class TransferAdminPageComponent implements OnInit {
  private readonly inventoryService = inject(InventoryService);
  private readonly storeService = inject(StoreService);
  private readonly productService = inject(ProductService);
  private readonly alertService = inject(AlertService);
  private readonly originAvailabilityCache = new Map<number, Record<number, number>>();

  transfersData = signal<StockTransfer[]>([]);
  storeOptions = signal<Store[]>([]);
  productCatalog = signal<Product[]>([]);

  searchParam = signal<string>('');
  statusFilter = signal<'ALL' | StockTransferStatus>('ALL');

  showCreateDrawer = signal<boolean>(false);
  creatingTransfer = signal<boolean>(false);
  receivingTransferIds = signal<number[]>([]);

  fromStoreId = signal<number | null>(null);
  toStoreId = signal<number | null>(null);
  transferNote = signal<string>('');
  variantSearch = signal<string>('');
  draftItems = signal<TransferDraftItem[]>([{ rowId: 1, variantId: null, quantity: 1 }]);
  loadingOriginInventory = signal<boolean>(false);
  originVariantStockById = signal<Record<number, number>>({});
  private nextDraftRowId = 2;

  variantCatalog = computed<TransferVariantOption[]>(() => {
    const options: TransferVariantOption[] = [];

    this.productCatalog().forEach((product) => {
      (product.variants ?? []).forEach((variant) => {
        if (variant.isActive === false) {
          return;
        }

        const colorName = variant.color?.name ?? 'Sin color';
        const sizeName = variant.size?.name ?? 'Sin talla';
        const sku = variant.sku ?? `VAR-${variant.id}`;

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

  filteredVariantCatalog = computed<TransferVariantOption[]>(() => {
    const fromStoreId = this.fromStoreId();
    if (!fromStoreId) {
      return [];
    }

    const originStockByVariant = this.originVariantStockById();
    const search = this.variantSearch().trim().toLowerCase();
    const baseOptions = this.variantCatalog().filter((variant) => (originStockByVariant[variant.variantId] ?? 0) > 0);

    if (!search) {
      return baseOptions;
    }

    return baseOptions.filter((variant) =>
      variant.sku.toLowerCase().includes(search) ||
      variant.productName.toLowerCase().includes(search) ||
      variant.colorName.toLowerCase().includes(search) ||
      variant.sizeName.toLowerCase().includes(search)
    );
  });

  filteredTransfers = computed<StockTransfer[]>(() => {
    const query = this.searchParam().trim().toLowerCase();
    const status = this.statusFilter();

    return this.transfersData().filter((transfer) => {
      const matchesStatus = status === 'ALL' || transfer.status === status;
      if (!matchesStatus) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        transfer.code,
        transfer.fromStore?.name,
        transfer.toStore?.name,
        transfer.note,
        transfer.createdBy?.firstName,
        transfer.createdBy?.lastName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  });

  get canCreateTransfer(): boolean {
    if (this.creatingTransfer()) {
      return false;
    }

    const fromStoreId = this.fromStoreId();
    const toStoreId = this.toStoreId();
    if (!fromStoreId || !toStoreId || fromStoreId === toStoreId) {
      return false;
    }

    const validItems = this.draftItems().filter(
      (item) => Number.isInteger(item.variantId) && (item.quantity ?? 0) > 0
    );

    return validItems.length > 0;
  }

  ngOnInit() {
    this.loadTransfers();
    this.loadStores();
    this.loadProducts();
  }

  private loadTransfers() {
    this.inventoryService.listTransfers().subscribe({
      next: (transfers) => this.transfersData.set(transfers ?? []),
      error: (error: unknown) => {
        console.error('Error al cargar transferencias:', error);
        this.alertService.show(this.getErrorMessage(error, 'Error al cargar transferencias'), 'error', 3000);
      }
    });
  }

  private loadStores() {
    this.storeService.getStores({ skip: 1, take: 100 }).subscribe({
      next: (stores) => this.storeOptions.set(stores ?? []),
      error: (error: unknown) => {
        console.error('Error al cargar tiendas:', error);
        this.alertService.show(this.getErrorMessage(error, 'Error al cargar tiendas'), 'error', 3000);
      }
    });
  }

  private loadProducts() {
    this.productService.getProducts({ skip: 1, take: 500 }).subscribe({
      next: (response) => this.productCatalog.set(response?.data ?? []),
      error: (error: unknown) => {
        console.error('Error al cargar variantes:', error);
        this.alertService.show(this.getErrorMessage(error, 'Error al cargar variantes'), 'error', 3000);
      }
    });
  }

  refreshTransfers() {
    this.loadTransfers();
  }

  openCreateTransferDrawer() {
    this.resetCreateForm();
    this.showCreateDrawer.set(true);
  }

  closeCreateTransferDrawer() {
    this.showCreateDrawer.set(false);
  }

  private resetCreateForm() {
    this.fromStoreId.set(null);
    this.toStoreId.set(null);
    this.transferNote.set('');
    this.variantSearch.set('');
    this.draftItems.set([{ rowId: 1, variantId: null, quantity: 1 }]);
    this.loadingOriginInventory.set(false);
    this.originVariantStockById.set({});
    this.nextDraftRowId = 2;
    this.creatingTransfer.set(false);
  }

  addDraftItemRow() {
    this.draftItems.update((current) => [...current, { rowId: this.nextDraftRowId++, variantId: null, quantity: 1 }]);
  }

  removeDraftItemRow(rowId: number) {
    const remaining = this.draftItems().filter((item) => item.rowId !== rowId);
    if (!remaining.length) {
      this.draftItems.set([{ rowId: this.nextDraftRowId++, variantId: null, quantity: 1 }]);
      return;
    }
    this.draftItems.set(remaining);
  }

  setFromStoreId(value: string) {
    const id = Number(value);
    const normalizedStoreId = Number.isFinite(id) && id > 0 ? id : null;
    this.fromStoreId.set(normalizedStoreId);
    this.variantSearch.set('');
    this.loadOriginVariantsForStore(normalizedStoreId);
  }

  setToStoreId(value: string) {
    const id = Number(value);
    this.toStoreId.set(Number.isFinite(id) && id > 0 ? id : null);
  }

  setTransferNote(value: string) {
    this.transferNote.set(value);
  }

  setVariantSearch(value: string) {
    this.variantSearch.set(value);
  }

  setStatusFilter(value: string) {
    if (value === 'ALL' || value === 'PENDING' || value === 'IN_TRANSIT' || value === 'RECEIVED' || value === 'CANCELLED') {
      this.statusFilter.set(value);
    }
  }

  setSearchParam(value: string) {
    this.searchParam.set(value);
  }

  setDraftVariant(rowId: number, value: string) {
    const variantId = Number(value);
    this.draftItems.update((current) =>
      current.map((item) =>
        item.rowId === rowId
          ? { ...item, variantId: Number.isFinite(variantId) && variantId > 0 ? variantId : null }
          : item
      )
    );
  }

  setDraftQuantity(rowId: number, value: string) {
    const quantity = Number(value);
    this.draftItems.update((current) =>
      current.map((item) =>
        item.rowId === rowId
          ? { ...item, quantity: Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 0 }
          : item
      )
    );
  }

  saveTransfer() {
    const fromStoreId = this.fromStoreId();
    const toStoreId = this.toStoreId();

    if (!fromStoreId || !toStoreId) {
      this.alertService.show('Debes seleccionar tienda de origen y destino', 'warning', 3000);
      return;
    }

    if (fromStoreId === toStoreId) {
      this.alertService.show('La tienda de origen y destino no pueden ser la misma', 'warning', 3000);
      return;
    }

    const itemAccumulator = new Map<number, number>();
    this.draftItems().forEach((item) => {
      const variantId = Number(item.variantId ?? 0);
      const quantity = Number(item.quantity ?? 0);
      if (!Number.isInteger(variantId) || variantId <= 0 || quantity <= 0) {
        return;
      }

      const currentQuantity = itemAccumulator.get(variantId) ?? 0;
      itemAccumulator.set(variantId, currentQuantity + Math.floor(quantity));
    });

    const items = Array.from(itemAccumulator.entries()).map(([variantId, quantity]) => ({ variantId, quantity }));
    if (!items.length) {
      this.alertService.show('Debes agregar al menos una variante con cantidad valida', 'warning', 3000);
      return;
    }

    this.creatingTransfer.set(true);
    this.inventoryService.createStockTransfer({
      fromStoreId,
      toStoreId,
      items,
      note: this.transferNote().trim() || undefined,
    }).subscribe({
      next: () => {
        this.alertService.show('Transferencia creada correctamente', 'success', 3000);
        this.closeCreateTransferDrawer();
        this.loadTransfers();
      },
      error: (error: unknown) => {
        console.error('Error al crear transferencia:', error);
        this.alertService.show(this.getErrorMessage(error, 'Error al crear transferencia'), 'error', 3500);
      },
      complete: () => {
        this.creatingTransfer.set(false);
      }
    });
  }

  receiveTransfer(transfer: StockTransfer) {
    if (!transfer?.id) {
      return;
    }

    if (transfer.status === 'RECEIVED') {
      this.alertService.show('Esta transferencia ya fue recibida', 'info', 2500);
      return;
    }

    if (transfer.status === 'CANCELLED') {
      this.alertService.show('No se puede recibir una transferencia cancelada', 'warning', 3000);
      return;
    }

    this.receivingTransferIds.update((ids) => (ids.includes(transfer.id) ? ids : [...ids, transfer.id]));
    this.inventoryService.receiveStockTransfer(transfer.id).subscribe({
      next: () => {
        this.alertService.show(`Transferencia ${transfer.code} recibida`, 'success', 3000);
        this.loadTransfers();
      },
      error: (error: unknown) => {
        console.error('Error al recibir transferencia:', error);
        this.alertService.show(this.getErrorMessage(error, 'Error al recibir transferencia'), 'error', 3500);
      },
      complete: () => {
        this.receivingTransferIds.update((ids) => ids.filter((id) => id !== transfer.id));
      }
    });
  }

  isReceiving(transferId: number): boolean {
    return this.receivingTransferIds().includes(transferId);
  }

  getStatusLabel(status: StockTransferStatus): string {
    const labels: Record<StockTransferStatus, string> = {
      PENDING: 'Pendiente',
      IN_TRANSIT: 'En transito',
      RECEIVED: 'Recibida',
      CANCELLED: 'Cancelada',
    };

    return labels[status] ?? status;
  }

  getStatusBadgeClass(status: StockTransferStatus): string {
    switch (status) {
      case 'PENDING':
        return 'badge-warning';
      case 'IN_TRANSIT':
        return 'badge-info';
      case 'RECEIVED':
        return 'badge-success';
      case 'CANCELLED':
        return 'badge-error';
      default:
        return 'badge-neutral';
    }
  }

  getCreatedByLabel(transfer: StockTransfer): string {
    const firstName = transfer.createdBy?.firstName ?? '';
    const lastName = transfer.createdBy?.lastName ?? '';
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || '-';
  }

  getReceivedByLabel(transfer: StockTransfer): string {
    const firstName = transfer.receivedBy?.firstName ?? '';
    const lastName = transfer.receivedBy?.lastName ?? '';
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || '-';
  }

  getTransferItemsSummary(transfer: StockTransfer): string {
    const items = transfer.items ?? [];
    if (!items.length) {
      return '-';
    }

    const summary = items
      .slice(0, 2)
      .map((item) => {
        const productName = item.variant?.product?.name ?? 'Variante';
        const sku = item.variant?.sku ?? `#${item.variantId}`;
        return `${productName} (${sku}) x${item.quantity}`;
      })
      .join(', ');

    return items.length > 2 ? `${summary} +${items.length - 2} mas` : summary;
  }

  getDraftRowVariantLabel(variantId: number | null): string {
    if (!variantId) {
      return '-';
    }

    const variant = this.variantCatalog().find((row) => row.variantId === variantId);
    return variant?.label ?? `Variante #${variantId}`;
  }

  getOriginVariantAvailableStock(variantId: number): number {
    return this.originVariantStockById()[variantId] ?? 0;
  }

  private loadOriginVariantsForStore(storeId: number | null) {
    if (!storeId) {
      this.loadingOriginInventory.set(false);
      this.originVariantStockById.set({});
      this.clearUnavailableDraftVariants();
      return;
    }

    const cachedAvailability = this.originAvailabilityCache.get(storeId);
    if (cachedAvailability) {
      this.loadingOriginInventory.set(false);
      this.originVariantStockById.set(cachedAvailability);
      this.clearUnavailableDraftVariants();
      return;
    }

    this.loadingOriginInventory.set(true);
    this.inventoryService.getInventories({ skip: 1, take: 1000, storeId, includeZero: false }).subscribe({
      next: (inventories: Inventory[]) => {
        if (this.fromStoreId() !== storeId) {
          return;
        }

        const availability: Record<number, number> = {};
        (inventories ?? []).forEach((inventory) => {
          const variantId = Number(inventory?.variant?.id || 0);
          if (!variantId) {
            return;
          }

          const availableStock = Number(inventory.availableStock ?? (inventory.stock - inventory.reservedStock));
          if (Number.isFinite(availableStock) && availableStock > 0) {
            availability[variantId] = Math.floor(availableStock);
          }
        });

        this.originAvailabilityCache.set(storeId, availability);
        this.originVariantStockById.set(availability);
        this.clearUnavailableDraftVariants();
      },
      error: (error: unknown) => {
        if (this.fromStoreId() !== storeId) {
          return;
        }

        console.error('Error al cargar inventario de tienda origen:', error);
        this.originVariantStockById.set({});
        this.clearUnavailableDraftVariants();
        this.alertService.show(this.getErrorMessage(error, 'Error al cargar variantes disponibles por tienda'), 'error', 3500);
      },
      complete: () => {
        if (this.fromStoreId() === storeId) {
          this.loadingOriginInventory.set(false);
        }
      }
    });
  }

  private clearUnavailableDraftVariants() {
    const originStock = this.originVariantStockById();
    let removedSelections = 0;

    this.draftItems.update((current) =>
      current.map((item) => {
        const variantId = Number(item.variantId ?? 0);
        if (!variantId) {
          return item;
        }

        if ((originStock[variantId] ?? 0) <= 0) {
          removedSelections += 1;
          return { ...item, variantId: null };
        }

        return item;
      })
    );

    if (removedSelections > 0) {
      this.alertService.show(
        'Se limpiaron variantes que no tienen stock disponible en la tienda de origen seleccionada.',
        'warning',
        3000
      );
    }
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      return error.error?.message || error.error?.error || error.message || fallback;
    }

    if (typeof error === 'object' && error !== null) {
      const unknownError = error as any;
      return unknownError.error?.message || unknownError.error?.error || unknownError.message || fallback;
    }

    return fallback;
  }
}
