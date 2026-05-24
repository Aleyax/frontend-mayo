import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';

const outputDir = path.join(process.cwd(), 'test-results', 'screenshots-guia-uso');
const guideFileName = 'GUIA_USO_CAPTURAS.md';

function slugify(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function capture(
  page: Page,
  state: { index: number },
  label: string,
  options?: { fullPage?: boolean }
): Promise<string> {
  state.index += 1;
  const fileName = `${String(state.index).padStart(2, '0')}-${slugify(label)}.png`;
  await page.waitForTimeout(700);
  await page.screenshot({
    path: path.join(outputDir, fileName),
    fullPage: options?.fullPage ?? true
  });
  return fileName;
}

function buildGuideMarkdown(captures: Array<{ label: string; fileName: string }>): string {
  const generatedAt = new Date().toLocaleString('es-PE', { hour12: false, timeZone: 'America/Lima' });

  const lines: string[] = [
    '# Guia de Uso del Sistema (Capturas Automatizadas)',
    '',
    `Generado automaticamente: ${generatedAt}`,
    '',
    'Este documento contiene capturas del flujo operativo y marketplace para apoyo de capacitacion.',
    '',
    '## Indice de capturas'
  ];

  captures.forEach((capture, index) => {
    const step = index + 1;
    const title = capture.label.replace(/-/g, ' ');
    lines.push(`${step}. ${title}`);
  });

  lines.push('', '## Capturas');

  captures.forEach((capture, index) => {
    const step = String(index + 1).padStart(2, '0');
    const title = capture.label.replace(/-/g, ' ');
    lines.push('', `### ${step}. ${title}`, '', `![${title}](./${capture.fileName})`);
  });

  lines.push('');
  return lines.join('\n');
}

async function safeClick(locator: Locator, timeoutMs = 5000): Promise<boolean> {
  try {
    if ((await locator.count()) === 0) return false;
    const target = locator.first();
    await target.waitFor({ state: 'visible', timeout: timeoutMs });
    await target.click({ timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

async function waitForPage(
  page: Page,
  params: {
    route: string;
    selector?: string;
    heading?: RegExp;
  }
): Promise<void> {
  await page.goto(params.route, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(new RegExp(params.route.replace(/\//g, '\\/')));

  if (params.selector) {
    await page
      .locator(params.selector)
      .first()
      .waitFor({ state: 'attached', timeout: 15000 })
      .catch(() => {});
  }
  if (params.heading) {
    await page
      .getByRole('heading', { name: params.heading })
      .first()
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {});
  }
}

test('genera capturas amplias para guia de uso (admin + marketplace)', async ({ page }) => {
  fs.mkdirSync(outputDir, { recursive: true });
  const existingFiles = fs.readdirSync(outputDir);
  for (const file of existingFiles) {
    if (file.toLowerCase().endsWith('.png') || file === guideFileName) {
      fs.rmSync(path.join(outputDir, file), { force: true });
    }
  }

  const shot = { index: 0 };
  const captures: Array<{ label: string; fileName: string }> = [];
  const take = async (label: string, options?: { fullPage?: boolean }) => {
    const fileName = await capture(page, shot, label, options);
    captures.push({ label, fileName });
  };

  await page.goto('/login');
  await take('login-pantalla');

  await page.locator('#email').fill('admin@example.com');
  await page.locator('#password').fill('password123');
  await take('login-credenciales-completas');

  await page.getByRole('button', { name: /Iniciar/i }).click();
  await expect(page).toHaveURL(/\/admin/);

  await waitForPage(page, {
    route: '/admin/dashboard',
    selector: 'app-dashboard-home-page',
    heading: /Dashboard principal/i
  });
  await take('admin-dashboard-principal');

  if (await safeClick(page.locator('.alerts-list .alert-item'))) {
    await page.waitForTimeout(1200);
    await take('admin-dashboard-acceso-directo-alerta');
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await take('admin-dashboard-regreso-desde-alerta');
  }

  await waitForPage(page, {
    route: '/admin/orders/list',
    selector: 'app-orders-list',
    heading: /Gestion de ordenes/i
  });
  await take('ordenes-lista-general');

  if (await safeClick(page.locator('.filters-open-btn'))) {
    await take('ordenes-filtros-modal');
    await safeClick(page.locator('.filters-modal-close'));
  }

  if (await safeClick(page.locator('.quick-status-badge'))) {
    await page.waitForTimeout(800);
    await take('ordenes-filtro-rapido-aplicado');
  }

  if (await safeClick(page.locator('.orders-table .btn-detail'))) {
    await page.waitForTimeout(1200);
    await take('orden-detalle-vista');
    await page.goBack({ waitUntil: 'domcontentloaded' });
  }

  await waitForPage(page, {
    route: '/admin/orders/picking',
    selector: 'app-picking-board',
    heading: /Tablero de Picking/i
  });
  await take('picking-tablero-general');

  if (await safeClick(page.locator('.orders-queue .order-card'))) {
    await page.waitForTimeout(1000);
    await take('picking-detalle-de-orden');
  }

  await waitForPage(page, {
    route: '/admin/orders/pos',
    selector: 'app-pos',
    heading: /Punto de venta/i
  });
  await take('pos-pantalla-principal');

  const storeSelect = page.locator('#sourceStore');
  if ((await storeSelect.count()) > 0) {
    const optionCount = await storeSelect.locator('option').count();
    if (optionCount > 1) {
      await storeSelect.selectOption({ index: 1 });
      await page.waitForTimeout(1200);
      await take('pos-tienda-seleccionada');
    }
  }

  if (await safeClick(page.locator('.products-grid .product-card'))) {
    await page.waitForTimeout(900);
    await take('pos-selector-variante-abierto');

    if ((await page.locator('.drawer-content .color-btn').count()) > 0) {
      await page.locator('.drawer-content .color-btn').first().click();
    }
    if ((await page.locator('.drawer-content .size-btn').count()) > 0) {
      await page.locator('.drawer-content .size-btn').first().click();
    }
    if ((await page.locator('#variantQuantity').count()) > 0) {
      await page.locator('#variantQuantity').fill('1');
    }

    const addToCartButton = page.getByRole('button', { name: /Agregar al carrito/i }).first();
    if (await addToCartButton.isEnabled().catch(() => false)) {
      await addToCartButton.click();
      await page.waitForTimeout(1000);
      await take('pos-producto-agregado-carrito');
    }
  }

  const cobrarButton = page.getByRole('button', { name: /Cobrar/i }).first();
  if (await cobrarButton.isEnabled().catch(() => false)) {
    await cobrarButton.click();
    await page.waitForTimeout(800);
    await take('pos-modal-cobro');

    if ((await page.locator('#clientName').count()) > 0) {
      await page.locator('#clientName').fill('Cliente Guia');
    }
    if ((await page.locator('#clientPhone').count()) > 0) {
      await page.locator('#clientPhone').fill('999999999');
    }
    if ((await page.locator('#clientAddress').count()) > 0) {
      await page.locator('#clientAddress').fill('Av. Demo 123');
    }
    if ((await page.locator('#note').count()) > 0) {
      await page.locator('#note').fill('Captura para guia de uso');
    }
    await take('pos-datos-cliente-y-pago');

    await safeClick(page.locator('.drawer-content .btn-secondary'));
  }

  if (await safeClick(page.getByRole('button', { name: /Historial/i }))) {
    await page.waitForTimeout(800);
    await take('pos-historial-ventas');
    await safeClick(page.locator('.modal-content .close-btn'));
  }

  await waitForPage(page, {
    route: '/admin/inventory',
    selector: 'app-inventory-admin-page',
    heading: /Inventario/i
  });
  await take('inventario-vista-principal');

  if (await safeClick(page.getByRole('button', { name: /Filtros avanzados/i }))) {
    await page.waitForTimeout(700);
    await take('inventario-filtros-avanzados');
  }

  if (await safeClick(page.getByRole('button', { name: /Nuevo ingreso por tienda y variante/i }))) {
    await page.waitForTimeout(900);
    await take('inventario-drawer-nuevo-movimiento');
    await safeClick(page.locator('aside button.btn-ghost.btn-circle'));
  }

  await waitForPage(page, {
    route: '/admin/transfers',
    selector: 'app-transfer-admin-page',
    heading: /Transferencias de stock/i
  });
  await take('transferencias-listado');

  if (await safeClick(page.getByRole('button', { name: /Nueva transferencia/i }))) {
    await page.waitForTimeout(900);
    await take('transferencias-drawer-crear');
    await safeClick(page.locator('aside .btn-ghost.btn-circle'));
  }

  if (await safeClick(page.getByRole('button', { name: /^Ver$/i }))) {
    await page.waitForTimeout(900);
    await take('transferencias-detalle');
    await safeClick(page.getByRole('button', { name: /Cerrar/i }));
  }

  await waitForPage(page, {
    route: '/admin/product',
    selector: 'app-product-admin-page',
    heading: /Product Admin Page/i
  });
  await take('productos-admin-listado');

  if (await safeClick(page.getByRole('button', { name: /^Agregar$/i }))) {
    await page.waitForTimeout(900);
    await take('productos-admin-modal-crear');
    await safeClick(page.locator('dialog#product-modal[open] button:has-text("Cerrar")'));
  }

  await waitForPage(page, {
    route: '/admin/category',
    selector: 'app-category-admin-page',
    heading: /Category Admin Page/i
  });
  await take('categorias-admin-listado');
  if (await safeClick(page.getByRole('button', { name: /^Agregar$/i }))) {
    await page.waitForTimeout(700);
    await take('categorias-admin-modal');
    await safeClick(page.locator('dialog#generic-modal[open] button:has-text("Cancelar")'));
  }

  await waitForPage(page, {
    route: '/admin/color',
    selector: 'app-color-admin-page',
    heading: /Color Admin Page/i
  });
  await take('colores-admin-listado');
  if (await safeClick(page.getByRole('button', { name: /^Agregar$/i }))) {
    await page.waitForTimeout(700);
    await take('colores-admin-modal');
    await safeClick(page.locator('dialog#generic-modal[open] button:has-text("Cancelar")'));
  }

  await waitForPage(page, {
    route: '/admin/size',
    selector: 'app-size-admin-page',
    heading: /Size Admin Page/i
  });
  await take('tallas-admin-listado');
  if (await safeClick(page.getByRole('button', { name: /^Agregar$/i }))) {
    await page.waitForTimeout(700);
    await take('tallas-admin-modal');
    await safeClick(page.locator('dialog#generic-modal[open] button:has-text("Cancelar")'));
  }

  await waitForPage(page, {
    route: '/admin/payment-methods',
    selector: 'app-payment-method-admin-page',
    heading: /Gestion de Metodos de Pago/i
  });
  await take('metodos-pago-admin-listado');
  if (await safeClick(page.getByRole('button', { name: /^Agregar$/i }))) {
    await page.waitForTimeout(700);
    await take('metodos-pago-admin-modal');
    await safeClick(page.locator('dialog#generic-modal[open] button:has-text("Cancelar")'));
  }

  await waitForPage(page, {
    route: '/admin/stores',
    selector: 'app-store-admin-page',
    heading: /tiendas y almacenes/i
  });
  await take('tiendas-almacenes-listado');
  if (await safeClick(page.getByRole('button', { name: /Agregar tienda/i }))) {
    await page.waitForTimeout(700);
    await take('tiendas-almacenes-modal');
    await safeClick(page.locator('dialog#store-modal[open] button:has-text("Cancelar")'));
  }

  await waitForPage(page, {
    route: '/admin/users',
    selector: 'app-user-management',
    heading: /Gestion de Usuarios/i
  });
  await take('usuarios-listado');
  if (await safeClick(page.getByRole('button', { name: /Agregar Usuario/i }))) {
    await page.waitForTimeout(700);
    await take('usuarios-modal-crear');
    await safeClick(page.locator('dialog#user-modal[open] button:has-text("Cancelar")'));
  }

  await waitForPage(page, {
    route: '/admin/roles',
    selector: 'app-role-management-page',
    heading: /Gestion de Roles/i
  });
  await take('roles-listado');
  if (await safeClick(page.getByRole('button', { name: /Crear Rol/i }))) {
    await page.waitForTimeout(700);
    await take('roles-modal-crear');
    await safeClick(page.locator('.modal-content button:has-text("Cancelar")'));
  }
  if (await safeClick(page.getByRole('button', { name: /Permisos/i }))) {
    await page.waitForTimeout(700);
    await take('roles-modal-permisos');
    await safeClick(page.locator('.modal-content button:has-text("Cerrar")'));
  }

  await waitForPage(page, {
    route: '/admin/settings',
    selector: 'app-system-settings-page',
    heading: /Configuracion Operativa/i
  });
  await take('configuracion-operativa');

  await waitForPage(page, {
    route: '/admin/audit-logs',
    selector: 'app-audit-log-page',
    heading: /Bitacora global de trazabilidad/i
  });
  await take('bitacora-global-listado');
  if (await safeClick(page.getByRole('button', { name: /Ver detalle/i }))) {
    await page.waitForTimeout(700);
    await take('bitacora-global-detalle');
    await safeClick(page.getByRole('button', { name: /Cerrar/i }));
  }

  await waitForPage(page, {
    route: '/admin/user-activities',
    selector: 'app-user-activity-page',
    heading: /Movimientos de usuarios/i
  });
  await take('movimientos-usuarios-listado');
  if (await safeClick(page.getByRole('button', { name: /Ver detalle/i }))) {
    await page.waitForTimeout(700);
    await take('movimientos-usuarios-detalle');
    await safeClick(page.getByRole('button', { name: /Cerrar/i }));
  }

  await waitForPage(page, {
    route: '/marketplace',
    selector: '.marketplace-page',
    heading: /Compra por variantes como en Alibaba/i
  });
  await take('marketplace-home');

  if (await safeClick(page.locator('.products-grid .view-btn'))) {
    await page.waitForTimeout(1000);
    await take('marketplace-producto-detalle');

    if (await safeClick(page.locator('.offer-panel .open-drawer-link'))) {
      await page.waitForTimeout(800);
      await take('marketplace-drawer-variantes');

      if ((await page.locator('.drawer-list .drawer-item').count()) > 0) {
        await page.locator('.drawer-list .drawer-item .qty-stepper button:last-child').first().click().catch(() => {});
      }
      await safeClick(page.locator('.drawer-foot .btn-primary'));
      await page.waitForTimeout(900);
      await take('marketplace-detalle-con-seleccion');
    }
  }

  await waitForPage(page, {
    route: '/marketplace/cart',
    selector: '.mk-cart-page',
    heading: /Carrito mayorista/i
  });
  await take('marketplace-carrito');

  if (await safeClick(page.getByRole('button', { name: /Continuar a checkout/i }))) {
    await page.waitForTimeout(900);
    await take('marketplace-checkout-inicial');

    if ((await page.locator('input[name="clientName"]').count()) > 0) {
      await page.locator('input[name="clientName"]').fill('Cliente Guia Marketplace');
      await page.locator('input[name="clientPhone"]').fill('999999999');
      await page.locator('input[name="clientEmail"]').fill('cliente.guia@example.com');
      await page.locator('input[name="companyName"]').fill('Empresa Demo SAC');
      await page.locator('input[name="ruc"]').fill('20123456789');
    }
    await take('marketplace-checkout-datos-cliente');
  }

  const markdownContent = buildGuideMarkdown(captures);
  fs.writeFileSync(path.join(outputDir, guideFileName), markdownContent, 'utf-8');
});
