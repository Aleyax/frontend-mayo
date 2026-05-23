import { Component, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { AlertComponent } from '../../../shared/components/alert/alert.component';
import { AlertService } from '../../../shared/services/alert.service';
import {
  AuditLogEntry,
  AuditLogListFilters,
  AuditLogService,
} from '../../services/audit-log.service';

@Component({
  selector: 'app-audit-log-page',
  standalone: true,
  imports: [CommonModule, DatePipe, AlertComponent],
  templateUrl: './audit-log-page.component.html',
  styleUrl: './audit-log-page.component.css'
})
export class AuditLogPageComponent implements OnInit {
  loading = signal<boolean>(false);
  logs = signal<AuditLogEntry[]>([]);
  selectedLog = signal<AuditLogEntry | null>(null);

  page = signal<number>(1);
  limit = signal<number>(20);
  total = signal<number>(0);
  totalPages = signal<number>(0);

  search = signal<string>('');
  method = signal<string>('');
  statusCode = signal<string>('');
  actorUserId = signal<string>('');
  path = signal<string>('');
  startDate = signal<string>('');
  endDate = signal<string>('');

  readonly availableMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];

  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly alertService: AlertService,
  ) {}

  ngOnInit(): void {
    this.loadLogs();
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

  loadLogs() {
    this.loading.set(true);

    this.auditLogService.list(this.buildFilters()).subscribe({
      next: (result) => {
        this.logs.set(result.data);
        this.page.set(result.pagination.page);
        this.limit.set(result.pagination.limit);
        this.total.set(result.pagination.total);
        this.totalPages.set(result.pagination.totalPages || Math.ceil(result.pagination.total / Math.max(result.pagination.limit, 1)));
        this.loading.set(false);
      },
      error: (error) => {
        this.loading.set(false);
        const message = error?.error?.error || 'No se pudo cargar la bitacora global';
        this.alertService.show(message, 'error', 3500);
      },
    });
  }

  applyFilters() {
    this.page.set(1);
    this.loadLogs();
  }

  clearFilters() {
    this.search.set('');
    this.method.set('');
    this.statusCode.set('');
    this.actorUserId.set('');
    this.path.set('');
    this.startDate.set('');
    this.endDate.set('');
    this.page.set(1);
    this.loadLogs();
  }

  goPreviousPage() {
    if (this.page() <= 1 || this.loading()) {
      return;
    }
    this.page.set(this.page() - 1);
    this.loadLogs();
  }

  goNextPage() {
    if (this.page() >= this.totalPages() || this.loading()) {
      return;
    }
    this.page.set(this.page() + 1);
    this.loadLogs();
  }

  refresh() {
    this.loadLogs();
  }

  openDetail(log: AuditLogEntry) {
    this.selectedLog.set(log);
  }

  closeDetail() {
    this.selectedLog.set(null);
  }

  getActorLabel(log: AuditLogEntry): string {
    const email = String(log?.actor?.email || '').trim();
    if (email.length > 0) {
      return email;
    }

    const userId = Number(log?.actor?.id || 0);
    if (Number.isInteger(userId) && userId > 0) {
      return `Usuario #${userId}`;
    }

    return 'Anonimo';
  }

  getStatusClass(statusCode: number): string {
    if (statusCode >= 500) return 'badge badge-error';
    if (statusCode >= 400) return 'badge badge-warning';
    if (statusCode >= 300) return 'badge badge-info';
    return 'badge badge-success';
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

  onMethodChange(value: string) {
    this.method.set(value);
  }

  onStatusCodeChange(value: string) {
    this.statusCode.set(value);
  }

  onActorUserIdChange(value: string) {
    this.actorUserId.set(value);
  }

  onPathChange(value: string) {
    this.path.set(value);
  }

  onStartDateChange(value: string) {
    this.startDate.set(value);
  }

  onEndDateChange(value: string) {
    this.endDate.set(value);
  }

  private buildFilters(): AuditLogListFilters {
    const filters: AuditLogListFilters = {
      page: this.page(),
      limit: this.limit(),
    };

    const search = this.search().trim();
    const method = this.method().trim();
    const statusCodeRaw = this.statusCode().trim();
    const actorUserIdRaw = this.actorUserId().trim();
    const path = this.path().trim();
    const startDate = this.startDate().trim();
    const endDate = this.endDate().trim();

    if (search.length > 0) filters.search = search;
    if (method.length > 0) filters.method = method;
    if (path.length > 0) filters.path = path;
    if (startDate.length > 0) filters.startDate = startDate;
    if (endDate.length > 0) filters.endDate = endDate;

    const statusCodeValue = Number(statusCodeRaw);
    if (statusCodeRaw.length > 0 && Number.isInteger(statusCodeValue)) {
      filters.statusCode = statusCodeValue;
    }

    const actorUserIdValue = Number(actorUserIdRaw);
    if (actorUserIdRaw.length > 0 && Number.isInteger(actorUserIdValue) && actorUserIdValue > 0) {
      filters.actorUserId = actorUserIdValue;
    }

    return filters;
  }
}
