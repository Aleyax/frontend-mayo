import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AlertComponent } from '../../../shared/components/alert/alert.component';
import { AlertService } from '../../../shared/services/alert.service';
import { SystemConfigService } from '../../services/system-config.service';
import { PaymentMethodService } from '../../../payment-method/services/payment-method.service';
import { PaymentMethod } from '../../../payment-method/interfaces/payment-method.interface';

@Component({
  selector: 'app-system-settings-page',
  standalone: true,
  imports: [CommonModule, AlertComponent],
  templateUrl: './system-settings-page.component.html',
  styleUrl: './system-settings-page.component.css'
})
export class SystemSettingsPageComponent implements OnInit {
  loading = signal(true);
  loadingPaymentMethods = signal(false);
  saving = signal(false);
  returnResponsibilityManagementEnabled = signal(true);
  initialReturnResponsibilityManagementEnabled = signal(true);
  pickingResponsibilityFlowEnabled = signal(false);
  initialPickingResponsibilityFlowEnabled = signal(false);
  marketplacePaymentMethodsEnabled = signal(false);
  initialMarketplacePaymentMethodsEnabled = signal(false);
  marketplacePaymentMethodIds = signal<number[]>([]);
  initialMarketplacePaymentMethodIds = signal<number[]>([]);
  marketplaceIncludeIgv = signal(true);
  initialMarketplaceIncludeIgv = signal(true);
  paymentMethods = signal<PaymentMethod[]>([]);

  constructor(
    private readonly systemConfigService: SystemConfigService,
    private readonly paymentMethodService: PaymentMethodService,
    private readonly alertService: AlertService,
  ) {}

  ngOnInit(): void {
    this.loadSettings();
    this.loadPaymentMethods();
  }

  get hasChanges(): boolean {
    return this.returnResponsibilityManagementEnabled() !== this.initialReturnResponsibilityManagementEnabled()
      || this.pickingResponsibilityFlowEnabled() !== this.initialPickingResponsibilityFlowEnabled()
      || this.marketplacePaymentMethodsEnabled() !== this.initialMarketplacePaymentMethodsEnabled()
      || this.marketplaceIncludeIgv() !== this.initialMarketplaceIncludeIgv()
      || !this.areNumberArraysEqual(
        this.marketplacePaymentMethodIds(),
        this.initialMarketplacePaymentMethodIds(),
      );
  }

  onToggleReturnResponsibility(checked: boolean) {
    this.returnResponsibilityManagementEnabled.set(checked);
  }

  onTogglePickingResponsibilityFlow(checked: boolean) {
    this.pickingResponsibilityFlowEnabled.set(checked);
  }

  onToggleMarketplacePayments(checked: boolean) {
    this.marketplacePaymentMethodsEnabled.set(checked);
  }

  onToggleMarketplaceIgv(checked: boolean) {
    this.marketplaceIncludeIgv.set(checked);
  }

  isPaymentMethodSelected(paymentMethodId: number): boolean {
    return this.marketplacePaymentMethodIds().includes(Number(paymentMethodId));
  }

  onTogglePaymentMethod(paymentMethodId: number, checked: boolean) {
    const ids = new Set(this.marketplacePaymentMethodIds());
    if (checked) {
      ids.add(Number(paymentMethodId));
    } else {
      ids.delete(Number(paymentMethodId));
    }
    this.marketplacePaymentMethodIds.set(Array.from(ids.values()));
  }

  reload() {
    this.loadSettings();
    this.loadPaymentMethods();
  }

  resetChanges() {
    this.returnResponsibilityManagementEnabled.set(this.initialReturnResponsibilityManagementEnabled());
    this.pickingResponsibilityFlowEnabled.set(this.initialPickingResponsibilityFlowEnabled());
    this.marketplacePaymentMethodsEnabled.set(this.initialMarketplacePaymentMethodsEnabled());
    this.marketplacePaymentMethodIds.set([...this.initialMarketplacePaymentMethodIds()]);
    this.marketplaceIncludeIgv.set(this.initialMarketplaceIncludeIgv());
  }

