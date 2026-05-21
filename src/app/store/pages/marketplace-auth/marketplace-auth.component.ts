import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { MarketplaceAuthService } from '../../services/marketplace-auth.service';

type AuthMode = 'login' | 'register';

@Component({
  selector: 'app-marketplace-auth',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './marketplace-auth.component.html',
  styleUrl: './marketplace-auth.component.css',
})
export class MarketplaceAuthComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly marketplaceAuthService = inject(MarketplaceAuthService);

  readonly mode = signal<AuthMode>('login');
  readonly loading = signal(false);
  readonly errorMessage = signal('');

  email = '';
  password = '';

  firstName = '';
  lastName = '';
  phone = '';
  address = '';

  switchMode(mode: AuthMode) {
    this.mode.set(mode);
    this.errorMessage.set('');
  }

  submit() {
    this.errorMessage.set('');
    if (this.mode() === 'login') {
      this.submitLogin();
      return;
    }
    this.submitRegister();
  }

  private submitLogin() {
    if (this.loading()) {
      return;
    }

    if (!this.email.trim() || !this.password) {
      this.errorMessage.set('Completa email y contrasena.');
      return;
    }

    this.loading.set(true);
    this.marketplaceAuthService.login(this.email.trim(), this.password)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          this.navigateAfterAuth();
        },
        error: (error) => {
          this.errorMessage.set(
            error?.error?.message ||
            (error?.status === 401 ? 'Correo o contrasena invalida.' : 'No se pudo iniciar sesion')
          );
        },
      });
  }

  private submitRegister() {
    if (this.loading()) {
      return;
    }

    if (!this.firstName.trim() || !this.lastName.trim()) {
      this.errorMessage.set('Completa nombre y apellido.');
      return;
    }
    if (!this.phone.trim()) {
      this.errorMessage.set('El telefono es obligatorio.');
      return;
    }
    if (!this.email.trim() || !this.password) {
      this.errorMessage.set('Completa email y contrasena.');
      return;
    }

    this.loading.set(true);
    this.marketplaceAuthService.register({
      firstName: this.firstName.trim(),
      lastName: this.lastName.trim(),
      phone: this.phone.trim(),
      address: this.address.trim() || undefined,
      email: this.email.trim(),
      password: this.password,
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          this.navigateAfterAuth();
        },
        error: (error) => {
          this.errorMessage.set(error?.error?.message || 'No se pudo crear la cuenta');
        },
      });
  }

  private navigateAfterAuth() {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    this.router.navigateByUrl(returnUrl || '/marketplace');
  }
}
