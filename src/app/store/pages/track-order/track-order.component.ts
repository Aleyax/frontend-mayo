import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MarketplaceTrackResponse } from '../../interfaces/marketplace.interface';
import { MarketplaceService } from '../../services/marketplace.service';

@Component({
  selector: 'app-marketplace-track-order',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './track-order.component.html',
  styleUrl: './track-order.component.css'
})
export class TrackOrderComponent {
  private readonly marketplaceService = inject(MarketplaceService);

  code = '';
  phone = '';
  loading = false;
  errorMessage = '';
  result: MarketplaceTrackResponse | null = null;

  track() {
    this.errorMessage = '';
    this.result = null;

    if (!this.code.trim()) {
      this.errorMessage = 'Ingresa el codigo del pedido.';
      return;
    }
    if (!this.phone.trim()) {
      this.errorMessage = 'Ingresa el telefono de validacion.';
      return;
    }

    this.loading = true;
    this.marketplaceService.trackOrder(this.code.trim().toUpperCase(), this.phone.trim()).subscribe({
      next: (response) => {
        this.result = response?.data ?? null;
        this.loading = false;
      },
      error: (error) => {
        this.errorMessage = error?.error?.message || 'No se encontro el pedido.';
        this.loading = false;
      },
    });
  }
}

