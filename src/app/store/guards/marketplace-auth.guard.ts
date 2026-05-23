import { inject, Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot } from '@angular/router';
import { MarketplaceAuthService } from '../services/marketplace-auth.service';

@Injectable({
  providedIn: 'root',
})
export class MarketplaceAuthGuard implements CanActivate {
  private readonly marketplaceAuthService = inject(MarketplaceAuthService);
  private readonly router = inject(Router);

  canActivate(_route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    if (this.marketplaceAuthService.isAuthenticated()) {
      return true;
    }

    const returnUrl = state?.url || '/marketplace/account';
    void this.router.navigate(['/marketplace/auth'], {
      queryParams: { returnUrl },
    });
    return false;
  }
}
