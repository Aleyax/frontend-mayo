import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { AlertService } from '../../../shared/services/alert.service';
import {
  PermissionCatalogItem,
  Role,
  RolePermissionsResponse,
  UserService
} from '../../../shared/services/user.service';
import { PermissionService } from '../../../auth/permission.service';

type RoleFormModel = {
  name: string;
  description: string;
  isActive: boolean;
};

type RoleWithMeta = Role & {
  isActive?: boolean;
  description?: string | null;
  createdAt?: string;
};

type StatusFilter = 'all' | 'active' | 'inactive';

type PermissionGroup = {
  module: string;
  permissions: PermissionCatalogItem[];
};

@Component({
  selector: 'app-role-management-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './role-management-page.component.html',
  styleUrls: ['./role-management-page.component.css']
})
export class RoleManagementPageComponent implements OnInit {
  roles: RoleWithMeta[] = [];
  filteredRoles: RoleWithMeta[] = [];
  isLoading = false;
  searchText = '';
  statusFilter: StatusFilter = 'all';

  showRoleModal = false;
  isSaving = false;
  editingRoleId: number | null = null;
  roleForm: RoleFormModel = { name: '', description: '', isActive: true };

  showPermissionsModal = false;
  isPermissionsLoading = false;
  isSavingPermissions = false;
  selectedRoleForPermissions: RoleWithMeta | null = null;
  permissionCatalog: PermissionCatalogItem[] = [];
  permissionGroups: PermissionGroup[] = [];
  selectedPermissions = new Set<string>();

  constructor(
    private readonly userService: UserService,
    private readonly alertService: AlertService,
    private readonly permissionService: PermissionService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadRoles();
  }

  get canCreateRole(): boolean {
    return this.permissionService.can('roles.create');
  }

  get canEditRole(): boolean {
    return this.permissionService.can('roles.update');
  }

  get canManageRolePermissions(): boolean {
    return this.permissionService.can('roles.permissions');
  }

  loadRoles(): void {
    this.isLoading = true;
    this.userService.getRoles().subscribe({
      next: (roles) => {
        this.roles = (roles as RoleWithMeta[]).sort((a, b) => {
          const first = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const second = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return second - first;
        });
        this.applyRoleFilters();
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.isLoading = false;
        this.alertService.show(this.getErrorMessage(error, 'Error al cargar roles'), 'error', 4000);
        this.cdr.markForCheck();
      }
    });
  }

  onFiltersChanged(): void {
    this.applyRoleFilters();
  }

  private applyRoleFilters(): void {
    const term = this.searchText.trim().toLowerCase();

    this.filteredRoles = this.roles.filter((role) => {
      const matchesName = !term || role.name.toLowerCase().includes(term);
      const active = role.isActive !== false;

      if (this.statusFilter === 'active') {
        return matchesName && active;
      }

      if (this.statusFilter === 'inactive') {
        return matchesName && !active;
      }

      return matchesName;
    });
  }

  getUsersCount(role: RoleWithMeta): number {
    return Array.isArray(role.users) ? role.users.length : 0;
  }

  openCreateModal(): void {
    this.editingRoleId = null;
    this.roleForm = { name: '', description: '', isActive: true };
    this.showRoleModal = true;
  }

  openEditModal(role: RoleWithMeta): void {
    this.editingRoleId = role.id;
    this.roleForm = {
      name: role.name,
      description: role.description || '',
      isActive: role.isActive !== false
    };
    this.showRoleModal = true;
  }

  closeRoleModal(): void {
    if (this.isSaving) return;
    this.showRoleModal = false;
    this.editingRoleId = null;
    this.roleForm = { name: '', description: '', isActive: true };
  }

  saveRole(configurePermissionsAfterCreate = false): void {
    const payloadName = this.roleForm.name.trim();
    if (!payloadName) {
      this.alertService.show('El nombre del rol es obligatorio.', 'warning', 3000);
      return;
    }

    this.isSaving = true;
    const payload = {
      name: payloadName,
      description: this.roleForm.description.trim() || undefined,
      isActive: this.roleForm.isActive
    };

    const isCreateMode = this.editingRoleId === null;
    const request$ = this.editingRoleId
      ? this.userService.updateRole(this.editingRoleId, payload)
      : this.userService.createRole(payload);

    request$.subscribe({
      next: (savedRole) => {
        const createdRole = savedRole as RoleWithMeta;
        this.isSaving = false;
        this.showRoleModal = false;
        this.editingRoleId = null;
        this.roleForm = { name: '', description: '', isActive: true };
        this.loadRoles();

        if (isCreateMode && configurePermissionsAfterCreate && this.canManageRolePermissions) {
        this.showAlertDeferred('Rol creado. Ahora configura sus permisos.', 'success', 3000);
        this.openPermissionsModal(createdRole);
        return;
      }

      this.showAlertDeferred('Rol guardado correctamente.', 'success', 3000);
      },
      error: (error) => {
        this.isSaving = false;
        this.showAlertDeferred(this.getErrorMessage(error, 'No se pudo guardar el rol.'), 'error', 4000);
      }
    });
  }

