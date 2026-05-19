import { Routes } from '@angular/router';
import { PosComponent } from './components/pos.component';
import { OrdersListComponent } from './components/orders-list.component';
import { OrderDetailComponent } from './components/order-detail.component';
import { PickingBoardComponent } from './components/picking-board.component';
import { PermissionGuard } from '../auth/permission.guard';

export const orderRoutes: Routes = [
  {
    path: '',
    children: [
      {
        path: 'create',
        redirectTo: 'pos',
        pathMatch: 'full'
      },
      {
        path: 'pos',
        canActivate: [PermissionGuard],
        data: { title: 'Crear Orden (POS)', permission: 'pos.view' },
        component: PosComponent,
      },
      {
        path: 'manage',
        redirectTo: 'list',
        pathMatch: 'full'
      },
      {
        path: 'list',
        canActivate: [PermissionGuard],
        data: { title: 'Gestion de Pedidos', permission: 'orders.view' },
        component: OrdersListComponent,
      },
      {
        path: 'picking',
        canActivate: [PermissionGuard],
        data: { title: 'Tablero de Picking', permission: 'picking.view' },
        component: PickingBoardComponent,
      },
      {
        path: ':id',
        canActivate: [PermissionGuard],
        data: { title: 'Detalle del Pedido', permission: 'orders.detail.view' },
        component: OrderDetailComponent,
      },
      {
        path: '',
        redirectTo: 'list',
        pathMatch: 'full'
      }
    ]
  }
];
