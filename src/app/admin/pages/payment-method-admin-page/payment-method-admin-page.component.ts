import { ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild, computed, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { GenericModalComponent } from '../../components/generic-modal/generic-modal.component';
import { AlertComponent } from '../../../shared/components/alert/alert.component';
import { ConfirmModalComponent } from '../../../shared/components/confirm-modal/confirm-modal.component';
import { AlertService } from '../../../shared/services/alert.service';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { PaymentMethod } from '../../../payment-method/interfaces/payment-method.interface';
import { PaymentMethodService } from '../../../payment-method/services/payment-method.service';

@Component({
  selector: 'app-payment-method-admin-page',
  standalone: true,
  imports: [GenericModalComponent, AlertComponent, ConfirmModalComponent],
  templateUrl: './payment-method-admin-page.component.html',
  styleUrl: './payment-method-admin-page.component.css'
})
export class PaymentMethodAdminPageComponent implements OnInit, OnDestroy {
  @ViewChild(GenericModalComponent) genericModal!: GenericModalComponent;

  private readonly data = signal<PaymentMethod[]>([]);
  private readonly searchSubject = new Subject<string>();
  private readonly searchParam = signal<string>('');

  activeChecked = signal<boolean>(true);
  inactiveChecked = signal<boolean>(true);

  paymentMethods = computed(() => {
    const term = this.searchParam().trim().toLowerCase();
    const active = this.activeChecked();
    const inactive = this.inactiveChecked();

    return this.data().filter((item) => {
      const matchesSearch = !term
        || item.name.toLowerCase().includes(term)
        || item.code.toLowerCase().includes(term);

      const matchesStatus = (active && item.isActive) || (inactive && !item.isActive);
      return matchesSearch && matchesStatus;
    });
  });

  constructor(
    private readonly paymentMethodService: PaymentMethodService,
    private readonly alertService: AlertService,
    private readonly confirmService: ConfirmService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadPaymentMethods();
    this.searchSubject.pipe(debounceTime(300)).subscribe((value) => {
      this.searchParam.set(value);
    });
  }

  ngOnDestroy(): void {
    this.searchSubject.complete();
  }

  onSearch(value: string) {
    this.searchSubject.next(value);
  }

  setActiveChecked(value: boolean) {
    this.activeChecked.set(value);
  }

  setInactiveChecked(value: boolean) {
    this.inactiveChecked.set(value);
  }

  openModal() {
    this.genericModal.setEditingItem(null);
    const modal = document.getElementById('generic-modal') as HTMLDialogElement | null;
    modal?.showModal();
  }

  openModalForEdit(item: PaymentMethod) {
    this.genericModal.setEditingItem(item);
    const modal = document.getElementById('generic-modal') as HTMLDialogElement | null;
    modal?.showModal();
  }

  async deactivate(item: PaymentMethod) {
    const confirmed = await this.confirmService.confirm({
      title: 'Desactivar metodo de pago',
      message: `¿Desactivar "${item.name}"?`,
      acceptText: 'Desactivar',
      cancelText: 'Cancelar',
    });
    if (!confirmed) return;

    this.paymentMethodService.deactivate(item.id).subscribe({
      next: (updated) => {
        this.replaceItem(updated);
        this.alertService.show(`Metodo "${item.name}" desactivado`, 'success', 2500);
      },
      error: (error) => {
        const message = error?.error?.message || 'No se pudo desactivar el metodo de pago';
        this.alertService.show(message, 'error', 3000);
      },
    });
  }

  async activate(item: PaymentMethod) {
    const confirmed = await this.confirmService.confirm({
      title: 'Activar metodo de pago',
      message: `¿Activar "${item.name}"?`,
      acceptText: 'Activar',
      cancelText: 'Cancelar',
    });
    if (!confirmed) return;

    this.paymentMethodService.activate(item.id).subscribe({
      next: (updated) => {
        this.replaceItem(updated);
        this.alertService.show(`Metodo "${item.name}" activado`, 'success', 2500);
      },
      error: (error) => {
        const message = error?.error?.message || 'No se pudo activar el metodo de pago';
        this.alertService.show(message, 'error', 3000);
      },
    });
  }

  onSaved(item: PaymentMethod) {
    const editingItem = this.genericModal.editingItem();
    if (editingItem?.id) {
      this.paymentMethodService.update(editingItem.id, { name: item.name }).subscribe({
        next: (updated) => {
          this.replaceItem(updated);
          this.alertService.show(`Metodo "${updated.name}" actualizado`, 'success', 2500);
          this.genericModal.closeModal();
        },
        error: (error) => {
          const message = error?.error?.message || 'No se pudo actualizar el metodo de pago';
          this.alertService.show(message, 'error', 3000);
        },
      });
      return;
    }

    this.paymentMethodService.create(item.name).subscribe({
      next: (created) => {
        this.data.update((current) => [...current, created]);
        this.alertService.show(`Metodo "${created.name}" creado`, 'success', 2500);
        this.genericModal.closeModal();
      },
      error: (error) => {
        const message = error?.error?.message || 'No se pudo crear el metodo de pago';
        this.alertService.show(message, 'error', 3000);
      },
    });
  }

  private loadPaymentMethods() {
    this.paymentMethodService.list({ skip: 1, take: 200 }).subscribe({
      next: (response) => {
        this.data.set(response.data || []);
        this.cdr.markForCheck();
      },
      error: (error) => {
        const message = error?.error?.message || 'No se pudieron cargar los metodos de pago';
        this.alertService.show(message, 'error', 3000);
      },
    });
  }

  private replaceItem(item: PaymentMethod) {
    this.data.update((current) => current.map((entry) => (entry.id === item.id ? item : entry)));
    this.cdr.markForCheck();
  }
}
