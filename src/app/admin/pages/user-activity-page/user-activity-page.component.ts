import { Component, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { AlertComponent } from '../../../shared/components/alert/alert.component';
import { AlertService } from '../../../shared/services/alert.service';
import {
  UserActivityEntry,
  UserActivityListFilters,
  UserActivityService,
} from '../../services/user-activity.service';

@Component({
  selector: 'app-user-activity-page',
  standalone: true,
  imports: [CommonModule, DatePipe, AlertComponent],
  templateUrl: './user-activity-page.component.html',
  styleUrl: './user-activity-page.component.css'
})
export class UserActivityPageComponent implements OnInit {
  loading = signal<boolean>(false);
  activities = signal<UserActivityEntry[]>([]);
  selectedActivity = signal<UserActivityEntry | null>(null);

  page = signal<number>(1);
  limit = signal<number>(20);
  total = signal<number>(0);
  totalPages = signal<number>(0);

  search = signal<string>('');
  userId = signal<string>('');
  module = signal<string>('');
  actionType = signal<string>('');
  entityType = signal<string>('');
  startDate = signal<string>('');
  endDate = signal<string>('');

  readonly moduleOptions = ['INVENTORY', 'TRANSFERS', 'PICKING', 'POS', 'ORDERS', 'GENERAL'];

  constructor(
    private readonly userActivityService: UserActivityService,
    private readonly alertService: AlertService,
  ) {}

  ngOnInit(): void {
    this.loadActivities();
  }

  get fromItem(): number {
    if (this.total() === 0) {
      return 0;
    }
    return (this.page() - 1) * this.limit() + 1;
  }

  get toItem(): number {
    return Math.min(this.total(), this.page() * this.limit());
  }

  loadActivities() {
    this.loading.set(true);

    this.userActivityService.list(this.buildFilters()).subscribe({
      next: (result) => {
        this.activities.set(result.data);
        this.page.set(result.pagination.page);
        this.limit.set(result.pagination.limit);
        this.total.set(result.pagination.total);
        this.totalPages.set(result.pagination.totalPages || Math.ceil(result.pagination.total / Math.max(result.pagination.limit, 1)));
        this.loading.set(false);
      },
      error: (error) => {
        this.loading.set(false);
        const message = error?.error?.error || 'No se pudo cargar la auditoria de movimientos';
        this.alertService.show(message, 'error', 3500);
      },
    });
  }

  refresh() {
    this.loadActivities();
  }

  applyFilters() {
    this.page.set(1);
    this.loadActivities();
  }

  clearFilters() {
    this.search.set('');
    this.userId.set('');
    this.module.set('');
    this.actionType.set('');
    this.entityType.set('');
    this.startDate.set('');
    this.endDate.set('');
    this.page.set(1);
    this.loadActivities();
  }

  goPreviousPage() {
    if (this.page() <= 1 || this.loading()) {
      return;
    }
    this.page.set(this.page() - 1);
    this.loadActivities();
  }

  goNextPage() {
    if (this.page() >= this.totalPages() || this.loading()) {
      return;
    }
    this.page.set(this.page() + 1);
    this.loadActivities();
  }

  openDetail(activity: UserActivityEntry) {
    this.selectedActivity.set(activity);
  }

  closeDetail() {
    this.selectedActivity.set(null);
  }

  getUserLabel(activity: UserActivityEntry): string {
    const email = String(activity?.user?.email || '').trim();
    if (email.length > 0) return email;

    const userId = Number(activity?.user?.id || 0);
    if (Number.isInteger(userId) && userId > 0) return `Usuario #${userId}`;

    return 'Sistema';
  }

  getEntityLabel(activity: UserActivityEntry): string {
    const code = String(activity?.entity?.code || '').trim();
    if (code.length > 0) return code;

    const entityId = Number(activity?.entity?.id || 0);
    if (Number.isInteger(entityId) && entityId > 0) {
      return `${activity?.entity?.type || 'ENTIDAD'} #${entityId}`;
    }

    return activity?.entity?.type || '-';
  }

  getProductSummary(activity: UserActivityEntry): string {
    const products = Array.isArray(activity?.products) ? activity.products : [];
    if (products.length === 0) {
      return '-';
    }

    const first = products[0];
    const firstName = first?.productName || first?.sku || `Variante #${first?.variantId || '-'}`;
    if (products.length === 1) {
      return firstName;
    }
    return `${firstName} +${products.length - 1}`;
  }

  formatJson(value: unknown): string {
    if (value === null || value === undefined) {
      return '-';
    }

    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  onSearchChange(value: string) {
    this.search.set(value);
  }

  onUserIdChange(value: string) {
    this.userId.set(value);
  }

  onModuleChange(value: string) {
    this.module.set(value);
  }

  onActionTypeChange(value: string) {
    this.actionType.set(value);
  }

  onEntityTypeChange(value: string) {
    this.entityType.set(value);
  }

  onStartDateChange(value: string) {
    this.startDate.set(value);
  }

  onEndDateChange(value: string) {
    this.endDate.set(value);
  }

  private buildFilters(): UserActivityListFilters {
    const filters: UserActivityListFilters = {
      page: this.page(),
      limit: this.limit(),
    };

    const search = this.search().trim();
    const userIdRaw = this.userId().trim();
    const module = this.module().trim().toUpperCase();
    const actionType = this.actionType().trim().toUpperCase();
    const entityType = this.entityType().trim().toUpperCase();
    const startDate = this.startDate().trim();
    const endDate = this.endDate().trim();

    if (search.length > 0) filters.search = search;
    if (module.length > 0) filters.module = module;
    if (actionType.length > 0) filters.actionType = actionType;
    if (entityType.length > 0) filters.entityType = entityType;
    if (startDate.length > 0) filters.startDate = startDate;
    if (endDate.length > 0) filters.endDate = endDate;

    const userIdValue = Number(userIdRaw);
    if (userIdRaw.length > 0 && Number.isInteger(userIdValue) && userIdValue > 0) {
      filters.userId = userIdValue;
    }

    return filters;
  }
}
