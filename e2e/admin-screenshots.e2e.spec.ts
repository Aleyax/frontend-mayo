import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const screenshotsDir = path.join(process.cwd(), 'test-results', 'screenshots');

type DashboardView = {
  route: string;
  fileName: string;
  readySelector?: string;
  readyHeading?: RegExp;
};

const views: DashboardView[] = [
  {
    route: '/admin/dashboard',
    fileName: '01-dashboard-principal',
    readySelector: 'app-dashboard-home-page',
    readyHeading: /Dashboard principal/i
  },
  {
    route: '/admin/orders/list',
    fileName: '02-ordenes-lista',
    readySelector: 'app-orders-list',
    readyHeading: /Gestion de ordenes/i
  },
  {
    route: '/admin/orders/picking',
    fileName: '03-picking-board',
    readySelector: 'app-picking-board',
    readyHeading: /Tablero de Picking/i
  },
  {
    route: '/admin/inventory',
    fileName: '04-inventario',
    readySelector: 'app-inventory-admin-page',
    readyHeading: /Inventario/i
  },
  {
    route: '/admin/settings',
    fileName: '05-configuracion-operativa',
    readySelector: 'app-system-settings-page',
    readyHeading: /Configuracion Operativa/i
  }
];

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('#email').fill('admin@example.com');
  await page.locator('#password').fill('password123');
  await page.getByRole('button', { name: /Iniciar/i }).click();
  await expect(page).toHaveURL(/\/admin/);
}

test('captura vistas clave admin en PNG', async ({ page }) => {
  fs.mkdirSync(screenshotsDir, { recursive: true });

  await loginAsAdmin(page);

  for (const view of views) {
    await page.goto(view.route, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(view.route.replace(/\//g, '\\/')));

    if (view.readySelector) {
      await page
        .locator(view.readySelector)
        .first()
        .waitFor({ state: 'attached', timeout: 12000 })
        .catch(() => {});
    }
    if (view.readyHeading) {
      await page
        .getByRole('heading', { name: view.readyHeading })
        .first()
        .waitFor({ state: 'visible', timeout: 12000 })
        .catch(() => {});
    }

    await page.waitForTimeout(1200);
    await page.screenshot({
      path: path.join(screenshotsDir, `${view.fileName}.png`),
      fullPage: true
    });
  }
});
