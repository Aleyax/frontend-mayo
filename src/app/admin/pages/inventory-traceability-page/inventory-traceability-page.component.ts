import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { InventoryService } from '../../../inventory/services/inventory.service';
import { InventoryReservation, InventoryReservationStatus } from '../../../inventory/interfaces/inventory.interface';
import { AlertService } from '../../../shared/services/alert.service';

type ReservationStatusFilter = 'ALL' | InventoryReservationStatus;

@Component({
  selector: 'app-inventory-traceability-page',
  templateUrl: './inventory-traceability-page.component.html',
  styleUrls: ['./inventory-traceability-page.component.css'],
  standalone: true,
  imports: [CommonModule, DatePipe, RouterLink]
})
export class InventoryTraceabilityPageComponent implements OnInit {
  private readonly inventoryService = inject(InventoryService);
  private readonly alertService = inject(AlertService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  reservationsData = signal<InventoryReservation[]>([]);
  loading = signal<boolean>(false);
  searchParam = signal<string>('');
  statusFilter = signal<ReservationStatusFilter>('ALL');
  inventoryIdFilter = signal<number | null>(null);

  filteredReservations = computed<InventoryReservation[]>(() => {
    const query = this.searchParam().trim().toLowerCase();
    const status = this.statusFilter();
    const inventoryId = this.inventoryIdFilter();

    return this.reservationsData()
      .filter((reservation) => {
        const reservationInventoryId = Number(reservation.inventoryId || 0);
        if (inventoryId && reservationInventoryId !== inventoryId) {
          return false;
        }

        if (status !== 'ALL' && reservation.status !== status) {
          return false;
        }

        if (!query) {
          return true;
        }

        const variant = reservation.inventory?.variant;
        const store = reservation.inventory?.store;
        const order = reservation.order;
        const reservedBy = reservation.reservedBy;
        const rowText = [
          variant?.sku,
          variant?.product?.name,
          variant?.color?.name,
          variant?.size?.name,
          store?.name,
          store?.code,
          order?.code,
          order?.status,
          reservedBy ? `${reservedBy.firstName} ${reservedBy.lastName}` : '',
        ]
          .filter((value) => typeof value === 'string' && value.trim().length > 0)
          .join(' ')
          .toLowerCase();

        return rowText.includes(query);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  });

  get totalCount() {
    return this.reservationsData().length;
  }

  get filteredCount() {
    return this.filteredReservations().length;
  }

  ngOnInit() {
    this.readQueryFilters();
    this.loadReservations();
  }

  private readQueryFilters() {
    const inventoryId = Number(this.route.snapshot.queryParamMap.get('inventoryId') || 0);
    this.inventoryIdFilter.set(Number.isInteger(inventoryId) && inventoryId > 0 ? inventoryId : null);
  }

  loadReservations() {
    this.loading.set(true);
    const inventoryId = this.inventoryIdFilter();
    const options = inventoryId ? { inventoryId } : {};

    this.inventoryService.listReservations(options).subscribe({
      next: (reservations) => {
        this.reservationsData.set(reservations || []);
      },
      error: (error: unknown) => {
        console.error('Error al cargar trazabilidad:', error);
        this.alertService.show('Error al cargar trazabilidad de reservas', 'error', 3000);
      },
      complete: () => {
        this.loading.set(false);
      }
    });
  }

  refresh() {
    this.loadReservations();
  }

  setSearchParam(value: string) {
    this.searchParam.set(value);
  }

  setStatusFilter(value: string) {
    const allowed: ReservationStatusFilter[] = ['ALL', 'ACTIVE', 'RELEASED', 'COMPLETED'];
    const normalized = value as ReservationStatusFilter;
    this.statusFilter.set(allowed.includes(normalized) ? normalized : 'ALL');
  }

  clearInventoryFilter() {
    this.inventoryIdFilter.set(null);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { inventoryId: null },
      queryParamsHandling: 'merge'
    });
    this.loadReservations();
  }

  openOrderDetail(orderId?: number | null) {
    const parsedId = Number(orderId || 0);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      this.alertService.show('La reserva no tiene una orden asociada', 'warning', 3000);
      return;
    }

    this.router.navigate(['/admin/orders', parsedId]);
  }

  openMovementsForReservation(reservation: InventoryReservation) {
    const inventoryId = Number(reservation.inventoryId || 0);
    if (!Number.isInteger(inventoryId) || inventoryId <= 0) {
      this.router.navigate(['/admin/inventory/movements']);
      return;
    }

    this.router.navigate(['/admin/inventory/movements'], {
      queryParams: { inventoryId }
    });
  }

  getReservationStatusLabel(status: InventoryReservationStatus): string {
    const labels: Record<InventoryReservationStatus, string> = {
      ACTIVE: 'Activa',
      RELEASED: 'Liberada',
      COMPLETED: 'Completada',
    };
    return labels[status] ?? status;
  }

  getReservationItemSummary(reservation: InventoryReservation): string {
    const productName = reservation.inventory?.variant?.product?.name || 'Producto';
    const sku = reservation.inventory?.variant?.sku || '-';
    const color = reservation.inventory?.variant?.color?.name || 'Sin color';
    const size = reservation.inventory?.variant?.size?.name || 'Sin talla';
    return `${productName} - ${color} / ${size} - ${sku}`;
  }

  getReservationStoreSummary(reservation: InventoryReservation): string {
    const storeName = reservation.inventory?.store?.name || '-';
    const storeCode = reservation.inventory?.store?.code || '-';
    return `${storeName} (${storeCode})`;
  }
}
