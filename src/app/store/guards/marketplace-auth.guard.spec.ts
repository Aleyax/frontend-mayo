import '@angular/compiler';
import { EnvironmentInjector, createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceAuthService } from '../services/marketplace-auth.service';
import { MarketplaceAuthGuard } from './marketplace-auth.guard';

describe('MarketplaceAuthGuard', () => {
  let guard: MarketplaceAuthGuard;
  let injector: EnvironmentInjector;
  let authServiceMock: { isAuthenticated: ReturnType<typeof vi.fn> };
  let routerMock: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    authServiceMock = {
      isAuthenticated: vi.fn(),
    };
    routerMock = {
      navigate: vi.fn().mockResolvedValue(true),
    };

    injector = createEnvironmentInjector(
      [
        MarketplaceAuthGuard,
        { provide: MarketplaceAuthService, useValue: authServiceMock },
        { provide: Router, useValue: routerMock },
      ],
      null,
    );

    guard = runInInjectionContext(injector, () => new MarketplaceAuthGuard());
  });

  afterEach(() => {
    injector.destroy();
  });

  it('should allow activation when session is authenticated', () => {
    authServiceMock.isAuthenticated.mockReturnValue(true);
    const route = {} as ActivatedRouteSnapshot;
    const state = { url: '/marketplace/account' } as RouterStateSnapshot;

    const allowed = guard.canActivate(route, state);

    expect(allowed).toBe(true);
    expect(routerMock.navigate).not.toHaveBeenCalled();
  });

  it('should redirect to auth when session is not authenticated', () => {
    authServiceMock.isAuthenticated.mockReturnValue(false);
    const route = {} as ActivatedRouteSnapshot;
    const state = { url: '/marketplace/account?code=MP-001' } as RouterStateSnapshot;

    const allowed = guard.canActivate(route, state);

    expect(allowed).toBe(false);
    expect(routerMock.navigate).toHaveBeenCalledWith(
      ['/marketplace/auth'],
      { queryParams: { returnUrl: '/marketplace/account?code=MP-001' } },
    );
  });
});
