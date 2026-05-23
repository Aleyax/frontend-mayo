import '@angular/compiler';
import { EnvironmentInjector, createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import { HttpErrorResponse, HttpHandlerFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceAuthService } from '../services/marketplace-auth.service';
import { marketplaceAuthInterceptor } from './marketplace-auth.interceptor';

describe('marketplaceAuthInterceptor', () => {
  let injector: EnvironmentInjector;
  let authServiceMock: { getToken: ReturnType<typeof vi.fn>; logout: ReturnType<typeof vi.fn> };
  let routerMock: { url: string; navigate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    authServiceMock = {
      getToken: vi.fn(),
      logout: vi.fn(),
    };

    routerMock = {
      url: '/marketplace/account',
      navigate: vi.fn().mockResolvedValue(true),
    };

    injector = createEnvironmentInjector(
      [
        { provide: MarketplaceAuthService, useValue: authServiceMock },
        { provide: Router, useValue: routerMock },
      ],
      null,
    );
  });

  afterEach(() => {
    injector.destroy();
    vi.clearAllMocks();
  });

  it('adds Authorization header for protected marketplace endpoint', async () => {
    authServiceMock.getToken.mockReturnValue('token-123');
    const request = new HttpRequest('GET', 'http://localhost:3000/api/public/auth/me');
    let interceptedRequest: HttpRequest<unknown> | null = null;

    const next: HttpHandlerFn = (req) => {
      interceptedRequest = req;
      return of(new HttpResponse({ status: 200, body: { ok: true } }));
    };

    await firstValueFrom(
      runInInjectionContext(injector, () => marketplaceAuthInterceptor(request, next)),
    );

    expect(interceptedRequest?.headers.get('Authorization')).toBe('Bearer token-123');
  });

  it('does not add Authorization header for public catalog endpoint', async () => {
    authServiceMock.getToken.mockReturnValue('token-123');
    const request = new HttpRequest('GET', 'http://localhost:3000/api/public/products');
    let interceptedRequest: HttpRequest<unknown> | null = null;

    const next: HttpHandlerFn = (req) => {
      interceptedRequest = req;
      return of(new HttpResponse({ status: 200, body: { ok: true } }));
    };

    await firstValueFrom(
      runInInjectionContext(injector, () => marketplaceAuthInterceptor(request, next)),
    );

    expect(interceptedRequest?.headers.has('Authorization')).toBe(false);
  });

  it('logs out and redirects to marketplace auth on 401 from protected endpoint', async () => {
    authServiceMock.getToken.mockReturnValue('token-123');
    routerMock.url = '/marketplace/account?code=MP-001';
    const request = new HttpRequest('GET', 'http://localhost:3000/api/public/orders/my-auth');

    const next: HttpHandlerFn = () => throwError(() => new HttpErrorResponse({ status: 401 }));

    await expect(
      firstValueFrom(
        runInInjectionContext(injector, () => marketplaceAuthInterceptor(request, next)),
      ),
    ).rejects.toBeTruthy();

    await Promise.resolve();

    expect(authServiceMock.logout).toHaveBeenCalledTimes(1);
    expect(routerMock.navigate).toHaveBeenCalledWith(
      ['/marketplace/auth'],
      {
        queryParams: { returnUrl: '/marketplace/account?code=MP-001' },
        replaceUrl: true,
      },
    );
  });

  it('logs out without redirect when already on marketplace auth route', async () => {
    authServiceMock.getToken.mockReturnValue('token-123');
    routerMock.url = '/marketplace/auth';
    const request = new HttpRequest('GET', 'http://localhost:3000/api/public/auth/profile');

    const next: HttpHandlerFn = () => throwError(() => new HttpErrorResponse({ status: 401 }));

    await expect(
      firstValueFrom(
        runInInjectionContext(injector, () => marketplaceAuthInterceptor(request, next)),
      ),
    ).rejects.toBeTruthy();

    await Promise.resolve();

    expect(authServiceMock.logout).toHaveBeenCalledTimes(1);
    expect(routerMock.navigate).not.toHaveBeenCalled();
  });

  it('prevents duplicate redirects while one redirect is in flight', async () => {
    authServiceMock.getToken.mockReturnValue('token-123');
    routerMock.url = '/marketplace/account';

    let resolveFirstNavigation: ((value: boolean) => void) | null = null;
    const firstNavigationPromise = new Promise<boolean>((resolve) => {
      resolveFirstNavigation = resolve;
    });

    routerMock.navigate
      .mockReturnValueOnce(firstNavigationPromise)
      .mockResolvedValue(true);

    const request = new HttpRequest('GET', 'http://localhost:3000/api/public/orders/my-auth');
    const next: HttpHandlerFn = () => throwError(() => new HttpErrorResponse({ status: 401 }));

    await expect(
      firstValueFrom(
        runInInjectionContext(injector, () => marketplaceAuthInterceptor(request, next)),
      ),
    ).rejects.toBeTruthy();

    await expect(
      firstValueFrom(
        runInInjectionContext(injector, () => marketplaceAuthInterceptor(request, next)),
      ),
    ).rejects.toBeTruthy();

    expect(routerMock.navigate).toHaveBeenCalledTimes(1);

    resolveFirstNavigation?.(true);
    await firstNavigationPromise;
    await Promise.resolve();

    await expect(
      firstValueFrom(
        runInInjectionContext(injector, () => marketplaceAuthInterceptor(request, next)),
      ),
    ).rejects.toBeTruthy();

    await Promise.resolve();
    expect(routerMock.navigate).toHaveBeenCalledTimes(2);
  });
});
