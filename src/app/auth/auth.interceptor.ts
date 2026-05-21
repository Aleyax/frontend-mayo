import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getToken();
  const isPublicMarketplaceRequest = req.url.includes('/api/public/');
  const isAdminApiRequest = req.url.includes('/api/') && !isPublicMarketplaceRequest;
  const isAdminLoginRequest = req.url.includes('/api/auth/login');
  const isAdminLogoutRequest = req.url.includes('/api/auth/logout');
  const shouldSkipTokenHandling = isAdminLoginRequest || isAdminLogoutRequest;
  const authReq = token
    && isAdminApiRequest
    && !shouldSkipTokenHandling
    ? req.clone({ headers: req.headers.set('Authorization', `Bearer ${token}`) })
    : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && isAdminApiRequest && !shouldSkipTokenHandling) {
        authService.logout();
      }
      return throwError(() => error);
    })
  );
};
