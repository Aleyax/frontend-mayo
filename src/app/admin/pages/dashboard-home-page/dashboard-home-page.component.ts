import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Inventory, StockTransfer } from '../../../inventory/interfaces/inventory.interface';
import { InventoryService } from '../../../inventory/services/inventory.service';
import { OrderService } from '../../../order/services/order.service';
import { Store } from '../../../store/interfaces/store.interface';
import { StoreService } from '../../../store/services/store.service';
import { AlertService } from '../../../shared/services/alert.service';

type SalesChannel = 'POS' | 'ECOMMERCE' | 'INTERNAL';
type StockScope = 'critical-total' | 'out' | 'critical' | 'low' | 'normal';

interface DashboardOrder {
  id: number;
  status: string;
  total: number | string;
  createdAt: string;
  updatedAt?: string;
  salesChannel?: string;
  sourceStore?: {
    id?: number;
    name?: string;
  };
  items?: DashboardOrderItem[];
  pickingSession?: {
    status?: string;
    createdAt?: string;
    updatedAt?: string;
  } | null;
}

interface DashboardOrderItem {
  quantity?: number | string;
  subtotal?: number | string;
  unitPrice?: number | string;
  variant?: {
    id?: number;
    sku?: string;
    product?: {
      id?: number;
      name?: string;
    };
    color?: {
      name?: string;
    };
    size?: {
      name?: string;
    };
  };
}

interface TopSaleMetric {
  label: string;
  quantity: number;
  total: number;
}

interface SalesByChannelMetric {
  channel: SalesChannel;
  total: number;
  orders: number;
}

interface SalesTrendMetric {
  label: string;
  total: number;
  orders: number;
}

interface ReplenishMetric {
  product: string;
  variant: string;
  store: string;
  available: number;
  reserved: number;
  recommendation: string;
}

interface StockSummaryMetric {
  outOfStock: number;
  critical: number;
  low: number;
  normal: number;
}

interface PendingOrdersMetric {
  pending: number;
  paidWithoutPicking: number;
  pickingInProgress: number;
  readyToDeliver: number;
  overdue: number;
}

interface PickingMetric {
  pending: number;
  inProgress: number;
  completedToday: number;
  avgPreparationMinutes: number | null;
}

interface StoreSalesMetric {
  storeName: string;
  total: number;
  orders: number;
  ticketAverage: number;
}

interface OperationalAlertMetric {
  label: string;
  value: number;
}

interface DashboardMetrics {
  salesToday: number;
  ordersToday: number;
  avgTicketToday: number;
  salesYesterday: number;
  salesVsYesterdayPct: number | null;
  weeklySales: number;
  weeklyOrders: number;
  salesByChannel: SalesByChannelMetric[];
  salesTrend: SalesTrendMetric[];
  topProductsToday: TopSaleMetric[];
  topProductsWeek: TopSaleMetric[];
  topVariantsToday: TopSaleMetric[];
  topVariantsWeek: TopSaleMetric[];
  replenishList: ReplenishMetric[];
  stockSummary: StockSummaryMetric;
  pendingOrders: PendingOrdersMetric;
  picking: PickingMetric;
  salesByStore: StoreSalesMetric[];
  alerts: OperationalAlertMetric[];
}

