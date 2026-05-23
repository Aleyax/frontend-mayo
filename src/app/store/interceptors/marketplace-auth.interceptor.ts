import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { MarketplaceAuthService } from '../services/marketplace-auth.service';

const MARKETPLACE_PROTECTED_ENDPOINTS = [
  '/api/public/auth/me',
  '/api/public/auth/profile',
  '/api/public/orders/my-auth',
];

let redirectInFlight = false;

function isMarketplaceProtectedRequest(url: string): boolean {
  return MARKETPLACE_PROTECTED_ENDPOINTS.some((endpoint) => url.includes(endpoint));
}

export const marketplaceAuthInterceptor: HttpInterceptorFn = (req, next) => {
  const marketplaceAuthService = inject(MarketplaceAuthService);
  const router = inject(Router);
  const isProtectedRequest = isMarketplaceProtectedRequest(req.url);
  const token = marketplaceAuthService.getToken();

  const authReq = token && isProtectedRequest && !req.headers.has('Authorization')
    ? req.clone({ headers: req.headers.set('Authorization', `Bearer ${token}`) })
    : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && isProtectedRequest) {
        marketplaceAuthService.logout();

        const currentUrl = router.url || '';
        const isMarketplaceRoute = currentUrl.startsWith('/marketplace');
        const isMarketplaceAuthRoute = currentUrl.startsWith('/marketplace/auth');

        if (isMarketplaceRoute && !isMarketplaceAuthRoute && !redirectInFlight) {
          redirectInFlight = true;
          void router.navigate(['/marketplace/auth'], {
            queryParams: { returnUrl: currentUrl },
            replaceUrl: true,
          }).finally(() => {
            redirectInFlight = false;
          });
        }
      }

      return throwError(() => error);
    }),
  );
};
