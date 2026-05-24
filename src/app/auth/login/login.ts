import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../auth.service';
import { SeoService } from '../../shared/services/seo.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly seoService = inject(SeoService);

  readonly loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');

  constructor() {
    this.seoService.setNoIndexPage({
      title: 'Acceso administrador',
      description: 'Panel privado de administracion.',
      path: '/login',
      type: 'website',
    });
    this.seoService.clearJsonLd();
  }

  onSubmit(): void {
    if (this.isLoading()) {
      return;
    }

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    const { email, password } = this.loginForm.getRawValue();

    this.authService
      .login(String(email ?? '').trim(), String(password ?? ''))
      .pipe(finalize(() => {
        this.isLoading.set(false);
      }))
      .subscribe({
        next: (response) => {
          this.authService.setSession(response.token, response.user);
          void this.router.navigate(['/admin']);
        },
        error: (error: unknown) => {
          this.errorMessage.set(this.getLoginErrorMessage(error));
        },
      });
  }

  private getLoginErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const backendMessage =
        typeof error.error === 'object' &&
        error.error !== null &&
        'message' in error.error &&
        typeof (error.error as { message?: unknown }).message === 'string'
          ? (error.error as { message: string }).message
          : '';

      if (backendMessage.trim()) {
        return backendMessage;
      }

      if (error.status === 401) {
        return 'Credenciales invalidas';
      }
    }

    return 'Error al iniciar sesion';
  }

  togglePasswordVisibility(): void {
    // Implementar mostrar/ocultar contrasena
  }
}

