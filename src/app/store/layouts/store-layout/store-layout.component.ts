import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { MarketplaceAuthService } from '../../services/marketplace-auth.service';

@Component({
  selector: 'app-store-layout',
  standalone: true,
  templateUrl: './store-layout.component.html',
  styleUrls: ['./store-layout.component.css'],
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive]
})
export class StoreLayoutComponent {
  private readonly marketplaceAuthService = inject(MarketplaceAuthService);

  readonly currentTheme = signal<'dark' | 'light'>(this.getSavedTheme());
  readonly marketplaceUser = computed(() => this.marketplaceAuthService.getCurrentUser());

  // Refreshes marketplace session declaratively when a persisted token exists.
  private readonly sessionResource = rxResource<boolean, true | undefined>({
    params: () => (this.marketplaceAuthService.isAuthenticated() ? true : undefined),
    stream: ({ params }) => {
      if (!params) {
        return of(true);
      }

      return this.marketplaceAuthService.me().pipe(
        map(() => true),
        catchError(() => {
          this.marketplaceAuthService.logout();
          return of(false);
        }),
      );
    },
    defaultValue: true,
  });

  constructor() {
    effect(() => {
      this.applyTheme(this.currentTheme());
    });

    effect(() => {
      this.sessionResource.value();
    });
  }

  toggleTheme(): void {
    const nextTheme = this.currentTheme() === 'dark' ? 'light' : 'dark';
    this.currentTheme.set(nextTheme);
    localStorage.setItem('theme', nextTheme);
  }

  private applyTheme(theme: 'dark' | 'light'): void {
    document.documentElement.setAttribute('data-theme', theme);
  }

  logoutMarketplace() {
    this.marketplaceAuthService.logout();
  }

  private getSavedTheme(): 'dark' | 'light' {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme === 'light' ? 'light' : 'dark';
  }
}
