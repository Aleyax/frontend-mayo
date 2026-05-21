import { Routes } from '@angular/router';
import { AdminDashboardLayoutComponent } from './layouts/admin-dashboard-layout/admin-dashboard-layout.component';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionGuard } from '../auth/permission.guard';

export const adminDashboardRoute: Routes = [
  {
    path: '',
    component: AdminDashboardLayoutComponent,
    canActivate: [AuthGuard],
    children: [
      {
        path: 'dashboard',
        canActivate: [PermissionGuard],
        data: { permission: 'dashboard.view' },
        loadComponent: () => import('./pages/dashboard-home-page/dashboard-home-page.component').then(m => m.DashboardHomePageComponent)
      },
      {
        path: 'category',
        canActivate: [PermissionGuard],
        data: { permission: 'categories.manage' },
        loadComponent: () => import('./pages/category-admin-page/category-admin-page.component').then(m => m.CategoryAdminPageComponent)
      },
      {
        path: 'color',
        canActivate: [PermissionGuard],
        data: { permission: 'colors.manage' },
        loadComponent: () => import('./pages/color-admin-page/color-admin-page.component').then(m => m.ColorAdminPageComponent)
      },
      {
        path: 'size',
        canActivate: [PermissionGuard],
        data: { permission: 'sizes.manage' },
        loadComponent: () => import('./pages/size-admin-page/size-admin-page.component').then(m => m.SizeAdminPageComponent)
      },
      {
        path: 'payment-methods',
        canActivate: [PermissionGuard],
        data: { permission: 'payment_methods.manage' },
        loadComponent: () => import('./pages/payment-method-admin-page/payment-method-admin-page.component').then(m => m.PaymentMethodAdminPageComponent)
      },
      {
        path: 'product',
        canActivate: [PermissionGuard],
        data: { permission: 'products.view' },
        loadComponent: () => import('./pages/product-admin-page/product-admin-page.component').then(m => m.ProductAdminPageComponent)
      },
      {
        path: 'inventory/movements',
        canActivate: [PermissionGuard],
        data: { permission: 'inventory.view' },
        loadComponent: () => import('./pages/inventory-movements-page/inventory-movements-page.component').then(m => m.InventoryMovementsPageComponent)
      },
      {
        path: 'inventory/traceability',
        canActivate: [PermissionGuard],
        data: { permission: 'inventory.view' },
        loadComponent: () => import('./pages/inventory-traceability-page/inventory-traceability-page.component').then(m => m.InventoryTraceabilityPageComponent)
      },
      {
        path: 'inventory',
        canActivate: [PermissionGuard],
        data: { permission: 'inventory.view' },
        loadComponent: () => import('./pages/inventory-admin-page/inventory-admin-page.component').then(m => m.InventoryAdminPageComponent)
      },
      {
        path: 'transfers',
        canActivate: [PermissionGuard],
        data: { permission: 'transfers.view' },
        loadComponent: () => import('./pages/transfer-admin-page/transfer-admin-page.component').then(m => m.TransferAdminPageComponent)
      },
      {
        path: 'stores',
        canActivate: [PermissionGuard],
        data: { permission: 'stores.view' },
        loadComponent: () => import('./pages/store-admin-page/store-admin-page.component').then(m => m.StoreAdminPageComponent)
      },
      {
        path: 'users',
        canActivate: [PermissionGuard],
        data: { permission: 'users.view' },
        loadComponent: () => import('./pages/user-management/user-management').then(m => m.UserManagementComponent)
      },
      {
        path: 'roles',
        canActivate: [PermissionGuard],
        data: { permission: 'roles.view' },
        loadComponent: () => import('./pages/role-management-page/role-management-page.component').then(m => m.RoleManagementPageComponent)
      },
      {
        path: 'settings',
        canActivate: [PermissionGuard],
        data: { permission: 'settings.manage' },
        loadComponent: () => import('./pages/system-settings-page/system-settings-page.component').then(m => m.SystemSettingsPageComponent)
      },
      {
        path: 'orders',
        canActivate: [PermissionGuard],
        data: { permission: 'orders.view' },
        loadChildren: () => import('../order/order.routes').then(m => m.orderRoutes)
      },
      {
        path: 'forbidden',
        loadComponent: () => import('./pages/forbidden-page/forbidden-page.component').then(m => m.ForbiddenPageComponent)
      },
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      },
      {
        path: '**',
        redirectTo: 'dashboard'
      }
    ]
  }
]


