import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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

  mode: AuthMode = 'login';
  loading = false;
  errorMessage = '';

  email = '';
  password = '';

  firstName = '';
  lastName = '';
  phone = '';
  address = '';

  switchMode(mode: AuthMode) {
    this.mode = mode;
    this.errorMessage = '';
  }

  submit() {
    this.errorMessage = '';
    if (this.mode === 'login') {
      this.submitLogin();
      return;
    }
    this.submitRegister();
  }

  private submitLogin() {
    if (!this.email.trim() || !this.password) {
      this.errorMessage = 'Completa email y contrasena.';
      return;
    }

    this.loading = true;
    this.marketplaceAuthService.login(this.email.trim(), this.password).subscribe({
      next: () => {
        this.loading = false;
        this.navigateAfterAuth();
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error?.error?.message || 'No se pudo iniciar sesion';
      },
    });
  }

  private submitRegister() {
    if (!this.firstName.trim() || !this.lastName.trim()) {
      this.errorMessage = 'Completa nombre y apellido.';
      return;
    }
    if (!this.phone.trim()) {
      this.errorMessage = 'El telefono es obligatorio.';
      return;
    }
    if (!this.email.trim() || !this.password) {
      this.errorMessage = 'Completa email y contrasena.';
      return;
    }

    this.loading = true;
    this.marketplaceAuthService.register({
      firstName: this.firstName.trim(),
      lastName: this.lastName.trim(),
      phone: this.phone.trim(),
      address: this.address.trim() || undefined,
      email: this.email.trim(),
      password: this.password,
    }).subscribe({
      next: () => {
        this.loading = false;
        this.navigateAfterAuth();
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error?.error?.message || 'No se pudo crear la cuenta';
      },
    });
  }

  private navigateAfterAuth() {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    this.router.navigateByUrl(returnUrl || '/marketplace');
  }
}
