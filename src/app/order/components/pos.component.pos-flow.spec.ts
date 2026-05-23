// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@angular/compiler';
import { FormBuilder } from '@angular/forms';
import { NEVER, Observable, of } from 'rxjs';
import { PosComponent } from './pos.component';

type MockOrderService = {
  createOrder: ReturnType<typeof vi.fn>;
  listOrders: ReturnType<typeof vi.fn>;
  getVariantStock: ReturnType<typeof vi.fn>;
  getRemoteStock: ReturnType<typeof vi.fn>;
};

function buildComponent(options?: {
  createOrder$?: Observable<any>;
  listOrders$?: Observable<any>;
  getVariantStock$?: Observable<any>;
  getRemoteStock$?: Observable<any>;
}) {
  const productService = {
    getProducts: vi.fn(() => of({ data: [] }))
  };
  const storeService = {
    getStores: vi.fn(() => of([]))
  };
  const orderService: MockOrderService = {
    createOrder: vi.fn(() => options?.createOrder$ ?? of({ data: { code: 'ORD-TEST-001' } })),
    listOrders: vi.fn(() => options?.listOrders$ ?? of({ data: [] })),
    getVariantStock: vi.fn(() => options?.getVariantStock$ ?? of({ data: [] })),
    getRemoteStock: vi.fn(() => options?.getRemoteStock$ ?? of({ data: [] }))
  };
  const authService = {
    getCurrentUser: vi.fn(() => ({ id: 1 }))
  };
  const paymentMethodService = {
    getPaymentMethods: vi.fn(() => of([]))
  };
  const cdr = {
    markForCheck: vi.fn()
  };

  const component = new PosComponent(
    new FormBuilder(),
    productService as any,
    storeService as any,
    orderService as any,
    authService as any,
    paymentMethodService as any,
    cdr as any
  );

  component.initializeForms();
  component.selectedStoreId = 1;
  component.showPaymentDrawer = true;
  component.orderForm.patchValue({
    sourceStoreId: 1,
    clientName: 'Cliente POS'
  });

  component.cart = [
    {
      productId: 10,
      productName: 'Producto test',
      variantId: 124,
      sku: 'SKU-124',
      colorName: 'Azul',
      sizeName: 'L',
      price: 20,
      quantity: 1,
      subtotal: 20,
      availableStock: 10,
      imageUrl: null
    }
  ];

  component.updateTotals();
  component.paymentForm.patchValue({ amountPaid: component.total });

  return { component, orderService };
}

