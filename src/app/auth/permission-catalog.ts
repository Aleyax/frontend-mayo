export type PermissionCode = string;

const WILDCARD_PERMISSION = '*';

const ROLE_PERMISSION_MATRIX: Record<string, PermissionCode[]> = {
  ADMIN: [WILDCARD_PERMISSION],
  MANAGER: [
    'dashboard.view',
    'users.view',
    'users.create',
    'users.update',
    'users.change_password',
    'roles.view',
    'products.view',
    'products.create',
    'products.update',
    'products.disable',
    'categories.manage',
    'colors.manage',
    'sizes.manage',
    'stores.view',
    'stores.create',
    'stores.update',
    'stores.disable',
    'inventory.view',
    'inventory.history.view',
    'inventory.movement.create',
    'inventory.adjustment.create',
    'transfers.view',
    'transfers.create',
    'transfers.dispatch',
    'transfers.receive',
    'transfers.cancel',
    'orders.view',
    'orders.detail.view',
    'orders.status.update',
    'orders.cancel',
    'orders.print',
    'pos.view',
    'pos.sell',
    'pos.charge',
    'pos.cancel_sale',
    'pos.discount.apply',
    'picking.view',
    'picking.start',
    'picking.update',
    'picking.complete'
  ],
  SELLER: [
    'dashboard.view',
    'products.view',
    'orders.view',
    'orders.detail.view',
    'orders.print',
    'pos.view',
    'pos.sell',
    'pos.charge',
    'pos.cancel_sale',
    'pos.discount.apply'
  ],
  WAREHOUSE: [
    'dashboard.view',
    'products.view',
    'stores.view',
    'inventory.view',
    'inventory.history.view',
    'inventory.movement.create',
    'inventory.adjustment.create',
    'transfers.view',
    'transfers.create',
    'transfers.dispatch',
    'transfers.receive',
    'transfers.cancel',
    'orders.view',
    'orders.detail.view',
    'picking.view',
    'picking.start',
    'picking.update',
    'picking.complete'
  ],
  PICKER: [
    'dashboard.view',
    'orders.view',
    'orders.detail.view',
    'picking.view',
    'picking.start',
    'picking.update',
    'picking.complete'
  ],
  USER: ['dashboard.view']
};

export function getDefaultPermissionsByRole(roleName: string | null | undefined): PermissionCode[] {
  const normalizedRole = String(roleName || '')
    .trim()
    .toUpperCase();

  return ROLE_PERMISSION_MATRIX[normalizedRole] || [];
}

export function isWildcardPermission(permission: string): boolean {
  return permission === WILDCARD_PERMISSION;
}
