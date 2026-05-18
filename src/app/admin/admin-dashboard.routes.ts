import { Routes } from '@angular/router';
import { AdminDashboardLayoutComponent } from './layouts/admin-dashboard-layout/admin-dashboard-layout.component';
import { AuthGuard } from '../auth/auth.guard';



export const adminDashboardRoute: Routes = [
  {
    path: '',
    component: AdminDashboardLayoutComponent,
    canActivate: [AuthGuard],
    children: [
      {
        path: 'category',
        loadComponent: () => import('./pages/category-admin-page/category-admin-page.component').then(m => m.CategoryAdminPageComponent)
      },
      {
        path: 'color',
        loadComponent: () => import('./pages/color-admin-page/color-admin-page.component').then(m => m.ColorAdminPageComponent)
      },
      {
        path: 'size',
        loadComponent: () => import('./pages/size-admin-page/size-admin-page.component').then(m => m.SizeAdminPageComponent)
      },
      {
        path: 'product',
        loadComponent: () => import('./pages/product-admin-page/product-admin-page.component').then(m => m.ProductAdminPageComponent)
      },
      {
        path: 'inventory',
        loadComponent: () => import('./pages/inventory-admin-page/inventory-admin-page.component').then(m => m.InventoryAdminPageComponent)
      },
      {
        path: 'transfers',
        loadComponent: () => import('./pages/transfer-admin-page/transfer-admin-page.component').then(m => m.TransferAdminPageComponent)
      },
      {
        path: 'stores',
        loadComponent: () => import('./pages/store-admin-page/store-admin-page.component').then(m => m.StoreAdminPageComponent)
      },
      {
        path: 'users',
        loadComponent: () => import('./pages/user-management/user-management').then(m => m.UserManagementComponent)
      },
      {
        path: 'orders',
        loadChildren: () => import('../order/order.routes').then(m => m.orderRoutes)
      },
      {
        path: '**',
        redirectTo: 'category'
      }
    ]
  }
]


