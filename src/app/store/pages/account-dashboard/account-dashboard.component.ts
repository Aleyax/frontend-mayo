import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { map, of } from 'rxjs';
import { MarketplaceAuthUser, MarketplaceMyOrderSummary } from '../../interfaces/marketplace.interface';
import { MarketplaceAuthService } from '../../services/marketplace-auth.service';
import { MarketplaceService } from '../../services/marketplace.service';

@Component({
  selector: 'app-account-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './account-dashboard.component.html',
  styleUrl: './account-dashboard.component.css',
})
export class AccountDashboardComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly marketplaceAuthService = inject(MarketplaceAuthService);
  private readonly marketplaceService = inject(MarketplaceService);
  private readonly canLoad = signal(false);
  private readonly profileReloadVersion = signal(0);
  private readonly ordersReloadVersion = signal(0);
  private readonly manualError = signal('');

  readonly successMessage = signal('');
  readonly savingProfile = signal(false);

  readonly profileResource = rxResource<MarketplaceAuthUser | null, number | undefined>({
    params: () => (this.canLoad() ? this.profileReloadVersion() : undefined),
    stream: () => this.marketplaceAuthService.me().pipe(
      map((user) => user ?? null),
    ),
    defaultValue: null,
  });

  readonly ordersResource = rxResource<MarketplaceMyOrderSummary[], { token: string; refresh: number } | undefined>({
    params: () => {
      if (!this.canLoad()) {
        return undefined;
      }

      const token = this.marketplaceAuthService.getToken();
      if (!token) {
        return undefined;
      }

      return {
        token,
        refresh: this.ordersReloadVersion(),
      };
    },
    stream: ({ params }) => {
      if (!params?.token) {
        return of([]);
      }

      return this.marketplaceService.listMyOrdersAuthenticated(params.token).pipe(
        map((response) => (Array.isArray(response?.data) ? response.data : [])),
      );
    },
    defaultValue: [],
  });

  readonly loadingProfile = computed(() => this.profileResource.isLoading());
  readonly loadingOrders = computed(() => this.ordersResource.isLoading());
  readonly myOrders = computed(() => this.ordersResource.value() ?? []);
  readonly errorMessage = computed(() => {
    const manual = this.manualError();
    if (manual) {
      return manual;
    }

    const profileError = this.profileResource.error() as { error?: { message?: string }; message?: string } | undefined;
    if (profileError) {
      return profileError.error?.message || profileError.message || 'No se pudo cargar tu perfil.';
    }

    const ordersError = this.ordersResource.error() as { error?: { message?: string }; message?: string } | undefined;
    if (ordersError) {
      return ordersError.error?.message || ordersError.message || 'No se pudieron cargar tus pedidos.';
    }

    return '';
  });

  firstName = '';
  lastName = '';
  email = '';
  phone = '';
  address = '';

  constructor() {
    effect(() => {
      const user = this.profileResource.value();
      if (!user) {
        return;
      }

      this.firstName = user.firstName || '';
      this.lastName = user.lastName || '';
      this.email = user.email || '';
      this.phone = user.phone || '';
      this.address = user.address || '';
    });
  }

  ngOnInit(): void {
    if (!this.marketplaceAuthService.isAuthenticated()) {
      this.router.navigate(['/marketplace/auth'], { queryParams: { returnUrl: '/marketplace/account' } });
      return;
    }

    this.prefillFromSession();
    this.canLoad.set(true);
  }

  saveProfile() {
    this.manualError.set('');
    this.successMessage.set('');

    if (!this.firstName.trim() || !this.lastName.trim() || !this.phone.trim()) {
      this.manualError.set('Nombre, apellido y telefono son obligatorios.');
      return;
    }

    this.savingProfile.set(true);
    this.marketplaceAuthService.updateProfile({
      firstName: this.firstName.trim(),
      lastName: this.lastName.trim(),
      phone: this.phone.trim(),
      address: this.address.trim() || null,
    }).subscribe({
      next: (user) => {
        this.savingProfile.set(false);
        this.firstName = user.firstName || '';
        this.lastName = user.lastName || '';
        this.phone = user.phone || '';
        this.address = user.address || '';
        this.successMessage.set('Perfil actualizado correctamente.');
        this.profileResource.reload();
      },
      error: (error) => {
        this.savingProfile.set(false);
        this.manualError.set(error?.error?.message || 'No se pudo actualizar el perfil.');
      },
    });
  }

  reloadOrders() {
    this.manualError.set('');
    this.ordersResource.reload();
  }

  goToTrackOrder(orderCode: string) {
    this.router.navigate(['/marketplace/track-order'], {
      queryParams: { code: orderCode },
    });
  }

  private prefillFromSession() {
    const localUser = this.marketplaceAuthService.getCurrentUser();
    if (!localUser) {
      return;
    }

    this.firstName = localUser.firstName || '';
    this.lastName = localUser.lastName || '';
    this.email = localUser.email || '';
    this.phone = localUser.phone || '';
    this.address = localUser.address || '';
  }
}
