import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MarketplaceAuthService } from '../../services/marketplace-auth.service';

@Component({
  selector: 'app-store-layout',
  standalone: true,
  templateUrl: './store-layout.component.html',
  styleUrls: ['./store-layout.component.css'],
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive]
})
export class StoreLayoutComponent implements OnInit {
  private readonly marketplaceAuthService = inject(MarketplaceAuthService);
  currentTheme: 'dark' | 'light' = 'dark';
  readonly marketplaceUser = toSignal(
    this.marketplaceAuthService.currentUser$,
    { initialValue: this.marketplaceAuthService.getCurrentUser() },
  );

  ngOnInit(): void {
    const savedTheme = localStorage.getItem('theme');
    this.currentTheme = savedTheme === 'light' ? 'light' : 'dark';
    this.applyTheme();
    this.hydrateMarketplaceSession();
  }

  toggleTheme(): void {
    this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', this.currentTheme);
    this.applyTheme();
  }

  private applyTheme(): void {
    document.documentElement.setAttribute('data-theme', this.currentTheme);
  }

  logoutMarketplace() {
    this.marketplaceAuthService.logout();
  }

  private hydrateMarketplaceSession() {
    if (!this.marketplaceAuthService.isAuthenticated()) {
      return;
    }

    this.marketplaceAuthService.me().subscribe({
      error: () => {
        this.marketplaceAuthService.logout();
      },
    });
  }
}
