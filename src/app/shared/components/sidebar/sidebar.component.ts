import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { CommonModule } from '@angular/common';
import { PermissionService } from '../../../auth/permission.service';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css'],
  standalone: true,
  imports: [RouterModule, CommonModule]
})
export class SidebarComponent {
  readonly authService = inject(AuthService);
  readonly permissionService = inject(PermissionService);

  can(permission: string): boolean {
    return this.permissionService.can(permission);
  }
}