  toggleRoleStatus(role: RoleWithMeta): void {
    if (!this.canEditRole) return;

    const targetStatus = role.isActive === false;
    const actionText = targetStatus ? 'activar' : 'desactivar';
    const confirmed = confirm(`Deseas ${actionText} el rol "${role.name}"?`);
    if (!confirmed) return;

    this.userService.updateRoleStatus(role.id, targetStatus).subscribe({
      next: () => {
        this.loadRoles();
        this.showAlertDeferred(`Rol ${targetStatus ? 'activado' : 'desactivado'} correctamente.`, 'success', 3000);
      },
      error: (error) => {
        this.showAlertDeferred(this.getErrorMessage(error, `No se pudo ${actionText} el rol.`), 'error', 4000);
      }
    });
  }

  openPermissionsModal(role: RoleWithMeta): void {
    this.showPermissionsModal = true;
    this.selectedRoleForPermissions = role;
    this.isPermissionsLoading = true;
    this.isSavingPermissions = false;
    this.selectedPermissions = new Set<string>();
    this.permissionCatalog = [];
    this.permissionGroups = [];

    forkJoin({
      catalog: this.userService.getPermissionsCatalog(),
      assigned: this.userService.getRolePermissions(role.id)
    }).subscribe({
      next: ({ catalog, assigned }) => {
        this.permissionCatalog = Array.isArray(catalog) ? catalog : [];
        this.permissionGroups = this.buildPermissionGroups(this.permissionCatalog);
        this.selectedPermissions = new Set(this.normalizePermissions(assigned));
        this.isPermissionsLoading = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.isPermissionsLoading = false;
        this.showAlertDeferred(this.getErrorMessage(error, 'No se pudieron cargar los permisos.'), 'error', 4000);
        this.cdr.markForCheck();
      }
    });
  }

  closePermissionsModal(force = false): void {
    if (!force && this.isSavingPermissions) return;
    this.showPermissionsModal = false;
    this.selectedRoleForPermissions = null;
    this.isPermissionsLoading = false;
    this.permissionCatalog = [];
    this.permissionGroups = [];
    this.selectedPermissions = new Set<string>();
  }

  isPermissionSelected(code: string): boolean {
    return this.selectedPermissions.has(this.normalizePermission(code));
  }

  togglePermission(code: string, event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const normalized = this.normalizePermission(code);

    if (!target) return;
    if (target.checked) {
      this.selectedPermissions.add(normalized);
      return;
    }

    this.selectedPermissions.delete(normalized);
  }

  saveRolePermissions(): void {
    if (!this.selectedRoleForPermissions) return;

    this.isSavingPermissions = true;
    const sorted = Array.from(this.selectedPermissions).sort((a, b) => a.localeCompare(b));

    this.userService.updateRolePermissions(this.selectedRoleForPermissions.id, sorted).subscribe({
      next: () => {
        this.isSavingPermissions = false;
        this.closePermissionsModal(true);
        this.showAlertDeferred('Permisos del rol actualizados correctamente.', 'success', 3200);
        this.loadRoles();
      },
      error: (error) => {
        this.isSavingPermissions = false;
        this.showAlertDeferred(this.getErrorMessage(error, 'No se pudieron guardar los permisos.'), 'error', 4000);
      }
    });
  }

  getRoleStatusLabel(role: RoleWithMeta): string {
    return role.isActive === false ? 'Inactivo' : 'Activo';
  }

  getModuleLabel(moduleName: string): string {
    if (!moduleName) return 'General';
    const value = moduleName.trim();
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  private normalizePermission(permission: string | null | undefined): string {
    return String(permission || '').trim().toLowerCase();
  }

  private buildPermissionGroups(catalog: PermissionCatalogItem[]): PermissionGroup[] {
    const groups = new Map<string, PermissionCatalogItem[]>();

    for (const permission of catalog) {
      if (!permission.isActive) continue;

      const moduleName = permission.module || 'general';
      if (!groups.has(moduleName)) {
        groups.set(moduleName, []);
      }
      groups.get(moduleName)!.push(permission);
    }

    return Array.from(groups.entries())
      .map(([module, permissions]) => ({
        module,
        permissions: permissions.slice().sort((a, b) => a.code.localeCompare(b.code))
      }))
      .sort((a, b) => a.module.localeCompare(b.module));
  }

  private normalizePermissions(response: RolePermissionsResponse | null | undefined): string[] {
    if (!response || !Array.isArray(response.permissions)) {
      return [];
    }

    return response.permissions
      .map((permission) => this.normalizePermission(permission))
      .filter((permission) => permission.length > 0);
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      return error.error?.message || error.message || fallback;
    }
    return fallback;
  }

  private showAlertDeferred(
    message: string,
    type: 'success' | 'error' | 'warning' | 'info',
    duration: number
  ): void {
    setTimeout(() => {
      this.alertService.show(message, type, duration);
    }, 0);
  }
}
