import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';
import { getDefaultPermissionsByRole, isWildcardPermission } from './permission-catalog';

type AuthUser = {
  role?: string | { name?: string };
  permissions?: string[];
};

@Injectable({
  providedIn: 'root'
})
export class PermissionService {
  constructor(private readonly authService: AuthService) {}

  can(permission: string): boolean {
    const normalizedPermission = this.normalizePermission(permission);
    if (!normalizedPermission) return true;

    const permissions = this.getCurrentPermissions();
    if (permissions.has('*')) return true;

    return permissions.has(normalizedPermission);
  }

  canAny(permissions: string[]): boolean {
    if (!Array.isArray(permissions) || permissions.length === 0) return true;
    return permissions.some((permission) => this.can(permission));
  }

  canAll(permissions: string[]): boolean {
    if (!Array.isArray(permissions) || permissions.length === 0) return true;
    return permissions.every((permission) => this.can(permission));
  }

  getCurrentPermissions(): Set<string> {
    const user = this.authService.getCurrentUser() as AuthUser | null;
    if (!user) return new Set<string>();

    const explicitPermissions = this.normalizePermissions(user.permissions || []);
    if (explicitPermissions.size > 0) {
      return explicitPermissions;
    }

    const roleName = this.resolveRoleName(user);
    const defaultPermissions = getDefaultPermissionsByRole(roleName);
    return this.normalizePermissions(defaultPermissions);
  }

  private resolveRoleName(user: AuthUser): string {
    if (typeof user.role === 'string') {
      return user.role;
    }

    if (user.role && typeof user.role === 'object') {
      return String(user.role.name || '');
    }

    return '';
  }

  private normalizePermissions(permissions: string[]): Set<string> {
    const result = new Set<string>();
    for (const permission of permissions) {
      const normalized = this.normalizePermission(permission);
      if (!normalized) continue;

      if (isWildcardPermission(normalized)) {
        result.add('*');
        continue;
      }

      result.add(normalized);
    }

    return result;
  }

  private normalizePermission(permission: string | null | undefined): string {
    return String(permission || '')
      .trim()
      .toLowerCase();
  }
}

