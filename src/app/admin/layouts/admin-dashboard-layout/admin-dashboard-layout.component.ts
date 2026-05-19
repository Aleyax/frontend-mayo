import { Component, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../../../shared/components/sidebar/sidebar.component';
import { AuthService } from '../../../auth/auth.service';
import { Subscription, filter } from 'rxjs';

@Component({
  selector: 'app-admin-dashboard-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent],
  templateUrl: './admin-dashboard-layout.component.html',
  styleUrls: ['./admin-dashboard-layout.component.css']
})
export class AdminDashboardLayoutComponent implements OnInit, OnDestroy {
  currentTheme: 'dark' | 'light' = 'dark';
  private tableEnhancerObserver?: MutationObserver;
  private routerEventsSub?: Subscription;

  constructor(
    private authService: AuthService,
    private router: Router
  ) { }

  ngOnInit() {
    const savedTheme = localStorage.getItem('theme');
    this.currentTheme = savedTheme === 'light' ? 'light' : 'dark';
    this.applyTheme();
    this.setupMobileTableEnhancer();
  }

  ngOnDestroy() {
    this.tableEnhancerObserver?.disconnect();
    this.routerEventsSub?.unsubscribe();
  }

  logout() {
    this.authService.logout();
  }

  get currentUser() {
    return this.authService.getCurrentUser();
  }

  get isAdmin() {
    return this.authService.isAdmin();
  }

  toggleTheme() {
    this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', this.currentTheme);
    this.applyTheme();
  }

  private applyTheme() {
    document.documentElement.setAttribute('data-theme', this.currentTheme);
  }

  private setupMobileTableEnhancer() {
    const enhanceTables = () => this.decorateTablesForMobileCards();

    this.routerEventsSub = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        setTimeout(enhanceTables, 0);
      });

    const root = document.querySelector('.drawer-content') ?? document.body;
    this.tableEnhancerObserver = new MutationObserver(() => {
      enhanceTables();
    });
    this.tableEnhancerObserver.observe(root, {
      childList: true,
      subtree: true,
    });

    enhanceTables();
  }

  private decorateTablesForMobileCards() {
    const tables = Array.from(document.querySelectorAll('table'));

    for (const table of tables) {
      if (table.closest('app-pos') || table.closest('.print-content')) {
        continue;
      }

      table.classList.add('mobile-card-table');

      const headerCells = Array.from(table.querySelectorAll('thead th'));
      if (!headerCells.length) {
        continue;
      }

      const headerLabels = headerCells.map((headerCell, index) => {
        const normalized = headerCell.textContent?.replace(/\s+/g, ' ').trim() || '';
        if (normalized) {
          return normalized;
        }
        if (index === 0) {
          return '#';
        }
        return `Columna ${index + 1}`;
      });

      const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
      for (const bodyRow of bodyRows) {
        const cells = Array.from(bodyRow.querySelectorAll('td, th'));
        cells.forEach((cell, index) => {
          const label = headerLabels[index] || `Columna ${index + 1}`;
          if (cell.getAttribute('data-label') !== label) {
            cell.setAttribute('data-label', label);
          }
        });
      }
    }
  }
}
