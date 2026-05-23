import { test, expect } from '@playwright/test';

test('order detail page loads and leaves loading state', async ({ page, request }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const apiCalls: string[] = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const message = msg.text();
      if (message.includes('Error loading dashboard metrics')) {
        return;
      }
      consoleErrors.push(message);
    }
  });
  page.on('response', (response) => {
    const url = response.url();
    if (url.includes('/api/orders/1') || url.includes('/api/users') || url.includes('/api/auth')) {
      apiCalls.push(`${response.status()} ${url}`);
    }
  });

  const loginApiResponse = await request.post('http://127.0.0.1:3000/api/auth/login', {
    data: {
      email: 'admin@example.com',
      password: 'password123'
    }
  });
  expect(loginApiResponse.ok()).toBeTruthy();

  await page.goto('/login');
  await page.locator('#email').fill('admin@example.com');
  await page.locator('#password').fill('password123');
  await page.getByRole('button', { name: /Iniciar/i }).click();

  await expect(page).toHaveURL(/\/admin/);
  await page.goto('/admin/orders/1');

  const loadingText = page.getByText('Cargando pedido...');
  await loadingText.waitFor({ state: 'visible', timeout: 10000 });

  await expect
    .poll(
      async () => {
        if (await page.getByText('No se pudo cargar el pedido.').count()) return 'error';
        if (await page.getByRole('heading', { name: /ORD-/i }).count()) return 'ok';
        if ((await loadingText.count()) > 0 && await loadingText.isVisible()) return 'loading';
        return 'unknown';
      },
      { timeout: 20000, intervals: [500, 1000, 1500] }
    )
    .toBe('ok');

  expect(pageErrors, `Page errors: ${pageErrors.join(' | ')} API: ${apiCalls.join(' | ')}`).toEqual([]);
  expect(consoleErrors, `Console errors: ${consoleErrors.join(' | ')} API: ${apiCalls.join(' | ')}`).toEqual([]);
});