@Component({
  selector: 'app-dashboard-home-page',
  templateUrl: './dashboard-home-page.component.html',
  styleUrls: ['./dashboard-home-page.component.css'],
  standalone: true,
  imports: [CommonModule]
})
export class DashboardHomePageComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly orderService = inject(OrderService);
  private readonly inventoryService = inject(InventoryService);
  private readonly storeService = inject(StoreService);
  private readonly alertService = inject(AlertService);

  private readonly salesEligibleStatuses = new Set(['CONFIRMED', 'WAITING_TRANSFER', 'PREPARING', 'READY', 'DELIVERED']);
  private readonly pendingOrderStatuses = new Set(['PENDING', 'CONFIRMED', 'WAITING_TRANSFER', 'PREPARING', 'READY']);
  private readonly maxOrderPages = 60;
  private readonly currencyFormatter = new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  readonly loading = signal<boolean>(false);
  readonly loadingMessage = signal<string>('Cargando dashboard...');
  readonly error = signal<string>('');
  readonly lastUpdated = signal<Date | null>(null);
  readonly metrics = signal<DashboardMetrics>(this.createEmptyMetrics());

  readonly kpis = computed(() => {
    const dashboard = this.metrics();
    return {
      salesToday: this.formatCurrency(dashboard.salesToday),
      ordersToday: dashboard.ordersToday,
      avgTicketToday: this.formatCurrency(dashboard.avgTicketToday),
      criticalProducts: dashboard.stockSummary.outOfStock + dashboard.stockSummary.critical,
      salesVsYesterdayLabel: this.getVsYesterdayLabel(dashboard.salesVsYesterdayPct),
    };
  });

  readonly weekSummary = computed(() => {
    const dashboard = this.metrics();
    return {
      sales: this.formatCurrency(dashboard.weeklySales),
      orders: dashboard.weeklyOrders,
      ticket: this.formatCurrency(dashboard.weeklyOrders > 0 ? dashboard.weeklySales / dashboard.weeklyOrders : 0),
    };
  });

  readonly salesTrendMax = computed(() => {
    const values = this.metrics().salesTrend.map((item) => item.total);
    if (!values.length) {
      return 0;
    }
    return Math.max(...values);
  });

  ngOnInit() {
    void this.loadDashboard();
  }

  async loadDashboard() {
    this.loading.set(true);
    this.error.set('');
    this.loadingMessage.set('Cargando metricas de ventas...');

    try {
      const now = new Date();
      const todayRange = this.getDayRange(0);
      const yesterdayRange = this.getDayRange(-1);
      const weekRange = this.getCurrentWeekRange();
      const rollingStart = this.getDaysAgoStart(14);

      const [
        recentOrders,
        pendingCount,
        confirmedCount,
        waitingTransferCount,
        preparingCount,
        readyCount,
        inventories,
        transfers,
        stores
      ] = await Promise.all([
        this.fetchOrdersPaginated({
          startDate: rollingStart.toISOString(),
          endDate: todayRange.end.toISOString(),
        }),
        this.fetchOrderCountByStatus('PENDING'),
        this.fetchOrderCountByStatus('CONFIRMED'),
        this.fetchOrderCountByStatus('WAITING_TRANSFER'),
        this.fetchOrderCountByStatus('PREPARING'),
        this.fetchOrderCountByStatus('READY'),
        this.fetchInventories(),
        this.fetchTransfers(),
        this.fetchStores(),
      ]);

      this.loadingMessage.set('Procesando metricas operativas...');
      const todayOrders = this.filterOrdersByRange(recentOrders, todayRange.start, todayRange.end);
      const yesterdayOrders = this.filterOrdersByRange(recentOrders, yesterdayRange.start, yesterdayRange.end);
      const weekOrders = this.filterOrdersByRange(recentOrders, weekRange.start, weekRange.end);

      const todaySalesOrders = this.filterSalesOrders(todayOrders);
      const yesterdaySalesOrders = this.filterSalesOrders(yesterdayOrders);
      const weekSalesOrders = this.filterSalesOrders(weekOrders);

      const salesToday = this.sumOrderTotals(todaySalesOrders);
      const salesYesterday = this.sumOrderTotals(yesterdaySalesOrders);
      const ordersToday = todaySalesOrders.length;
      const weeklySales = this.sumOrderTotals(weekSalesOrders);
      const weeklyOrders = weekSalesOrders.length;
      const avgTicketToday = ordersToday > 0 ? salesToday / ordersToday : 0;
      const salesVsYesterdayPct = this.computePercentageChange(salesYesterday, salesToday);

      const topProductsToday = this.aggregateTopSales(todaySalesOrders, 'product');
      const topProductsWeek = this.aggregateTopSales(weekSalesOrders, 'product');
      const topVariantsToday = this.aggregateTopSales(todaySalesOrders, 'variant');
      const topVariantsWeek = this.aggregateTopSales(weekSalesOrders, 'variant');

      const stockSummary = this.buildStockSummary(inventories);
      const replenishList = this.buildReplenishList(inventories);
      const paidWithoutPicking = confirmedCount + waitingTransferCount;
      const overdueCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const overdue = recentOrders.filter((order) => this.isPendingOrder(order) && this.getSafeDate(order.createdAt) < overdueCutoff).length;
      const completedToday = this.countPickingCompletedToday(todayOrders);

      const dashboard: DashboardMetrics = {
        salesToday,
        ordersToday,
        avgTicketToday,
        salesYesterday,
        salesVsYesterdayPct,
        weeklySales,
        weeklyOrders,
        salesByChannel: this.buildSalesByChannel(todaySalesOrders),
        salesTrend: this.buildSalesTrend(recentOrders),
        topProductsToday,
        topProductsWeek,
        topVariantsToday,
        topVariantsWeek,
        replenishList,
        stockSummary,
        pendingOrders: {
          pending: pendingCount,
          paidWithoutPicking,
          pickingInProgress: preparingCount,
          readyToDeliver: readyCount,
          overdue,
        },
        picking: {
          pending: paidWithoutPicking,
          inProgress: preparingCount,
          completedToday,
          avgPreparationMinutes: this.computeAveragePreparationMinutes(recentOrders),
        },
        salesByStore: this.buildSalesByStore(todaySalesOrders, stores),
        alerts: this.buildOperationalAlerts({
          stockCritical: stockSummary.outOfStock + stockSummary.critical,
          paidWithoutPicking,
          pendingTransfers: transfers.filter((transfer) => transfer.status === 'PENDING' || transfer.status === 'IN_TRANSIT').length,
          readyOrders: readyCount,
        }),
      };

      this.metrics.set(dashboard);
      this.lastUpdated.set(new Date());
    } catch (error) {
      console.error('Error loading dashboard metrics:', error);
      this.error.set('No se pudieron cargar las metricas del dashboard.');
      this.alertService.show('No se pudieron cargar las metricas del dashboard', 'error', 3500);
    } finally {
      this.loading.set(false);
    }
  }

  formatCurrency(value: number): string {
    return this.currencyFormatter.format(Number.isFinite(value) ? value : 0);
  }

  formatPercent(value: number | null): string {
    if (value === null || !Number.isFinite(value)) {
      return 'Sin base';
    }
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  }

  getTrendClass(value: number | null): string {
    if (value === null || !Number.isFinite(value)) {
      return 'neutral';
    }
    if (value > 0) {
      return 'positive';
    }
    if (value < 0) {
      return 'negative';
    }
    return 'neutral';
  }

  getSalesTrendWidth(value: number, max: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
      return 0;
    }
    if (value <= 0) {
      return 0;
    }
    const width = (value / max) * 100;
    return Math.max(5, Math.min(100, width));
  }

  goToCriticalProducts(): void {
    this.goToInventoryStockScope('critical-total');
  }

  goToInventoryStockScope(scope: StockScope): void {
    void this.router.navigate(['/admin/inventory'], {
      queryParams: {
        stockScope: scope,
        showAdvanced: '1',
      },
    });
  }

  goToOrdersByStatus(status: 'PENDING' | 'READY'): void {
    void this.router.navigate(['/admin/orders/list'], {
      queryParams: {
        status,
      },
    });
  }

  goToPaidWithoutPicking(): void {
    void this.router.navigate(['/admin/orders/picking'], {
      queryParams: {
        status: 'CONFIRMED',
      },
    });
  }

  goToPickingBoard(status: '' | 'PREPARING' | 'READY' | 'CONFIRMED' = ''): void {
    const queryParams = status ? { status } : undefined;
    void this.router.navigate(['/admin/orders/picking'], queryParams ? { queryParams } : undefined);
  }

  goToOverdueOrders(): void {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    void this.router.navigate(['/admin/orders/list'], {
      queryParams: {
        status: 'PENDING',
        endDate: cutoff.toISOString(),
      },
    });
  }

  private getVsYesterdayLabel(value: number | null): string {
    if (value === null) {
      return 'vs ayer: Sin base';
    }
    return `vs ayer: ${this.formatPercent(value)}`;
  }

  private createEmptyMetrics(): DashboardMetrics {
    return {
      salesToday: 0,
      ordersToday: 0,
      avgTicketToday: 0,
      salesYesterday: 0,
      salesVsYesterdayPct: null,
      weeklySales: 0,
      weeklyOrders: 0,
      salesByChannel: [
        { channel: 'POS', total: 0, orders: 0 },
        { channel: 'ECOMMERCE', total: 0, orders: 0 },
        { channel: 'INTERNAL', total: 0, orders: 0 },
      ],
      salesTrend: [],
      topProductsToday: [],
      topProductsWeek: [],
      topVariantsToday: [],
      topVariantsWeek: [],
      replenishList: [],
      stockSummary: {
        outOfStock: 0,
        critical: 0,
        low: 0,
        normal: 0,
      },
      pendingOrders: {
        pending: 0,
        paidWithoutPicking: 0,
        pickingInProgress: 0,
        readyToDeliver: 0,
        overdue: 0,
      },
      picking: {
        pending: 0,
        inProgress: 0,
        completedToday: 0,
        avgPreparationMinutes: null,
      },
      salesByStore: [],
      alerts: [],
    };
  }

  private async fetchOrdersPaginated(params: {
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<DashboardOrder[]> {
    const orders: DashboardOrder[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const response = await firstValueFrom(
        this.orderService.listOrders({
          ...params,
          page,
          limit: 100,
        })
      );

      const data = Array.isArray(response?.data) ? (response.data as DashboardOrder[]) : [];
      orders.push(...data);
      totalPages = this.parsePositiveInteger(response?.pagination?.totalPages, 1);
      page += 1;
    } while (page <= totalPages && page <= this.maxOrderPages);

    return orders;
  }

  private async fetchOrderCountByStatus(status: string): Promise<number> {
    const response = await firstValueFrom(
      this.orderService.listOrders({
        status,
        page: 1,
        limit: 1,
      })
    );

    return this.parsePositiveInteger(response?.pagination?.total, 0);
  }

  private async fetchInventories(): Promise<Inventory[]> {
    const take = 400;
    const inventories: Inventory[] = [];
    let page = 1;
    let keepLoading = true;

    while (keepLoading) {
      const response = await firstValueFrom(
        this.inventoryService.getInventories({
          skip: page,
          take,
          includeZero: true,
        })
      );

      const batch = Array.isArray(response) ? response : [];
      inventories.push(...batch);

      if (batch.length < take || page >= 10) {
        keepLoading = false;
      } else {
        page += 1;
      }
    }

    return inventories;
  }

  private async fetchTransfers(): Promise<StockTransfer[]> {
    const transfers = await firstValueFrom(this.inventoryService.listTransfers());
    return Array.isArray(transfers) ? transfers : [];
  }

  private async fetchStores(): Promise<Store[]> {
    const stores = await firstValueFrom(this.storeService.getStores({ skip: 1, take: 300, includeInactive: false }));
    return Array.isArray(stores) ? stores : [];
  }

  private parsePositiveInteger(value: unknown, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }

  private getDayRange(offsetDays: number): { start: Date; end: Date } {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() + offsetDays);

    const start = new Date(base);
    const end = new Date(base);
    end.setHours(23, 59, 59, 999);

    return { start, end };
  }

  private getCurrentWeekRange(): { start: Date; end: Date } {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const mondayOffset = (dayOfWeek + 6) % 7;

    const start = new Date(today);
    start.setDate(today.getDate() - mondayOffset);
    start.setHours(0, 0, 0, 0);

    const end = new Date(today);
    end.setHours(23, 59, 59, 999);

    return { start, end };
  }

  private getDaysAgoStart(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() - days);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private filterOrdersByRange(orders: DashboardOrder[], start: Date, end: Date): DashboardOrder[] {
    return orders.filter((order) => {
      const createdAt = this.getSafeDate(order.createdAt);
      return createdAt >= start && createdAt <= end;
    });
  }

  private filterSalesOrders(orders: DashboardOrder[]): DashboardOrder[] {
    return orders.filter((order) => this.salesEligibleStatuses.has(this.normalizeStatus(order.status)));
  }

  private sumOrderTotals(orders: DashboardOrder[]): number {
    return orders.reduce((total, order) => total + this.toNumber(order.total), 0);
  }

  private normalizeStatus(status: string | null | undefined): string {
    return String(status || '').trim().toUpperCase();
  }

  private normalizeChannel(channel: string | null | undefined): SalesChannel {
    const normalized = String(channel || '').trim().toUpperCase();
    if (normalized === 'POS' || normalized === 'ECOMMERCE' || normalized === 'INTERNAL') {
      return normalized;
    }
    return 'INTERNAL';
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }
    if (typeof value === 'string') {
      const normalized = value.replace(',', '.');
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private getSafeDate(value: string | undefined): Date {
    const parsed = value ? new Date(value) : new Date(0);
    if (Number.isNaN(parsed.getTime())) {
      return new Date(0);
    }
    return parsed;
  }

  private computePercentageChange(previous: number, current: number): number | null {
    if (previous <= 0) {
      return current > 0 ? 100 : null;
    }
    return ((current - previous) / previous) * 100;
  }

  private aggregateTopSales(orders: DashboardOrder[], mode: 'product' | 'variant'): TopSaleMetric[] {
    const accumulator = new Map<string, TopSaleMetric>();

    for (const order of orders) {
      for (const item of order.items ?? []) {
        const quantity = this.toNumber(item.quantity);
        const subtotal = this.resolveItemSubtotal(item);
        if (quantity <= 0) {
          continue;
        }

        const productName = item.variant?.product?.name?.trim() || 'Producto';
        const colorName = item.variant?.color?.name?.trim() || 'Sin color';
        const sizeName = item.variant?.size?.name?.trim() || 'Sin talla';
        const productKey = String(item.variant?.product?.id || productName);
        const variantKey = String(item.variant?.id || `${productName}-${colorName}-${sizeName}`);

        const key = mode === 'product' ? productKey : variantKey;
        const label = mode === 'product' ? productName : `${productName} - ${colorName} - ${sizeName}`;

        const existing = accumulator.get(key);
        if (existing) {
          existing.quantity += quantity;
          existing.total += subtotal;
          continue;
        }

        accumulator.set(key, {
          label,
          quantity,
          total: subtotal,
        });
      }
    }

    return Array.from(accumulator.values())
      .sort((a, b) => {
        if (b.quantity !== a.quantity) {
          return b.quantity - a.quantity;
        }
        return b.total - a.total;
      })
      .slice(0, 5);
  }

  private resolveItemSubtotal(item: DashboardOrderItem): number {
    const subtotal = this.toNumber(item.subtotal);
    if (subtotal > 0) {
      return subtotal;
    }
    const quantity = this.toNumber(item.quantity);
    const unitPrice = this.toNumber(item.unitPrice);
    return quantity * unitPrice;
  }

  private buildSalesByChannel(orders: DashboardOrder[]): SalesByChannelMetric[] {
    const base: Record<SalesChannel, SalesByChannelMetric> = {
      POS: { channel: 'POS', total: 0, orders: 0 },
      ECOMMERCE: { channel: 'ECOMMERCE', total: 0, orders: 0 },
      INTERNAL: { channel: 'INTERNAL', total: 0, orders: 0 },
    };

    for (const order of orders) {
      const channel = this.normalizeChannel(order.salesChannel);
      base[channel].orders += 1;
      base[channel].total += this.toNumber(order.total);
    }

    return [base.POS, base.ECOMMERCE, base.INTERNAL];
  }

  private buildSalesTrend(orders: DashboardOrder[]): SalesTrendMetric[] {
    const metrics: SalesTrendMetric[] = [];
    const dailyRanges = this.getLastDaysRanges(7);

    for (const range of dailyRanges) {
      const dayOrders = this.filterSalesOrders(this.filterOrdersByRange(orders, range.start, range.end));
      metrics.push({
        label: range.label,
        total: this.sumOrderTotals(dayOrders),
        orders: dayOrders.length,
      });
    }

    return metrics;
  }

  private getLastDaysRanges(days: number): Array<{ start: Date; end: Date; label: string }> {
    const ranges: Array<{ start: Date; end: Date; label: string }> = [];
    for (let index = days - 1; index >= 0; index -= 1) {
      const target = this.getDayRange(-index);
      ranges.push({
        start: target.start,
        end: target.end,
        label: `${String(target.start.getDate()).padStart(2, '0')}/${String(target.start.getMonth() + 1).padStart(2, '0')}`,
      });
    }
    return ranges;
  }

  private buildReplenishList(inventories: Inventory[]): ReplenishMetric[] {
    const rows: ReplenishMetric[] = inventories
      .map((inventory) => {
        const available = this.toNumber(
          typeof inventory.availableStock === 'number'
            ? inventory.availableStock
            : inventory.stock - inventory.reservedStock
        );

        return {
          product: inventory.variant?.product?.name || 'Producto',
          variant: this.getVariantLabel(inventory),
          store: inventory.store?.name || 'Sin tienda',
          available,
          reserved: this.toNumber(inventory.reservedStock),
          recommendation: this.getReplenishRecommendation(available),
        };
      })
      .filter((row) => row.available <= 5)
      .sort((a, b) => a.available - b.available);

    return rows.slice(0, 12);
  }

  private getVariantLabel(inventory: Inventory): string {
    const color = inventory.variant?.color?.name || 'Sin color';
    const size = inventory.variant?.size?.name || 'Sin talla';
    const sku = inventory.variant?.sku ? `(${inventory.variant.sku})` : '';
    return `${color} / ${size} ${sku}`.trim();
  }

  private getReplenishRecommendation(available: number): string {
    if (available <= 0) {
      return 'Sin stock - reponer urgente';
    }
    if (available <= 2) {
      return 'Reponer urgente';
    }
    return 'Reponer pronto';
  }

  private buildStockSummary(inventories: Inventory[]): StockSummaryMetric {
    const summary: StockSummaryMetric = {
      outOfStock: 0,
      critical: 0,
      low: 0,
      normal: 0,
    };

    for (const inventory of inventories) {
      const available = this.toNumber(
        typeof inventory.availableStock === 'number'
          ? inventory.availableStock
          : inventory.stock - inventory.reservedStock
      );

      if (available <= 0) {
        summary.outOfStock += 1;
      } else if (available <= 3) {
        summary.critical += 1;
      } else if (available <= 10) {
        summary.low += 1;
      } else {
        summary.normal += 1;
      }
    }

    return summary;
  }

  private isPendingOrder(order: DashboardOrder): boolean {
    return this.pendingOrderStatuses.has(this.normalizeStatus(order.status));
  }

  private countPickingCompletedToday(orders: DashboardOrder[]): number {
    return orders.filter((order) => {
      const sessionStatus = this.normalizeStatus(order.pickingSession?.status);
      if (sessionStatus === 'COMPLETED') {
        return true;
      }

      const orderStatus = this.normalizeStatus(order.status);
      return orderStatus === 'READY' || orderStatus === 'DELIVERED';
    }).length;
  }

  private computeAveragePreparationMinutes(orders: DashboardOrder[]): number | null {
    const minutes = orders
      .map((order) => {
        const session = order.pickingSession;
        if (!session || this.normalizeStatus(session.status) !== 'COMPLETED') {
          return null;
        }

        const createdAt = this.getSafeDate(session.createdAt);
        const updatedAt = this.getSafeDate(session.updatedAt);
        const diffMs = updatedAt.getTime() - createdAt.getTime();
        if (diffMs <= 0) {
          return null;
        }
        return diffMs / (1000 * 60);
      })
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);

    if (!minutes.length) {
      return null;
    }

    const total = minutes.reduce((sum, value) => sum + value, 0);
    return total / minutes.length;
  }

  private buildSalesByStore(orders: DashboardOrder[], stores: Store[]): StoreSalesMetric[] {
    const map = new Map<string, StoreSalesMetric>();

    for (const store of stores) {
      if (!store?.name) {
        continue;
      }

      map.set(store.name, {
        storeName: store.name,
        total: 0,
        orders: 0,
        ticketAverage: 0,
      });
    }

    for (const order of orders) {
      const storeName = order.sourceStore?.name?.trim() || 'Sin tienda';
      const current = map.get(storeName) ?? {
        storeName,
        total: 0,
        orders: 0,
        ticketAverage: 0,
      };

      current.orders += 1;
      current.total += this.toNumber(order.total);
      current.ticketAverage = current.orders > 0 ? current.total / current.orders : 0;
      map.set(storeName, current);
    }

    return Array.from(map.values())
      .filter((row) => row.orders > 0)
      .sort((a, b) => b.total - a.total);
  }

  private buildOperationalAlerts(input: {
    stockCritical: number;
    paidWithoutPicking: number;
    pendingTransfers: number;
    readyOrders: number;
  }): OperationalAlertMetric[] {
    return [
      { label: 'productos con stock critico', value: input.stockCritical },
      { label: 'ordenes pagadas sin picking', value: input.paidWithoutPicking },
      { label: 'transferencias pendientes de recepcion', value: input.pendingTransfers },
      { label: 'ordenes listas sin entregar', value: input.readyOrders },
    ];
  }
}
