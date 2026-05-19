import { Component, OnInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { UserService, User, Role } from '../../../shared/services/user.service';
import { AuthService } from '../../../auth/auth.service';
import { AlertService } from '../../../shared/services/alert.service';
import { AlertComponent } from '../../../shared/components/alert/alert.component';
import { UserModalComponent } from '../../components/user-modal/user-modal';
import { PermissionService } from '../../../auth/permission.service';

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [CommonModule, UserModalComponent, FormsModule, AlertComponent],
  templateUrl: './user-management.html',
  styleUrls: ['./user-management.css']
})
export class UserManagementComponent implements OnInit {
  @ViewChild(UserModalComponent) userModal!: UserModalComponent;

  users: User[] = [];
  roles: Role[] = [];
  isLoadingUsers = false;
  isLoadingRoles = false;
  searchText = '';
  activeChecked = true;
  inactiveChecked = true;

  constructor(
    private userService: UserService,
    private alertService: AlertService,
    public authService: AuthService,
    public permissionService: PermissionService,
    private cdr: ChangeDetectorRef
  ) {}

  get canCreateUsers(): boolean {
    return this.permissionService.can('users.create');
  }

  get canUpdateUsers(): boolean {
    return this.permissionService.can('users.update');
  }

  get canDeleteUsers(): boolean {
    return this.permissionService.can('users.disable');
  }

  ngOnInit() {
    this.searchText = '';
    this.activeChecked = true;
    this.inactiveChecked = true;
    this.loadUsers();
    this.loadRoles();
  }

  private getErrorMessage(error: any, fallback: string) {
    if (error instanceof HttpErrorResponse) {
      return error.error?.message || error.message || fallback;
    }
    return fallback;
  }

  loadUsers() {
    this.isLoadingUsers = true;
    console.log('Iniciando carga de usuarios...');
    this.userService.getUsers().subscribe({
      next: (users) => {
        console.log('Usuarios cargados:', users);
        this.users = users;
        this.isLoadingUsers = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.isLoadingUsers = false;
        const message = this.getErrorMessage(error, 'Error al cargar usuarios');
        console.error('Error loading users:', error);
        console.error('Error detallado:', {
          status: error?.status,
          statusText: error?.statusText,
          message: error?.message
        });
        this.alertService.show(message, 'error', 4000);
        this.cdr.markForCheck();
      }
    });
  }

  loadRoles() {
    this.isLoadingRoles = true;
    this.userService.getRoles().subscribe({
      next: (roles) => {
        this.roles = roles;
        this.isLoadingRoles = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.isLoadingRoles = false;
        const message = this.getErrorMessage(error, 'Error al cargar roles');
        console.error('Error loading roles:', error);
        this.alertService.show(message, 'error', 4000);
        this.cdr.markForCheck();
      }
    });
  }

  openModal() {
    this.userModal.setEditingUser(null);
    this.userModal.openModal();
  }

  editUser(user: User) {
    this.userModal.setEditingUser(user);
    this.userModal.openModal();
  }

  onUserSaved(event: any) {
    const { isEditing, data, userId } = event;

    if (isEditing && userId) {
      this.userService.updateUser(userId, data).subscribe({
        next: () => {
          this.loadUsers();
          this.alertService.show('Usuario actualizado correctamente', 'success', 3000);
        },
        error: (error) => {
          const message = this.getErrorMessage(error, 'Error al actualizar usuario');
          console.error('Error updating user:', error);
          this.alertService.show(message, 'error', 4000);
        }
      });
    } else {
      this.userService.createUser(data).subscribe({
        next: () => {
          this.loadUsers();
          this.alertService.show('Usuario creado correctamente', 'success', 3000);
        },
        error: (error) => {
          const message = this.getErrorMessage(error, 'Error al crear usuario');
          console.error('Error creating user:', error);
          this.alertService.show(message, 'error', 4000);
        }
      });
    }
  }

  deleteUser(user: User) {
    if (confirm(`¿Estás seguro de que quieres eliminar al usuario ${user.firstName} ${user.lastName}?`)) {
      this.userService.deleteUser(user.id).subscribe({
        next: () => {
          this.loadUsers();
          this.alertService.show('Usuario eliminado correctamente', 'success', 3000);
        },
        error: (error) => {
          const message = this.getErrorMessage(error, 'Error al eliminar usuario');
          console.error('Error deleting user:', error);
          this.alertService.show(message, 'error', 4000);
        }
      });
    }
  }

  getRoleName(roleId: number): string {
    const role = this.roles.find(r => r.id === roleId);
    return role ? role.name : 'Unknown';
  }

  getFilteredUsers(): User[] {
    if (!this.users || this.users.length === 0) {
      return [];
    }

    return this.users.filter(user => {
      const searchLower = (this.searchText || '').toLowerCase();
      const matchesSearch = !searchLower ||
        user.firstName.toLowerCase().includes(searchLower) ||
        user.lastName.toLowerCase().includes(searchLower) ||
        user.email.toLowerCase().includes(searchLower);

      const userActive = user.isActive === true;
      const matchesStatus = (this.activeChecked && userActive) || (this.inactiveChecked && !userActive);

      return matchesSearch && matchesStatus;
    });
  }

  toggleActive(checked: boolean) {
    this.activeChecked = checked;
  }

  toggleInactive(checked: boolean) {
    this.inactiveChecked = checked;
  }
}
