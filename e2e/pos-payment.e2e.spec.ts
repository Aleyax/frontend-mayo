import { test, expect } from '@playwright/test';

test('POS payment flow exits processing state and shows feedback toast', async ({ page, request }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const browserApiResponses: string[] = [];
  page.on('response', (response) => {
    const url = response.url();
    if (url.includes('/api/stores') || url.includes('/api/products') || url.includes('/api/orders')) {
      browserApiResponses.push(`${response.status()} ${url}`);
    }
  });

  const loginApiResponse = await request.post('http://127.0.0.1:3000/api/auth/login', {
    data: {
      email: 'admin@example.com',
      password: 'password123'
    }
  });
  expect(loginApiResponse.ok()).toBeTruthy();
  const loginApiBody = await loginApiResponse.json();
  const token = loginApiBody?.token as string;
  expect(token).toBeTruthy();

  const authHeaders = {
    Authorization: `Bearer ${token}`
  };

  const storesApiResponse = await request.get('http://127.0.0.1:3000/api/stores?skip=1&take=20', {
    headers: authHeaders
  });
  expect(storesApiResponse.ok()).toBeTruthy();
  const stores = await storesApiResponse.json();
  const targetStore = Array.isArray(stores) ? stores[0] : null;
  expect(targetStore?.id).toBeTruthy();

  const productsApiResponse = await request.get('http://127.0.0.1:3000/api/products?skip=1&take=1&isActive=true', {
    headers: authHeaders
  });
  expect(productsApiResponse.ok()).toBeTruthy();
  const productsApiBody = await productsApiResponse.json();
  const targetVariantId = productsApiBody?.data?.[0]?.variants?.[0]?.id;
  expect(targetVariantId).toBeTruthy();

  const seedStockResponse = await request.post('http://127.0.0.1:3000/api/inventory/movements', {
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json'
    },
    data: {
      storeId: Number(targetStore.id),
      variantId: Number(targetVariantId),
      type: 'IN',
      quantity: 500,
      note: 'POS e2e stock seed'
    }
  });
  expect(seedStockResponse.ok(), `No se pudo sembrar stock: ${await seedStockResponse.text()}`).toBeTruthy();

  await page.goto('/login');
  await page.locator('#email').fill('admin@example.com');
  await page.locator('#password').fill('password123');
  await page.getByRole('button', { name: /Iniciar/i }).click();

  await expect(page).toHaveURL(/\/admin/);
  await page.goto('/admin/orders/pos');
  await expect(page.getByRole('heading', { name: /Punto de venta/i })).toBeVisible();

  const storeSelect = page.locator('#sourceStore');
  await expect(storeSelect).toBeVisible();
  let storesOptionCount = await storeSelect.locator('option').count();
  for (let attempt = 0; attempt < 30 && storesOptionCount <= 1; attempt++) {
    await page.waitForTimeout(500);
    storesOptionCount = await storeSelect.locator('option').count();
  }
  expect(
    storesOptionCount,
    `No cargaron tiendas en POS. Respuestas API navegador: ${browserApiResponses.join(' | ')}`
  ).toBeGreaterThan(1);

  const findProductsWithStock = async () =>
    page.locator('.product-card').filter({ hasText: /Stock:/i }).count();

  let productsWithStockCount = await findProductsWithStock();
  if (productsWithStockCount === 0) {
    const optionCount = await storeSelect.locator('option').count();
    for (let index = 1; index < optionCount; index++) {
      try {
        await storeSelect.selectOption({ index }, { timeout: 5000 });
      } catch {
        continue;
      }
      await page.waitForTimeout(1200);
      productsWithStockCount = await findProductsWithStock();
      if (productsWithStockCount > 0) {
        break;
      }
    }
  }

  expect(productsWithStockCount, 'No se encontraron productos con stock luego de sembrar inventario para e2e').toBeGreaterThan(0);

  const productWithStock = page.locator('.product-card').filter({ hasText: /Stock:/i }).first();
  await expect(productWithStock).toBeVisible();
  await productWithStock.click();

  await expect(page.getByRole('heading', { name: /Seleccionar variante/i })).toBeVisible();
  const colorOptions = page.locator('.drawer-content .color-selector .color-btn');
  if ((await colorOptions.count()) > 0) {
    await colorOptions.first().click();
  }
  const sizeOptions = page.locator('.drawer-content .size-selector .size-btn');
  if ((await sizeOptions.count()) > 0) {
    await sizeOptions.first().click();
  }
  const variantQuantityInput = page.locator('#variantQuantity');
  await variantQuantityInput.fill('1');

  const addToCartButton = page.getByRole('button', { name: /Agregar al carrito/i });
  await expect(addToCartButton).toBeEnabled();
  await addToCartButton.click();

  await expect(page.locator('.pos-toast')).toContainText(/Producto agregado al carrito/i);
  await page.getByRole('button', { name: /Cobrar/i }).click();
  await expect(page.getByRole('heading', { name: /Cobrar venta/i })).toBeVisible();

  await page.locator('#amountPaid').fill('9999');
  await page.getByRole('button', { name: /Confirmar pago/i }).click();

  await expect
    .poll(
      async () => {
        const processingVisible = await page.getByRole('button', { name: /Procesando/i }).count();
        const drawerVisible = await page.getByRole('heading', { name: /Cobrar venta/i }).count();
        if (processingVisible === 0 && drawerVisible === 0) return 'closed';
        if (processingVisible === 0 && drawerVisible > 0) return 'idle-in-drawer';
        return 'processing';
      },
      {
        timeout: 40000,
        intervals: [1000, 1500, 2000]
      }
    )
    .not.toBe('processing');

  await expect(page.locator('.pos-toast')).toContainText(
    /Venta creada|Venta guardada|demoro demasiado|Error|cerrado manualmente/i
  );

  expect(pageErrors, `Page JS errors: ${pageErrors.join(' | ')}`).toEqual([]);
});
