import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot } from '@angular/router';
import { AuthService } from './auth.service';
import { PermissionService } from './permission.service';

@Injectable({
  providedIn: 'root'
})
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly permissionService: PermissionService,
    private readonly router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot, _state: RouterStateSnapshot): boolean {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login']);
      return false;
    }

    const requiredPermission = route.data?.['permission'] as string | string[] | undefined;
    if (!requiredPermission) {
      return true;
    }

    const hasPermission = Array.isArray(requiredPermission)
      ? this.permissionService.canAny(requiredPermission)
      : this.permissionService.can(requiredPermission);

    if (hasPermission) {
      return true;
    }

    this.router.navigate(['/admin/forbidden']);
    return false;
  }
}