describe('PosComponent payment flow diagnostics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('completes payment and exits loading when createOrder succeeds', () => {
    const { component, orderService } = buildComponent();

    component.submitPayment();

    expect(orderService.createOrder).toHaveBeenCalledTimes(1);
    expect(component.loading).toBe(false);
    expect(component.showPaymentDrawer).toBe(false);
    expect(component.cart.length).toBe(0);
    expect(component.toast?.type).toBe('success');
    expect(component.toast?.message).toContain('Venta creada');
  });

  it('includes client address in POS note when provided', () => {
    const { component, orderService } = buildComponent();
    component.orderForm.patchValue({ clientAddress: 'Av. Siempre Viva 742' });

    component.submitPayment();

    expect(orderService.createOrder).toHaveBeenCalledTimes(1);
    const submittedOrder = orderService.createOrder.mock.calls[0]?.[0];
    expect(String(submittedOrder?.note || '')).toContain('Direccion cliente: Av. Siempre Viva 742');
  });

  it('does not stay stuck in loading when request hangs and recovery fails', async () => {
    const { component } = buildComponent({
      createOrder$: NEVER,
      listOrders$: NEVER
    });

    component.submitPayment();

    expect(component.loading).toBe(true);

    await vi.advanceTimersByTimeAsync(20000);
    await Promise.resolve();

    expect(component.loading).toBe(false);
    expect(component.toast?.type).toBe('error');
    expect(component.toast?.message).toContain('demoro demasiado');
  });

  it('allows manual cancel while loading and clears the blocked state', () => {
    const { component } = buildComponent({
      createOrder$: NEVER
    });

    component.submitPayment();
    expect(component.loading).toBe(true);

    component.closePaymentDrawer();

    expect(component.loading).toBe(false);
    expect(component.showPaymentDrawer).toBe(false);
    expect(component.toast?.type).toBe('info');
    expect(component.toast?.message).toContain('cerrado manualmente');
  });

  it('allows selecting a no-stock variant and loads remote stock suggestions', () => {
    const { component, orderService } = buildComponent({
      getRemoteStock$: of({
        data: [
          {
            storeId: 2,
            storeName: 'Tienda 2',
            availableStock: 5,
            reservedStock: 0
          }
        ]
      })
    });

    component.openVariantSelector({
      id: 50,
      name: 'Polera test',
      categoryName: 'Ropa',
      imageUrl: null,
      minPrice: 39.9,
      totalAvailableStock: 0,
      totalReservedStock: 0,
      variants: [
        {
          id: 700,
          sku: 'SKU-700',
          barcode: null,
          colorName: 'Negro',
          colorHex: '#000000',
          sizeName: 'M',
          price: 39.9,
          imageUrl: null,
          availableStock: 0,
          reservedStock: 0
        }
      ]
    } as any);

    component.selectSize('M');
    component.setVariantQuantity(1);

    expect(orderService.getRemoteStock).toHaveBeenCalledWith(700, 1);
    expect(component.remoteStockSuggestions.length).toBe(1);
    expect(component.isRemoteStoreSelected(2)).toBe(true);
    expect(component.canAddSelectedVariant()).toBe(true);
  });

  it('starts drawer quantity at 0 when opening variant selector', () => {
    const { component } = buildComponent();

    component.openVariantSelector({
      id: 66,
      name: 'Polo base',
      categoryName: 'Ropa',
      imageUrl: null,
      minPrice: 20,
      totalAvailableStock: 10,
      totalReservedStock: 0,
      variants: [
        {
          id: 6601,
          sku: 'POLO-ROJO-L',
          barcode: null,
          colorName: 'rojo',
          colorHex: '#ff0000',
          sizeName: 'L',
          price: 20,
          imageUrl: null,
          availableStock: 10,
          reservedStock: 0
        }
      ]
    } as any);

    expect(component.variantQuantity).toBe(0);
    expect(component.canAddSelectedVariant()).toBe(false);
  });

  it('resets quantity to 0 when changing color in the same drawer', () => {
    const { component } = buildComponent();

    component.openVariantSelector({
      id: 67,
      name: 'Polo color mix',
      categoryName: 'Ropa',
      imageUrl: null,
      minPrice: 20,
      totalAvailableStock: 8,
      totalReservedStock: 0,
      variants: [
        {
          id: 6701,
          sku: 'POLO-ROJO-L',
          barcode: null,
          colorName: 'rojo',
          colorHex: '#ff0000',
          sizeName: 'L',
          price: 20,
          imageUrl: null,
          availableStock: 5,
          reservedStock: 0
        },
        {
          id: 6702,
          sku: 'POLO-AZUL-L',
          barcode: null,
          colorName: 'azul',
          colorHex: '#0000ff',
          sizeName: 'L',
          price: 20,
          imageUrl: null,
          availableStock: 3,
          reservedStock: 0
        }
      ]
    } as any);

    component.selectColor('rojo');
    component.selectSize('L');
    component.setVariantQuantity(2);
    expect(component.variantQuantity).toBe(2);

    component.selectColor('azul');
    expect(component.variantQuantity).toBe(0);
  });

  it('keeps previously added variant when adding another color/size variant', () => {
    const { component } = buildComponent();

    component.cart = [];
    component.updateTotals();

    const product = {
      id: 77,
      name: 'Polo cuello camisero',
      categoryName: 'Ropa',
      imageUrl: null,
      minPrice: 34,
      totalAvailableStock: 64,
      totalReservedStock: 0,
      variants: [
        {
          id: 7701,
          sku: 'PROD-AZUL-L',
          barcode: null,
          colorName: 'azul',
          colorHex: '#1d4ed8',
          sizeName: 'L',
          price: 34,
          imageUrl: null,
          availableStock: 60,
          reservedStock: 10
        },
        {
          id: 7702,
          sku: 'PROD-VERDE-L',
          barcode: null,
          colorName: 'verde',
          colorHex: '#16a34a',
          sizeName: 'L',
          price: 34,
          imageUrl: null,
          availableStock: 4,
          reservedStock: 12
        }
      ]
    } as any;

    component.openVariantSelector(product);
    component.selectColor('azul');
    component.selectSize('L');
    component.setVariantQuantity(1);
    component.addVariantToCart();

    component.openVariantSelector(product);
    component.selectColor('verde');
    component.selectSize('L');
    component.setVariantQuantity(1);
    component.addVariantToCart();

    expect(component.cart.length).toBe(2);
    const skus = component.cart.map((item) => item.sku).sort();
    expect(skus).toEqual(['PROD-AZUL-L', 'PROD-VERDE-L']);
  });

  it('keeps both variants when backend sends duplicated variant id across colors', () => {
    const { component } = buildComponent();

    component.cart = [];
    component.updateTotals();

    const product = {
      id: 99,
      name: 'Producto inconsistente',
      categoryName: 'Ropa',
      imageUrl: null,
      minPrice: 34,
      totalAvailableStock: 10,
      totalReservedStock: 0,
      variants: [
        {
          id: 9999,
          sku: 'DUP-ROJO-L',
          barcode: null,
          colorName: 'rojo',
          colorHex: '#ff0000',
          sizeName: 'L',
          price: 34,
          imageUrl: null,
          availableStock: 5,
          reservedStock: 0
        },
        {
          id: 9999,
          sku: 'DUP-AZUL-L',
          barcode: null,
          colorName: 'azul',
          colorHex: '#0000ff',
          sizeName: 'L',
          price: 34,
          imageUrl: null,
          availableStock: 5,
          reservedStock: 0
        }
      ]
    } as any;

    component.openVariantSelector(product);
    component.selectColor('rojo');
    component.selectSize('L');
    component.setVariantQuantity(1);
    component.addVariantToCart();

    component.openVariantSelector(product);
    component.selectColor('azul');
    component.selectSize('L');
    component.setVariantQuantity(1);
    component.addVariantToCart();

    expect(component.cart.length).toBe(2);
    const skus = component.cart.map((item) => item.sku).sort();
    expect(skus).toEqual(['DUP-AZUL-L', 'DUP-ROJO-L']);
  });

  it('adds all size-derived variants in one action instead of only the last selected size', () => {
    const { component } = buildComponent();

    component.cart = [];
    component.updateTotals();

    component.openVariantSelector({
      id: 88,
      name: 'Pack talla',
      categoryName: 'Ropa',
      imageUrl: null,
      minPrice: 49.9,
      totalAvailableStock: 12,
      totalReservedStock: 0,
      variants: [
        {
          id: 8801,
          sku: 'PK-XS',
          barcode: null,
          colorName: 'Sin color',
          colorHex: null,
          sizeName: 'XS',
          price: 49.9,
          imageUrl: null,
          availableStock: 5,
          reservedStock: 0
        },
        {
          id: 8802,
          sku: 'PK-M',
          barcode: null,
          colorName: 'Sin color',
          colorHex: null,
          sizeName: 'M',
          price: 49.9,
          imageUrl: null,
          availableStock: 4,
          reservedStock: 0
        },
        {
          id: 8803,
          sku: 'PK-L',
          barcode: null,
          colorName: 'Sin color',
          colorHex: null,
          sizeName: 'L',
          price: 49.9,
          imageUrl: null,
          availableStock: 0,
          reservedStock: 0
        }
      ]
    } as any);

    component.selectSize('M');
    component.setVariantQuantity(1);
    component.addVariantToCart();

    const addedVariantIds = component.cart.map((item) => item.variantId).sort((a, b) => a - b);
    expect(addedVariantIds).toEqual([8801, 8802]);
    expect(component.cart.find((item) => item.variantId === 8803)).toBeUndefined();
  });
});

