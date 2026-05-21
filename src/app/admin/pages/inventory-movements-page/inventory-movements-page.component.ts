import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { InventoryService } from '../../../inventory/services/inventory.service';
import { InventoryMovement, InventoryMovementType } from '../../../inventory/interfaces/inventory.interface';
import { AlertService } from '../../../shared/services/alert.service';

type MovementTypeFilter = 'ALL' | InventoryMovementType;

@Component({
  selector: 'app-inventory-movements-page',
  templateUrl: './inventory-movements-page.component.html',
  styleUrls: ['./inventory-movements-page.component.css'],
  standalone: true,
  imports: [CommonModule, DatePipe, RouterLink]
})
export class InventoryMovementsPageComponent implements OnInit {
  private readonly inventoryService = inject(InventoryService);
  private readonly alertService = inject(AlertService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  movementsData = signal<InventoryMovement[]>([]);
  loading = signal<boolean>(false);
  searchParam = signal<string>('');
  movementTypeFilter = signal<MovementTypeFilter>('ALL');
  inventoryIdFilter = signal<number | null>(null);

  filteredMovements = computed<InventoryMovement[]>(() => {
    const query = this.searchParam().trim().toLowerCase();
    const typeFilter = this.movementTypeFilter();
    const inventoryId = this.inventoryIdFilter();

    return this.movementsData()
      .filter((movement) => {
        const movementInventoryId = Number(movement?.inventory?.id || 0);
        if (inventoryId && movementInventoryId !== inventoryId) {
          return false;
        }

        if (typeFilter !== 'ALL' && movement.type !== typeFilter) {
          return false;
        }

        if (!query) {
          return true;
        }

        const variant = movement.inventory?.variant;
        const store = movement.inventory?.store;
        const rowText = [
          variant?.sku,
          variant?.product?.name,
          variant?.color?.name,
          variant?.size?.name,
          store?.name,
          store?.code,
          movement.type,
          movement.note,
        ]
          .filter((value) => typeof value === 'string' && value.trim().length > 0)
          .join(' ')
          .toLowerCase();

        return rowText.includes(query);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  });

  get totalCount() {
    return this.movementsData().length;
  }

  get filteredCount() {
    return this.filteredMovements().length;
  }

  ngOnInit() {
    this.readQueryFilters();
    this.loadMovements();
  }

  private readQueryFilters() {
    const inventoryId = Number(this.route.snapshot.queryParamMap.get('inventoryId') || 0);
    this.inventoryIdFilter.set(Number.isInteger(inventoryId) && inventoryId > 0 ? inventoryId : null);
  }

  loadMovements() {
    this.loading.set(true);
    this.inventoryService.listMovements().subscribe({
      next: (movements) => {
        this.movementsData.set(movements || []);
      },
      error: (error: unknown) => {
        console.error('Error al cargar movimientos:', error);
        this.alertService.show('Error al cargar movimientos de inventario', 'error', 3000);
      },
      complete: () => {
        this.loading.set(false);
      }
    });
  }

  refresh() {
    this.loadMovements();
  }

  setSearchParam(value: string) {
    this.searchParam.set(value);
  }

  setMovementTypeFilter(value: string) {
    const allowed: MovementTypeFilter[] = ['ALL', 'IN', 'OUT', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN', 'RESERVED', 'UNRESERVED'];
    const normalized = value as MovementTypeFilter;
    this.movementTypeFilter.set(allowed.includes(normalized) ? normalized : 'ALL');
  }

  clearInventoryFilter() {
    this.inventoryIdFilter.set(null);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { inventoryId: null },
      queryParamsHandling: 'merge'
    });
  }

  openTraceabilityForMovement(movement: InventoryMovement) {
    const inventoryId = Number(movement?.inventory?.id || 0);
    if (!Number.isInteger(inventoryId) || inventoryId <= 0) {
      this.router.navigate(['/admin/inventory/traceability']);
      return;
    }

    this.router.navigate(['/admin/inventory/traceability'], {
      queryParams: { inventoryId }
    });
  }

  getMovementTypeLabel(type: InventoryMovementType): string {
    const labels: Record<InventoryMovementType, string> = {
      IN: 'Ingreso',
      OUT: 'Salida',
      ADJUSTMENT: 'Ajuste',
      TRANSFER_OUT: 'Transferencia salida',
      TRANSFER_IN: 'Transferencia ingreso',
      RESERVED: 'Comprometido',
      UNRESERVED: 'Liberado',
    };

    return labels[type] ?? type;
  }

  getMovementSummary(movement: InventoryMovement): string {
    const productName = movement.inventory?.variant?.product?.name || 'Producto';
    const sku = movement.inventory?.variant?.sku || '-';
    const color = movement.inventory?.variant?.color?.name || 'Sin color';
    const size = movement.inventory?.variant?.size?.name || 'Sin talla';
    return `${productName} - ${color} / ${size} - ${sku}`;
  }

  getMovementStore(movement: InventoryMovement): string {
    const storeName = movement.inventory?.store?.name || '-';
    const storeCode = movement.inventory?.store?.code || '-';
    return `${storeName} (${storeCode})`;
  }
}
