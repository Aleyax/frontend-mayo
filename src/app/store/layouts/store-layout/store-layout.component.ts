import { Component, OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-store-layout',
  standalone: true,
  templateUrl: './store-layout.component.html',
  styleUrls: ['./store-layout.component.css'],
  imports: [RouterOutlet, RouterLink, RouterLinkActive]
})
export class StoreLayoutComponent implements OnInit {
  currentTheme: 'dark' | 'light' = 'dark';

  ngOnInit(): void {
    const savedTheme = localStorage.getItem('theme');
    this.currentTheme = savedTheme === 'light' ? 'light' : 'dark';
    this.applyTheme();
  }

  toggleTheme(): void {
    this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', this.currentTheme);
    this.applyTheme();
  }

  private applyTheme(): void {
    document.documentElement.setAttribute('data-theme', this.currentTheme);
  }
}