  saveSettings() {
    if (!this.hasChanges || this.saving()) {
      return;
    }
    if (this.marketplacePaymentMethodsEnabled() && this.marketplacePaymentMethodIds().length === 0) {
      this.alertService.show('Selecciona al menos un metodo de pago para activar esta regla', 'error', 3500);
      return;
    }

    this.saving.set(true);
    this.systemConfigService
      .updateOrderWorkflowSettings({
        returnResponsibilityManagementEnabled: this.returnResponsibilityManagementEnabled(),
        pickingResponsibilityFlowEnabled: this.pickingResponsibilityFlowEnabled(),
        marketplacePaymentMethodsEnabled: this.marketplacePaymentMethodsEnabled(),
        marketplacePaymentMethodIds: this.marketplacePaymentMethodIds(),
        marketplaceIncludeIgv: this.marketplaceIncludeIgv(),
      })
      .subscribe({
        next: (settings) => {
          const enabled = settings.returnResponsibilityManagementEnabled !== false;
          const pickingResponsibilityFlowEnabled = settings.pickingResponsibilityFlowEnabled === true;
          const marketplaceEnabled = settings.marketplacePaymentMethodsEnabled === true;
          const paymentMethodIds = this.sanitizeAllowedPaymentMethodIds(settings.marketplacePaymentMethodIds);
          const marketplaceIncludeIgv = settings.marketplaceIncludeIgv !== false;
          this.initialReturnResponsibilityManagementEnabled.set(enabled);
          this.returnResponsibilityManagementEnabled.set(enabled);
          this.initialPickingResponsibilityFlowEnabled.set(pickingResponsibilityFlowEnabled);
          this.pickingResponsibilityFlowEnabled.set(pickingResponsibilityFlowEnabled);
          this.initialMarketplacePaymentMethodsEnabled.set(marketplaceEnabled);
          this.marketplacePaymentMethodsEnabled.set(marketplaceEnabled);
          this.initialMarketplacePaymentMethodIds.set([...paymentMethodIds]);
          this.marketplacePaymentMethodIds.set([...paymentMethodIds]);
          this.initialMarketplaceIncludeIgv.set(marketplaceIncludeIgv);
          this.marketplaceIncludeIgv.set(marketplaceIncludeIgv);
          this.saving.set(false);
          this.alertService.show('Configuracion guardada', 'success', 2500);
        },
        error: (error) => {
          this.saving.set(false);
          const message = error?.error?.message || 'No se pudo guardar la configuracion';
          this.alertService.show(message, 'error', 3500);
        },
      });
  }

  private loadSettings() {
    this.loading.set(true);
    this.systemConfigService.getOrderWorkflowSettings().subscribe({
      next: (settings) => {
        const enabled = settings.returnResponsibilityManagementEnabled !== false;
        const pickingResponsibilityFlowEnabled = settings.pickingResponsibilityFlowEnabled === true;
        const marketplaceEnabled = settings.marketplacePaymentMethodsEnabled === true;
        const paymentMethodIds = this.sanitizeAllowedPaymentMethodIds(settings.marketplacePaymentMethodIds);
        const marketplaceIncludeIgv = settings.marketplaceIncludeIgv !== false;
        this.initialReturnResponsibilityManagementEnabled.set(enabled);
        this.returnResponsibilityManagementEnabled.set(enabled);
        this.initialPickingResponsibilityFlowEnabled.set(pickingResponsibilityFlowEnabled);
        this.pickingResponsibilityFlowEnabled.set(pickingResponsibilityFlowEnabled);
        this.initialMarketplacePaymentMethodsEnabled.set(marketplaceEnabled);
        this.marketplacePaymentMethodsEnabled.set(marketplaceEnabled);
        this.initialMarketplacePaymentMethodIds.set([...paymentMethodIds]);
        this.marketplacePaymentMethodIds.set([...paymentMethodIds]);
        this.initialMarketplaceIncludeIgv.set(marketplaceIncludeIgv);
        this.marketplaceIncludeIgv.set(marketplaceIncludeIgv);
        this.loading.set(false);
      },
      error: (error) => {
        this.loading.set(false);
        const message = error?.error?.message || 'No se pudo cargar la configuracion';
        this.alertService.show(message, 'error', 3500);
      },
    });
  }

  private loadPaymentMethods() {
    this.loadingPaymentMethods.set(true);
    this.paymentMethodService.listActive().subscribe({
      next: (methods) => {
        this.paymentMethods.set(Array.isArray(methods) ? methods : []);
        this.reconcilePaymentMethodSelection();
        this.loadingPaymentMethods.set(false);
      },
      error: () => {
        this.paymentMethods.set([]);
        this.reconcilePaymentMethodSelection();
        this.loadingPaymentMethods.set(false);
      },
    });
  }

  private reconcilePaymentMethodSelection() {
    const activeIds = new Set(this.paymentMethods().map((method) => Number(method.id)));
    const fallbackIds = this.paymentMethods().map((method) => Number(method.id));
    const normalizeAgainstActive = (ids: number[]) => (Array.isArray(ids) ? ids : [])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0 && activeIds.has(id));

    const current = normalizeAgainstActive(this.marketplacePaymentMethodIds());
    const initial = normalizeAgainstActive(this.initialMarketplacePaymentMethodIds());

    this.marketplacePaymentMethodIds.set(current.length > 0 ? Array.from(new Set(current)) : fallbackIds);
    this.initialMarketplacePaymentMethodIds.set(initial.length > 0 ? Array.from(new Set(initial)) : fallbackIds);
  }

  private sanitizeAllowedPaymentMethodIds(ids: number[]): number[] {
    return Array.from(new Set((Array.isArray(ids) ? ids : [])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)));
  }

  private areNumberArraysEqual(first: number[], second: number[]): boolean {
    const firstNormalized = [...new Set(first.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))].sort((a, b) => a - b);
    const secondNormalized = [...new Set(second.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))].sort((a, b) => a - b);

    if (firstNormalized.length !== secondNormalized.length) {
      return false;
    }

    for (let index = 0; index < firstNormalized.length; index += 1) {
      if (firstNormalized[index] !== secondNormalized[index]) {
        return false;
      }
    }

    return true;
  }
}