describe('PosComponent drawer button interactions', () => {
  function buildUiProduct() {
    return {
      id: 201,
      name: 'Polo UI test',
      categoryName: 'Ropa',
      imageUrl: null,
      minPrice: 34,
      totalAvailableStock: 9,
      totalReservedStock: 0,
      variants: [
        {
          id: 20101,
          sku: 'UI-ROJO-L',
          barcode: null,
          colorName: 'rojo',
          colorHex: '#ff0000',
          sizeName: 'L',
          price: 34,
          imageUrl: null,
          availableStock: 5,
          reservedStock: 0
        },
        {
          id: 20102,
          sku: 'UI-AZUL-L',
          barcode: null,
          colorName: 'azul',
          colorHex: '#0000ff',
          sizeName: 'L',
          price: 34,
          imageUrl: null,
          availableStock: 4,
          reservedStock: 0
        }
      ]
    } as any;
  }

  function clickProductCard(component: PosComponent, product: any) {
    component.openVariantSelector(product);
  }

  function clickColorButton(component: PosComponent, colorName: string) {
    component.selectColor(colorName);
  }

  function clickSizeButton(component: PosComponent, sizeName: string) {
    component.selectSize(sizeName);
  }

  function clickPlusQuantityButton(component: PosComponent) {
    component.setVariantQuantity(component.variantQuantity + 1);
  }

  function clickAddToCartButton(component: PosComponent) {
    component.addVariantToCart();
  }

  it('resets quantity to 0 when switching color button in the same drawer', () => {
    const { component } = buildComponent();
    const product = buildUiProduct();

    clickProductCard(component, product);
    clickColorButton(component, 'rojo');
    clickSizeButton(component, 'L');
    clickPlusQuantityButton(component);
    clickPlusQuantityButton(component);
    expect(component.variantQuantity).toBe(2);

    clickColorButton(component, 'azul');
    expect(component.variantQuantity).toBe(0);
  });

  it('keeps previous variant in cart when adding a second variant via drawer buttons', () => {
    const { component } = buildComponent();
    const product = buildUiProduct();

    component.cart = [];
    component.updateTotals();

    clickProductCard(component, product);
    clickColorButton(component, 'rojo');
    clickSizeButton(component, 'L');
    clickPlusQuantityButton(component);
    expect(component.canAddSelectedVariant()).toBe(true);
    clickAddToCartButton(component);
    expect(component.cart.length).toBe(1);

    clickProductCard(component, product);
    clickColorButton(component, 'azul');
    clickSizeButton(component, 'L');
    clickPlusQuantityButton(component);
    expect(component.canAddSelectedVariant()).toBe(true);
    clickAddToCartButton(component);

    expect(component.cart.length).toBe(2);
    const skus = component.cart.map((item) => item.sku).sort();
    expect(skus).toEqual(['UI-AZUL-L', 'UI-ROJO-L']);
  });

  it('adds two variants with quantity 2 each when selected in the same open drawer', () => {
    const { component } = buildComponent();
    const product = buildUiProduct();

    component.cart = [];
    component.updateTotals();

    clickProductCard(component, product);

    clickColorButton(component, 'rojo');
    clickSizeButton(component, 'L');
    clickPlusQuantityButton(component);
    clickPlusQuantityButton(component);
    expect(component.variantQuantity).toBe(2);

    clickColorButton(component, 'azul');
    expect(component.variantQuantity).toBe(0);
    clickSizeButton(component, 'L');
    clickPlusQuantityButton(component);
    clickPlusQuantityButton(component);
    expect(component.variantQuantity).toBe(2);

    expect(component.canAddSelectedVariant()).toBe(true);
    clickAddToCartButton(component);

    expect(component.cart.length).toBe(2);
    const bySku = new Map(component.cart.map((item) => [item.sku, item]));
    expect(bySku.get('UI-ROJO-L')?.quantity).toBe(2);
    expect(bySku.get('UI-AZUL-L')?.quantity).toBe(2);
  });
});
