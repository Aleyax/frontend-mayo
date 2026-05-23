import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { finalize, firstValueFrom, timeout } from 'rxjs';
import { ProductService } from '../../product/services/product.service';
import { StoreService } from '../../store/services/store.service';
import { OrderService } from '../services/order.service';
import { AuthService } from '../../auth/auth.service';
import { PaymentMethodService } from '../../payment-method/services/payment-method.service';

interface PosVariant {
  id: number;
  sku: string;
  barcode?: string | null;
  colorName: string;
  colorHex?: string | null;
  sizeName: string;
  price: number;
  imageUrl?: string | null;
  availableStock: number;
  reservedStock: number;
}

interface PosProduct {
  id: number;
  name: string;
  categoryName: string;
  imageUrl?: string | null;
  variants: PosVariant[];
  minPrice: number;
  totalAvailableStock: number;
  totalReservedStock: number;
}

interface CartItem {
  productId: number;
  productName: string;
  variantId: number;
  sku: string;
  colorName: string;
  sizeName: string;
  price: number;
  imageUrl?: string | null;
  quantity: number;
  subtotal: number;
  availableStock: number;
  fulfillmentStoreId?: number | null;
  fulfillmentStoreName?: string | null;
}

interface RemoteStockOption {
  storeId: number;
  storeName: string;
  storeType?: string;
  availableStock: number;
  reservedStock: number;
}

interface CartUpsertResult {
  success: boolean;
  message?: string;
  fulfillmentStoreId?: number | null;
  fulfillmentStoreName?: string | null;
}

type ToastType = 'success' | 'error' | 'info';

@Component({
  selector: 'app-pos',
  templateUrl: './pos.component.html',
  styleUrls: [
    './pos.component.base-catalog.css',
    './pos.component.cart.css',
    './pos.component.variant-drawer.css',
    './pos.component.payment-modal.css',
    './pos.component.fulfillment-theme.css',
    './pos.component.theme-overrides.css',
  ],
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule]
})
export class PosComponent implements OnInit {
  private readonly defaultPaymentMethods = ['Efectivo', 'Tarjeta', 'Yape', 'Plin', 'Transferencia', 'Nequi'];
  cart: CartItem[] = [];
  products: PosProduct[] = [];
  filteredProducts: PosProduct[] = [];
  stores: any[] = [];
  categories: string[] = ['Todos'];

  selectedCategory = 'Todos';
  searchTerm = '';
  selectedStoreId: number | null = null;

  subtotal = 0;
  tax = 0;
  total = 0;
  readonly taxRate = 0.18;
  applyIgv = false;

  showVariantSelector = false;
  showPaymentDrawer = false;
  showSalesHistory = false;
  showMobileCart = false;

  selectedProductForVariant: PosProduct | null = null;
  selectedVariant: PosVariant | null = null;
  selectedColor = '';
  selectedSize = '';
  variantQuantity = 0;
  remoteStockSuggestions: RemoteStockOption[] = [];
  loadingRemoteStock = false;
  selectedRemoteStoreId: number | null = null;
  remoteFulfillmentStoreId: number | null = null;
  private drawerQuantityByVariant = new Map<number, number>();
  private remoteStockSuggestionsByVariant = new Map<number, RemoteStockOption[]>();
  private loadingRemoteStockVariantIds = new Set<number>();

  paymentMethods = [...this.defaultPaymentMethods];
  selectedPaymentMethod = 'Efectivo';
  paymentForm!: FormGroup;
  orderForm!: FormGroup;
  change = 0;

  salesHistory: any[] = [];
  loading = false;
  toast: { message: string; type: ToastType } | null = null;
  private toastTimeout?: number;
  private submitGuardTimeout?: number;
  private hardStopTimeout?: number;
  private paymentRequestCounter = 0;
  private activePaymentRequestId: number | null = null;
  private remoteStockRequestId = 0;
  private remoteStockActiveRequestByVariant = new Map<number, number>();

  Math = Math;

  get cartItemsCount(): number {
    return this.cart.reduce((totalItems, item) => totalItems + Number(item.quantity || 0), 0);
  }

  constructor(
    private fb: FormBuilder,
    private productService: ProductService,
    private storeService: StoreService,
    private orderService: OrderService,
    private authService: AuthService,
    private paymentMethodService: PaymentMethodService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.initializeForms();
    this.loadPaymentMethods();
    this.loadProducts();
    this.loadStores();
    this.loadSalesHistory();
  }

  initializeForms() {
    this.orderForm = this.fb.group({
      sourceStoreId: ['', Validators.required],
      clientName: [''],
      clientEmail: ['', [Validators.email]],
      clientPhone: [''],
      note: ['']
    });

    this.paymentForm = this.fb.group({
      method: ['Efectivo', Validators.required],
      amountPaid: [0, [Validators.required, Validators.min(0)]]
    });
  }

  loadProducts() {
    this.productService.getProducts({ skip: 1, take: 100, isActive: true }).subscribe({
      next: (response: any) => {
        const rawProducts = Array.isArray(response?.data)
          ? response.data
          : (Array.isArray(response?.value)
            ? response.value
            : (Array.isArray(response?.result)
              ? response.result
              : (Array.isArray(response) ? response : [])));
        this.products = rawProducts.map((product: any) => this.mapProduct(product));
        this.selectedCategory = 'Todos';
        this.searchTerm = '';
        this.refreshCategories();
        this.applyFilters();
        this.loadAvailableStockForStore();
        this.cdr.markForCheck();
      },
      error: () => {
        this.showToast('No se pudo cargar el catalogo de productos.', 'error');
        this.cdr.markForCheck();
      }
    });
  }

  loadStores() {
    this.storeService.getStores({ skip: 1, take: 100 }).subscribe({
      next: (storesResponse: any) => {
        const stores = Array.isArray(storesResponse)
          ? storesResponse
          : (Array.isArray(storesResponse?.value)
            ? storesResponse.value
            : (Array.isArray(storesResponse?.result) ? storesResponse.result : []));
        this.stores = stores;
        if (this.stores.length > 0) {
          this.selectedStoreId = Number(this.stores[0].id);
          this.orderForm.patchValue({ sourceStoreId: this.selectedStoreId });
          this.loadAvailableStockForStore();
          this.loadSalesHistory();
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.showToast('No se pudieron cargar las tiendas.', 'error');
        this.cdr.markForCheck();
      }
    });
  }

  onStoreChange() {
    const storeId = Number(this.selectedStoreId);
    if (!Number.isNaN(storeId) && storeId > 0) {
      this.selectedStoreId = storeId;
      this.orderForm.patchValue({ sourceStoreId: storeId });
      this.cart = [];
      this.remoteFulfillmentStoreId = null;
      this.remoteStockSuggestionsByVariant.clear();
      this.loadingRemoteStockVariantIds.clear();
      this.remoteStockActiveRequestByVariant.clear();
      this.updateTotals();
      this.clearRemoteStockSuggestions();
      this.loadAvailableStockForStore();
      this.loadSalesHistory();
      this.closeMobileCart();
      this.showToast('Tienda actualizada. El carrito fue reiniciado.', 'info');
      this.cdr.markForCheck();
    }
  }

  loadSalesHistory() {
    const params: any = { page: 1, limit: 10 };
    if (this.selectedStoreId) {
      params.storeId = this.selectedStoreId;
    }

    this.orderService.listOrders(params).subscribe({
      next: (response: any) => {
        const orders = response?.data || [];
        this.salesHistory = orders.map((order: any) => ({
          code: order.code || `ORD-${order.id}`,
          total: Number(order.total || 0),
          items: Array.isArray(order.items)
            ? order.items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0)
            : 0,
          paymentMethod: this.parsePaymentMethod(order.note),
          timestamp: order.createdAt ? new Date(order.createdAt) : new Date()
        }));
        this.cdr.markForCheck();
      },
      error: () => {
        this.salesHistory = [];
        this.cdr.markForCheck();
      }
    });
  }

  loadAvailableStockForStore() {
    if (!this.selectedStoreId || this.products.length === 0) {
      return;
    }

    const variantIds = this.products.flatMap((product) => product.variants.map((variant) => variant.id));
    if (variantIds.length === 0) {
      return;
    }

    this.orderService.getVariantStock(this.selectedStoreId, variantIds).subscribe({
      next: (response: any) => {
        const stockMap = new Map<number, any>((response.data || []).map((stock: any) => [stock.variantId, stock]));
        this.products = this.products.map((product) => this.applyStockToProduct(product, stockMap));
        this.applyFilters();
        this.cdr.markForCheck();
      },
      error: () => {
        const emptyStock = new Map<number, any>();
        this.products = this.products.map((product) => this.applyStockToProduct(product, emptyStock));
        this.applyFilters();
        this.cdr.markForCheck();
      }
    });
  }

  filterByCategory(category: string) {
    this.selectedCategory = category;
    this.applyFilters();
  }

  filterProducts() {
    this.applyFilters();
  }

  applyFilters() {
    const term = this.searchTerm.trim().toLowerCase();
    this.filteredProducts = this.products.filter((product) => {
      const matchesCategory = this.selectedCategory === 'Todos' || product.categoryName === this.selectedCategory;
      const matchesSearch =
        !term ||
        product.name.toLowerCase().includes(term) ||
        product.categoryName.toLowerCase().includes(term) ||
        product.variants.some((variant) =>
          [variant.sku, variant.barcode || '', variant.colorName, variant.sizeName]
            .some((value) => value.toLowerCase().includes(term))
        );

      return matchesCategory && matchesSearch;
    });
  }

  openVariantSelector(product: PosProduct) {
    this.closeMobileCart();
    this.selectedProductForVariant = product;
    this.selectedColor = product.variants[0]?.colorName || '';
    this.selectedSize = '';
    this.variantQuantity = 0;
    this.drawerQuantityByVariant.clear();
    this.syncSelectedVariant();
    this.showVariantSelector = true;
  }

  closeVariantSelector() {
    this.showVariantSelector = false;
    this.selectedProductForVariant = null;
    this.selectedVariant = null;
    this.selectedColor = '';
    this.selectedSize = '';
    this.variantQuantity = 0;
    this.drawerQuantityByVariant.clear();
    this.clearRemoteStockSuggestions();
  }

  selectColor(colorName: string) {
    const colorChanged = this.selectedColor !== colorName;
    this.selectedColor = colorName;
    this.selectedSize = '';
    if (colorChanged) {
      this.variantQuantity = 0;
    }
    this.syncSelectedVariant();
  }

  selectSize(sizeName: string) {
    const sizeChanged = this.selectedSize !== sizeName;
    this.selectedSize = sizeName;
    if (sizeChanged) {
      this.variantQuantity = 0;
    }
    this.syncSelectedVariant();
  }

  setVariantQuantity(quantity: number) {
    const normalized = Math.floor(Number(quantity) || 0);
    const max = Math.max(0, this.getSelectedVariantEffectiveStock());
    const safeQuantity = Math.min(Math.max(0, normalized), max);
    this.variantQuantity = safeQuantity;

    const selectedVariantId = this.parsePositiveInt(this.selectedVariant?.id);
    if (!selectedVariantId) {
      return;
    }

    if (safeQuantity > 0) {
      this.drawerQuantityByVariant.set(selectedVariantId, safeQuantity);
    } else {
      this.drawerQuantityByVariant.delete(selectedVariantId);
    }
  }

  addVariantToCart() {
    if (!this.selectedProductForVariant || !this.selectedVariant) {
      this.showToast('Selecciona color y talla antes de agregar.', 'error');
      return;
    }

    const selectedProduct = this.selectedProductForVariant;
    const pendingSelections = this.collectDrawerPendingSelections(selectedProduct);
    if (pendingSelections.length === 0 && this.variantQuantity <= 0) {
      this.showToast('La cantidad debe ser mayor a 0.', 'error');
      return;
    }

    if (this.shouldAddAllDerivedSizeVariants(selectedProduct)) {
      this.addAllDerivedSizeVariantsToCart(selectedProduct);
      return;
    }

    const selectionsToAdd = pendingSelections.length
      ? pendingSelections
      : [{
          variant: this.selectedVariant,
          quantity: this.variantQuantity
        }];

    const failedMessages: string[] = [];
    let addedCount = 0;
    let usedRemoteStoreId: number | null = null;
    let usedRemoteStoreName: string | null = null;

    for (const selection of selectionsToAdd) {
      const remoteStock = selection.variant.id === this.selectedVariant.id && this.selectedVariant.availableStock <= 0
        ? this.getSelectedRemoteStockOption()
        : null;

      const result = this.upsertVariantInCart(
        selectedProduct,
        selection.variant,
        selection.quantity,
        remoteStock
      );

      if (!result.success) {
        if (result.message) {
          failedMessages.push(result.message);
        }
        continue;
      }

      addedCount += 1;
      usedRemoteStoreId = result.fulfillmentStoreId ?? usedRemoteStoreId;
      usedRemoteStoreName = result.fulfillmentStoreName ?? usedRemoteStoreName;
    }

    if (addedCount === 0) {
      this.showToast(failedMessages[0] || 'No se pudo agregar ninguna variante al carrito.', 'error');
      return;
    }

    this.syncRemoteFulfillmentFromCart();
    this.updateTotals();
    this.closeVariantSelector();
    if (usedRemoteStoreId) {
      this.showToast(`Producto agregado con stock remoto de ${usedRemoteStoreName}.`, 'success');
      return;
    }

    if (failedMessages.length > 0) {
      this.showToast(`Se agregaron ${addedCount} variante(s). Algunas no se pudieron agregar por stock.`, 'success');
      return;
    }

    this.showToast(
      addedCount > 1
        ? `Se agregaron ${addedCount} variantes al carrito.`
        : 'Producto agregado al carrito.',
      'success'
    );
  }

  openPaymentDrawer() {
    if (this.cart.length === 0) {
      this.showToast('El carrito esta vacio.', 'error');
      return;
    }

    this.selectedPaymentMethod = this.paymentMethods[0] || this.defaultPaymentMethods[0];
    this.paymentForm.patchValue({ method: this.selectedPaymentMethod, amountPaid: this.total });
    this.calculateChange();
    this.closeMobileCart();
    this.showPaymentDrawer = true;
  }

  closePaymentDrawer() {
    if (this.loading) {
      this.finishPaymentState();
      this.showPaymentDrawer = false;
      this.showToast('Cobro en proceso cerrado manualmente. Revisa el historial de ventas.', 'info');
      return;
    }
    this.showPaymentDrawer = false;
  }

  selectPaymentMethod(method: string) {
    this.selectedPaymentMethod = method;
    this.paymentForm.patchValue({ method });
    if (method !== 'Efectivo') {
      this.paymentForm.patchValue({ amountPaid: this.total });
      this.change = 0;
    }
  }

  calculateChange() {
    const amountPaid = Number(this.paymentForm.get('amountPaid')?.value || 0);
    this.change = Math.max(0, amountPaid - this.total);
  }

  async submitPayment() {
    if (this.loading) {
      return;
    }

    if (this.cart.length === 0) {
      this.showToast('Agrega productos antes de cobrar.', 'error');
      return;
    }

    if (this.orderForm.invalid) {
      this.orderForm.markAllAsTouched();
      this.showToast('Revisa los datos del cliente antes de continuar.', 'error');
      return;
    }

    const sourceStoreId = Number(this.selectedStoreId);
    if (!sourceStoreId || Number.isNaN(sourceStoreId)) {
      this.showToast('Selecciona una tienda origen.', 'error');
      return;
    }

    const fulfillmentStoreId = this.remoteFulfillmentStoreId || sourceStoreId;
    if (fulfillmentStoreId !== sourceStoreId) {
      const stockValidation = await this.validateCartStockForFulfillmentStore(fulfillmentStoreId);
      if (!stockValidation.ok) {
        this.showToast(stockValidation.message || 'No hay stock suficiente en la tienda recomendada.', 'error');
        return;
      }
    }

    if (this.selectedPaymentMethod === 'Efectivo') {
      const amountPaid = Number(this.paymentForm.get('amountPaid')?.value || 0);
      if (amountPaid < this.total) {
        this.showToast('El monto pagado no cubre el total.', 'error');
        return;
      }
    }

    this.loading = true;
    const requestId = ++this.paymentRequestCounter;
    this.activePaymentRequestId = requestId;
    const paymentRef = this.createPaymentReference();

    if (this.submitGuardTimeout) {
      window.clearTimeout(this.submitGuardTimeout);
    }
    if (this.hardStopTimeout) {
      window.clearTimeout(this.hardStopTimeout);
    }
    this.submitGuardTimeout = window.setTimeout(() => {
      if (this.loading && this.activePaymentRequestId === requestId) {
        this.tryRecoverOrderAfterTimeout(paymentRef, sourceStoreId, requestId);
      }
    }, 12000);
    this.hardStopTimeout = window.setTimeout(() => {
      if (this.loading && this.activePaymentRequestId === requestId) {
        this.failPaymentRequest('La operacion tardo demasiado. Valida el historial y vuelve a intentar.');
      }
    }, 30000);
    this.cdr.markForCheck();

    const currentUser = this.authService.getCurrentUser();
    const orderData: any = {
      sourceStoreId,
      fulfillmentStoreId,
      applyIgv: this.applyIgv,
      clientName: this.orderForm.get('clientName')?.value || 'Cliente POS',
      clientEmail: this.orderForm.get('clientEmail')?.value || undefined,
      clientPhone: this.orderForm.get('clientPhone')?.value || undefined,
      note: this.buildOrderNote(paymentRef),
      items: this.cart.map((item) => ({
        variantId: Number(item.variantId),
        quantity: Number(item.quantity),
        unitPrice: Number(item.price)
      }))
    };

    const sellerUserId = Number(currentUser?.id);
    if (!Number.isNaN(sellerUserId) && sellerUserId > 0) {
      orderData.sellerUserId = sellerUserId;
    }

    this.orderService.createOrder(orderData)
      .pipe(
        timeout(20000),
        finalize(() => {
          if (this.activePaymentRequestId === requestId && this.submitGuardTimeout) {
            window.clearTimeout(this.submitGuardTimeout);
            this.submitGuardTimeout = undefined;
          }
        })
      )
      .subscribe({
        next: (response: any) => {
          if (this.activePaymentRequestId !== requestId) {
            return;
          }
          try {
            const order = response.data || response;
            const orderCode = order?.code || 'VENTA';
            this.completePaymentRequest(orderCode, false);
          } catch (handlerError) {
            console.error('POS completion error after createOrder success', handlerError);
            this.failPaymentRequest('La venta se guardo, pero fallo el cierre automatico. Revisa historial.');
          }
        },
        error: (error: any) => {
          if (this.activePaymentRequestId !== requestId) {
            return;
          }
          const apiError =
            error?.name === 'TimeoutError'
              ? 'La solicitud demoro demasiado. Estamos validando si la orden ya se guardo.'
              : (
                error?.error?.error ||
                error?.error?.message ||
                error?.message ||
                'Error al crear la venta.'
              );
          if (error?.name === 'TimeoutError') {
            this.tryRecoverOrderAfterTimeout(paymentRef, sourceStoreId, requestId, apiError);
            return;
          }
          this.failPaymentRequest(apiError);
        }
      });
  }

  removeFromCart(index: number) {
    this.cart.splice(index, 1);
    this.syncRemoteFulfillmentFromCart();
    this.updateTotals();
  }

  updateQuantity(item: CartItem, newQuantity: number) {
    const quantity = Number(newQuantity);
    if (quantity < 1) {
      this.removeFromCart(this.cart.indexOf(item));
      return;
    }

    if (quantity > item.availableStock) {
      this.showToast(`Stock disponible: ${item.availableStock}`, 'error');
      return;
    }

    item.quantity = quantity;
    item.subtotal = item.quantity * item.price;
    this.updateTotals();
  }

  updateTotals() {
    this.subtotal = this.cart.reduce((sum, item) => sum + item.subtotal, 0);
    this.tax = this.applyIgv ? this.subtotal * this.taxRate : 0;
    this.total = this.subtotal + this.tax;
    this.paymentForm?.patchValue({ amountPaid: this.total }, { emitEvent: false });
    this.calculateChange();
  }

  toggleIgvApplication(checked: boolean) {
    this.applyIgv = checked;
    this.updateTotals();
  }

  submitOrder() {
    this.openPaymentDrawer();
  }

  clearCart() {
    if (this.cart.length === 0) {
      return;
    }

    this.cart = [];
    this.remoteFulfillmentStoreId = null;
    this.updateTotals();
    this.showToast('Carrito vaciado.', 'info');
  }

  toggleSalesHistory() {
    this.closeMobileCart();
    this.showSalesHistory = !this.showSalesHistory;
  }

  toggleMobileCart() {
    this.showMobileCart = !this.showMobileCart;
  }

  closeMobileCart() {
    this.showMobileCart = false;
  }

  getUniqueColors(product: PosProduct | null): Array<{ name: string; hex?: string | null; stock: number }> {
    if (!product) return [];
    const colorMap = new Map<string, { name: string; hex?: string | null; stock: number }>();

    for (const variant of product.variants) {
      const current = colorMap.get(variant.colorName) || {
        name: variant.colorName,
        hex: variant.colorHex,
        stock: 0
      };
      current.stock += variant.availableStock;
      colorMap.set(variant.colorName, current);
    }

    return [...colorMap.values()];
  }

  getSizesForSelectedColor(product: PosProduct | null): PosVariant[] {
    if (!product || !this.selectedColor) return [];
    return product.variants.filter((variant) => variant.colorName === this.selectedColor);
  }

  getProductStockLabel(product: PosProduct): string {
    return product.totalAvailableStock > 0 ? `Stock: ${product.totalAvailableStock}` : 'Sin stock';
  }

  getVariantStockChipLabel(variant: PosVariant): string {
    if (variant.availableStock > 0) {
      return `${variant.availableStock} disp.`;
    }

    if (this.loadingRemoteStockVariantIds.has(variant.id)) {
      return 'Sin stock en el local';
    }

    const cachedSuggestions = this.remoteStockSuggestionsByVariant.get(variant.id);
    if (!cachedSuggestions) {
      return 'Sin stock en el local';
    }

    return cachedSuggestions.length > 0 ? 'Sin stock en el local' : 'Sin stock';
  }

  getSelectedVariantStockStatus(): string {
    if (!this.selectedVariant) {
      return '';
    }

    if (this.selectedVariant.availableStock > 0) {
      return `Stock disponible: ${this.selectedVariant.availableStock} | Reservado: ${this.selectedVariant.reservedStock}`;
    }

    if (this.loadingRemoteStock) {
      return `Sin stock en ${this.getCurrentStoreName()}. Verificando otros locales...`;
    }

    const cachedSuggestions = this.remoteStockSuggestionsByVariant.get(this.selectedVariant.id);
    if (cachedSuggestions && cachedSuggestions.length > 0) {
      return `Sin stock en ${this.getCurrentStoreName()}. Disponible en otros locales.`;
    }

    if (cachedSuggestions && cachedSuggestions.length === 0) {
      return 'Sin stock.';
    }

    return `Sin stock en ${this.getCurrentStoreName()}.`;
  }

  private mapProduct(product: any): PosProduct {
    const variants: PosVariant[] = (product.variants || [])
      .map((variant: any): PosVariant | null => {
        const variantId = this.parsePositiveInt(variant?.variantId) ?? this.parsePositiveInt(variant?.id);
        if (!variantId) {
          return null;
        }
        return {
          id: variantId,
          sku: String(variant?.sku || ''),
          barcode: variant?.barcode || null,
          colorName: variant?.color?.name || 'Sin color',
          colorHex: variant?.color?.hex || null,
          sizeName: variant?.size?.name || 'Sin talla',
          price: Number(variant?.price || 0),
          imageUrl: variant?.imageUrl || null,
          availableStock: 0,
          reservedStock: 0
        };
      })
      .filter((variant: PosVariant | null): variant is PosVariant => variant !== null);

    const imageUrl = product.images?.[0]?.url || variants.find((variant) => variant.imageUrl)?.imageUrl || null;

    return {
      id: Number(product.id),
      name: product.name,
      categoryName: product.category?.name || 'Sin categoria',
      imageUrl,
      variants,
      minPrice: variants.length ? Math.min(...variants.map((variant) => variant.price)) : 0,
      totalAvailableStock: 0,
      totalReservedStock: 0
    };
  }

  private refreshCategories() {
    const categoryNames = this.products.map((product) => product.categoryName).filter(Boolean);
    this.categories = ['Todos', ...Array.from(new Set(categoryNames))];
  }

  getCartItemTrackKey(item: CartItem, index: number): string {
    return `${this.buildCartItemKey(item)}::${index}`;
  }

  private buildCartItemKey(item: {
    productId: number;
    variantId: number;
    sku: string;
    colorName: string;
    sizeName: string;
    fulfillmentStoreId?: number | null;
  }): string {
    const variantId = this.parsePositiveInt(item.variantId);
    const productId = this.parsePositiveInt(item.productId);
    const fulfillmentStoreId = this.parsePositiveInt(item.fulfillmentStoreId) ?? 0;

    const normalizedSku = String(item.sku || '').toUpperCase();
    const normalizedColor = String(item.colorName || '').toUpperCase();
    const normalizedSize = String(item.sizeName || '').toUpperCase();

    // Incluye siempre SKU/color/talla para evitar colisiones cuando el backend entregue IDs repetidos.
    return `variant:${variantId ?? 0}:product:${productId ?? 0}:sku:${normalizedSku}:color:${normalizedColor}:size:${normalizedSize}:remote:${fulfillmentStoreId}`;
  }

  private parsePositiveInt(value: unknown): number | null {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  }

  private applyStockToProduct(product: PosProduct, stockMap: Map<number, any>): PosProduct {
    const variants = product.variants.map((variant) => {
      const stock = stockMap.get(variant.id);
      return {
        ...variant,
        availableStock: stock?.availableStock ?? 0,
        reservedStock: stock?.reservedStock ?? 0
      };
    });

    return {
      ...product,
      variants,
      totalAvailableStock: variants.reduce((sum, variant) => sum + variant.availableStock, 0),
      totalReservedStock: variants.reduce((sum, variant) => sum + variant.reservedStock, 0)
    };
  }

  private syncSelectedVariant() {
    if (!this.selectedProductForVariant) {
      this.selectedVariant = null;
      this.clearRemoteStockSuggestions();
      return;
    }

    const variants = this.selectedProductForVariant.variants.filter((variant) => variant.colorName === this.selectedColor);
    this.selectedVariant =
      variants.find((variant) => variant.sizeName === this.selectedSize) ||
      variants.find((variant) => variant.availableStock > 0) ||
      variants[0] ||
      null;

    this.clearRemoteStockSuggestions();
    this.prefetchRemoteStockForVariants(variants);
    if (this.selectedVariant) {
      this.selectedSize = this.selectedVariant.sizeName;
      this.variantQuantity = this.getDrawerQuantityForVariant(this.selectedVariant.id);
      if (this.selectedVariant.availableStock <= 0) {
        this.loadRemoteStockRecommendations(this.selectedVariant.id);
      }
    }
  }

  selectRemoteStoreForVariant(storeId: number) {
    this.selectedRemoteStoreId = storeId;
    this.variantQuantity = Math.min(this.variantQuantity, Math.max(0, this.getSelectedVariantEffectiveStock()));
    this.syncDrawerQuantityForSelectedVariant();
    this.cdr.markForCheck();
  }

  isRemoteStoreSelected(storeId: number): boolean {
    return this.selectedRemoteStoreId === storeId;
  }

  canAddSelectedVariant(): boolean {
    if (!this.selectedProductForVariant || !this.selectedVariant) {
      return false;
    }

    if (this.shouldAddAllDerivedSizeVariants(this.selectedProductForVariant)) {
      if (this.variantQuantity <= 0) {
        return false;
      }
      return this.getSizesForSelectedColor(this.selectedProductForVariant).some((variant) => {
        const requested = Math.max(0, Math.floor(Number(this.variantQuantity) || 0));
        const stock = Math.max(0, Number(variant.availableStock || 0));
        return stock >= requested;
      });
    }

    const pendingSelections = this.collectDrawerPendingSelections(this.selectedProductForVariant);
    if (pendingSelections.length > 0) {
      return pendingSelections.some((selection) => {
        if (selection.variant.id === this.selectedVariant?.id) {
          return selection.quantity > 0 && this.getSelectedVariantEffectiveStock() >= selection.quantity;
        }
        const localStock = Math.max(0, Number(selection.variant.availableStock || 0));
        return selection.quantity > 0 && localStock >= selection.quantity;
      });
    }

    return this.variantQuantity > 0 && this.getSelectedVariantEffectiveStock() >= this.variantQuantity;
  }

  getSelectedVariantMaxQuantity(): number {
    return Math.max(0, this.getSelectedVariantEffectiveStock());
  }

  getCurrentStoreName(): string {
    return this.getStoreNameById(this.selectedStoreId) || 'la tienda actual';
  }

  getRemoteFulfillmentStoreLabel(): string {
    if (!this.remoteFulfillmentStoreId) {
      return '';
    }

    const storeName = this.getStoreNameById(this.remoteFulfillmentStoreId);
    return storeName ? `Abastecimiento remoto: ${storeName}` : `Abastecimiento remoto: tienda #${this.remoteFulfillmentStoreId}`;
  }

  private clearRemoteStockSuggestions() {
    this.remoteStockSuggestions = [];
    this.loadingRemoteStock = false;
    this.selectedRemoteStoreId = null;
  }

  private shouldAddAllDerivedSizeVariants(product: PosProduct): boolean {
    if (!product || product.variants.length <= 1) {
      return false;
    }

    const normalizedColorNames = new Set(
      product.variants.map((variant) => String(variant.colorName || '').trim().toLowerCase())
    );

    return normalizedColorNames.size === 1 && normalizedColorNames.has('sin color');
  }

  private collectDrawerPendingSelections(product: PosProduct): Array<{ variant: PosVariant; quantity: number }> {
    const selections: Array<{ variant: PosVariant; quantity: number }> = [];

    for (const variant of product.variants) {
      const variantId = this.parsePositiveInt(variant.id);
      if (!variantId) {
        continue;
      }

      const quantity = this.drawerQuantityByVariant.get(variantId) ?? 0;
      if (quantity <= 0) {
        continue;
      }

      selections.push({ variant, quantity });
    }

    return selections;
  }

  private getDrawerQuantityForVariant(variantId: number): number {
    const id = this.parsePositiveInt(variantId);
    if (!id) {
      return 0;
    }

    const savedQuantity = Number(this.drawerQuantityByVariant.get(id) || 0);
    const max = Math.max(0, this.getSelectedVariantEffectiveStock());
    return Math.min(Math.max(0, Math.floor(savedQuantity)), max);
  }

  private syncDrawerQuantityForSelectedVariant() {
    const selectedVariantId = this.parsePositiveInt(this.selectedVariant?.id);
    if (!selectedVariantId) {
      return;
    }

    if (this.variantQuantity > 0) {
      this.drawerQuantityByVariant.set(selectedVariantId, this.variantQuantity);
    } else {
      this.drawerQuantityByVariant.delete(selectedVariantId);
    }
  }

  private addAllDerivedSizeVariantsToCart(product: PosProduct) {
    const variants = this.getSizesForSelectedColor(product);
    if (!variants.length) {
      this.showToast('No hay variantes por talla para agregar.', 'error');
      return;
    }

    let addedCount = 0;
    let skippedCount = 0;
    const requestedQuantity = Math.max(0, Math.floor(Number(this.variantQuantity) || 0));
    if (requestedQuantity <= 0) {
      this.showToast('La cantidad debe ser mayor a 0.', 'error');
      return;
    }

    for (const variant of variants) {
      const result = this.upsertVariantInCart(product, variant, requestedQuantity, null);
      if (result.success) {
        addedCount += 1;
      } else {
        skippedCount += 1;
      }
    }

    if (addedCount === 0) {
      this.showToast('No se pudo agregar ninguna talla por falta de stock disponible.', 'error');
      return;
    }

    this.syncRemoteFulfillmentFromCart();
    this.updateTotals();
    this.closeVariantSelector();
    this.showToast(
      skippedCount > 0
        ? `Se agregaron ${addedCount} talla(s). ${skippedCount} no se agregaron por stock.`
        : `Se agregaron ${addedCount} talla(s) al carrito.`,
      'success'
    );
  }

  private upsertVariantInCart(
    product: PosProduct,
    variant: PosVariant,
    quantity: number,
    remoteStock: RemoteStockOption | null
  ): CartUpsertResult {
    const selectedVariantId = this.parsePositiveInt(variant.id);
    if (!selectedVariantId) {
      return { success: false, message: 'No se pudo identificar la variante seleccionada.' };
    }

    const usingRemoteStock = variant.availableStock <= 0;
    const effectiveStock = usingRemoteStock ? (remoteStock?.availableStock ?? 0) : variant.availableStock;

    if (effectiveStock <= 0) {
      if (usingRemoteStock) {
        if (this.remoteStockSuggestions.length > 0) {
          return { success: false, message: 'Sin stock en el local. Selecciona un local remoto con disponibilidad.' };
        }
        return { success: false, message: 'Sin stock en ningun local para esta variante.' };
      }
      return { success: false, message: 'Esta variante no tiene stock disponible.' };
    }

    if (quantity > effectiveStock) {
      return { success: false, message: `Stock disponible: ${effectiveStock}` };
    }

    const fulfillmentStoreId = remoteStock?.storeId ?? null;
    const fulfillmentStoreName = remoteStock?.storeName ?? null;

    if (fulfillmentStoreId && this.remoteFulfillmentStoreId && this.remoteFulfillmentStoreId !== fulfillmentStoreId) {
      return { success: false, message: 'Solo puedes trabajar con una tienda de abastecimiento remoto por venta.' };
    }

    const selectedCartKey = this.buildCartItemKey({
      productId: product.id,
      variantId: selectedVariantId,
      sku: variant.sku,
      colorName: variant.colorName,
      sizeName: variant.sizeName,
      fulfillmentStoreId,
    });
    const existingItem = this.cart.find((item) => this.buildCartItemKey(item) === selectedCartKey);
    if (existingItem && (existingItem.fulfillmentStoreId ?? null) !== fulfillmentStoreId) {
      return { success: false, message: 'Esta variante ya fue agregada con otra tienda de abastecimiento.' };
    }

    const nextQuantity = (existingItem?.quantity || 0) + quantity;
    if (nextQuantity > effectiveStock) {
      return { success: false, message: `Ya tienes el maximo disponible (${effectiveStock}) en el carrito.` };
    }

    if (existingItem) {
      existingItem.quantity = nextQuantity;
      existingItem.subtotal = existingItem.quantity * existingItem.price;
      existingItem.availableStock = effectiveStock;
      existingItem.fulfillmentStoreId = fulfillmentStoreId;
      existingItem.fulfillmentStoreName = fulfillmentStoreName;
    } else {
      this.cart.push({
        productId: product.id,
        productName: product.name,
        variantId: selectedVariantId,
        sku: variant.sku,
        colorName: variant.colorName,
        sizeName: variant.sizeName,
        price: variant.price,
        imageUrl: variant.imageUrl || product.imageUrl,
        quantity,
        subtotal: variant.price * quantity,
        availableStock: effectiveStock,
        fulfillmentStoreId,
        fulfillmentStoreName
      });
    }

    return {
      success: true,
      fulfillmentStoreId,
      fulfillmentStoreName
    };
  }

  private prefetchRemoteStockForVariants(variants: PosVariant[]) {
    for (const variant of variants) {
      if (variant.availableStock > 0) {
        continue;
      }
      if (this.remoteStockSuggestionsByVariant.has(variant.id)) {
        continue;
      }
      if (this.loadingRemoteStockVariantIds.has(variant.id)) {
        continue;
      }
      this.loadRemoteStockRecommendations(variant.id, true);
    }
  }

  private loadRemoteStockRecommendations(variantId: number, background = false) {
    if (!this.selectedStoreId) {
      return;
    }

    const cachedSuggestions = this.remoteStockSuggestionsByVariant.get(variantId);
    const isSelectedVariant = this.selectedVariant?.id === variantId;
    if (cachedSuggestions) {
      if (isSelectedVariant) {
        this.remoteStockSuggestions = cachedSuggestions;
        if (this.remoteFulfillmentStoreId && cachedSuggestions.some((store) => store.storeId === this.remoteFulfillmentStoreId)) {
          this.selectedRemoteStoreId = this.remoteFulfillmentStoreId;
        } else if (cachedSuggestions.length > 0) {
          this.selectedRemoteStoreId = cachedSuggestions[0].storeId;
        } else {
          this.selectedRemoteStoreId = null;
        }
        this.loadingRemoteStock = false;
        this.variantQuantity = Math.min(this.variantQuantity, Math.max(0, this.getSelectedVariantEffectiveStock()));
        this.syncDrawerQuantityForSelectedVariant();
        this.cdr.markForCheck();
      }
      return;
    }

    const requestId = ++this.remoteStockRequestId;
    this.remoteStockActiveRequestByVariant.set(variantId, requestId);
    this.loadingRemoteStockVariantIds.add(variantId);
    if (isSelectedVariant && !background) {
      this.loadingRemoteStock = true;
      this.selectedRemoteStoreId = null;
      this.cdr.markForCheck();
    }

    this.orderService.getRemoteStock(variantId, this.selectedStoreId).subscribe({
      next: (response: any) => {
        if (this.remoteStockActiveRequestByVariant.get(variantId) !== requestId) {
          return;
        }
        this.remoteStockActiveRequestByVariant.delete(variantId);

        const suggestions: RemoteStockOption[] = (response?.data || []).map((store: any) => ({
          storeId: Number(store.storeId),
          storeName: String(store.storeName || ''),
          storeType: store.storeType,
          availableStock: Number(store.availableStock || 0),
          reservedStock: Number(store.reservedStock || 0)
        })).filter((store: RemoteStockOption) => store.availableStock > 0);

        this.remoteStockSuggestionsByVariant.set(variantId, suggestions);
        this.loadingRemoteStockVariantIds.delete(variantId);

        if (this.selectedVariant?.id === variantId) {
          this.remoteStockSuggestions = suggestions;

          if (this.remoteFulfillmentStoreId && suggestions.some((store) => store.storeId === this.remoteFulfillmentStoreId)) {
            this.selectedRemoteStoreId = this.remoteFulfillmentStoreId;
          } else if (suggestions.length > 0) {
            this.selectedRemoteStoreId = suggestions[0].storeId;
          } else {
            this.selectedRemoteStoreId = null;
          }

          this.loadingRemoteStock = false;
          this.variantQuantity = Math.min(this.variantQuantity, Math.max(0, this.getSelectedVariantEffectiveStock()));
          this.syncDrawerQuantityForSelectedVariant();
        }
        this.cdr.markForCheck();
      },
      error: () => {
        if (this.remoteStockActiveRequestByVariant.get(variantId) !== requestId) {
          return;
        }
        this.remoteStockActiveRequestByVariant.delete(variantId);
        this.loadingRemoteStockVariantIds.delete(variantId);
        if (this.selectedVariant?.id === variantId) {
          this.remoteStockSuggestions = [];
          this.selectedRemoteStoreId = null;
          this.loadingRemoteStock = false;
        }
        this.cdr.markForCheck();
      }
    });
  }

  private getSelectedRemoteStockOption(): RemoteStockOption | null {
    if (!this.selectedRemoteStoreId) {
      return null;
    }
    return this.remoteStockSuggestions.find((store) => store.storeId === this.selectedRemoteStoreId) || null;
  }

  private getSelectedVariantEffectiveStock(): number {
    if (!this.selectedVariant) {
      return 0;
    }
    if (this.selectedVariant.availableStock > 0) {
      return this.selectedVariant.availableStock;
    }
    return this.getSelectedRemoteStockOption()?.availableStock ?? 0;
  }

  private syncRemoteFulfillmentFromCart() {
    const remoteStoreIds = this.cart
      .map((item) => item.fulfillmentStoreId)
      .filter((storeId): storeId is number => typeof storeId === 'number' && storeId > 0);

    this.remoteFulfillmentStoreId = remoteStoreIds.length ? remoteStoreIds[0] : null;
  }

  private getStoreNameById(storeId: number | null): string | null {
    if (!storeId) {
      return null;
    }
    const store = this.stores.find((item) => Number(item.id) === Number(storeId));
    return store?.name || null;
  }

  private async validateCartStockForFulfillmentStore(storeId: number): Promise<{ ok: boolean; message?: string }> {
    try {
      const requiredByVariant = new Map<number, { quantity: number; sku: string }>();
      this.cart.forEach((item) => {
        const variantId = Number(item.variantId);
        const current = requiredByVariant.get(variantId);
        if (current) {
          current.quantity += Number(item.quantity);
        } else {
          requiredByVariant.set(variantId, { quantity: Number(item.quantity), sku: item.sku });
        }
      });

      const variantIds = Array.from(requiredByVariant.keys());
      if (!variantIds.length) {
        return { ok: true };
      }

      const response: any = await firstValueFrom(
        this.orderService.getVariantStock(storeId, variantIds).pipe(timeout(7000))
      );

      const stockMap = new Map<number, any>((response?.data || []).map((stock: any) => [Number(stock.variantId), stock]));
      const shortages: string[] = [];

      requiredByVariant.forEach((value, variantId) => {
        const available = Number(stockMap.get(variantId)?.availableStock || 0);
        if (available < value.quantity) {
          shortages.push(`${value.sku}: requiere ${value.quantity}, disponible ${available}`);
        }
      });

      if (shortages.length > 0) {
        return {
          ok: false,
          message: `La tienda recomendada no cubre el stock requerido (${shortages.join(' | ')})`
        };
      }

      return { ok: true };
    } catch {
      return {
        ok: false,
        message: 'No se pudo validar el stock de la tienda remota. Intenta nuevamente.'
      };
    }
  }

  private buildOrderNote(paymentRef: string): string {
    const note = this.orderForm.get('note')?.value;
    const paymentNote = `Metodo de pago: ${this.selectedPaymentMethod}`;
    const igvNote = `IGV: ${this.applyIgv ? 'INCLUIDO' : 'NO_INCLUIDO'}`;
    const referenceNote = `Ref: ${paymentRef}`;
    const remoteStoreName = this.getStoreNameById(this.remoteFulfillmentStoreId);
    const remoteFulfillmentNote =
      this.remoteFulfillmentStoreId && this.remoteFulfillmentStoreId !== Number(this.selectedStoreId)
        ? `Fulfillment remoto: ${remoteStoreName || `Tienda #${this.remoteFulfillmentStoreId}`}`
        : null;
    const baseNote = note ? `${note} | ${paymentNote} | ${igvNote}` : `${paymentNote} | ${igvNote}`;
    const baseWithFulfillment = remoteFulfillmentNote ? `${baseNote} | ${remoteFulfillmentNote}` : baseNote;
    return `${baseWithFulfillment} | ${referenceNote}`;
  }

  private createPaymentReference(): string {
    return `POS-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  }

  private async tryRecoverOrderAfterTimeout(
    paymentRef: string,
    storeId: number,
    requestId: number,
    timeoutMessage = 'La solicitud demoro demasiado. Estamos validando si la orden ya se guardo.'
  ) {
    if (this.activePaymentRequestId !== requestId) {
      return;
    }

    try {
      const response: any = await firstValueFrom(
        this.orderService.listOrders({ page: 1, limit: 20, storeId }).pipe(timeout(7000))
      );
      const orders = response?.data || [];
      const recoveredOrder = orders.find((order: any) => {
        const note = String(order?.note || '');
        return note.includes(paymentRef);
      });

      if (recoveredOrder) {
        this.completePaymentRequest(recoveredOrder.code || 'VENTA', true);
        return;
      }

      this.failPaymentRequest(`${timeoutMessage} No se encontro la orden en historial.`);
    } catch {
      this.failPaymentRequest(`${timeoutMessage} Intenta nuevamente en unos segundos.`);
    }
  }

  private completePaymentRequest(orderCode: string, recovered: boolean) {
    this.finishPaymentState();
    this.cart = [];
    this.remoteFulfillmentStoreId = null;
    this.updateTotals();
    this.showPaymentDrawer = false;
    this.loadAvailableStockForStore();
    this.loadSalesHistory();
    this.showToast(
      recovered
        ? `Venta guardada (${orderCode}). Estado recuperado automaticamente.`
        : `Venta creada: ${orderCode}`,
      'success'
    );
    this.cdr.markForCheck();
  }

  private failPaymentRequest(message: string) {
    this.finishPaymentState();
    this.showToast(message, 'error');
    this.cdr.markForCheck();
  }

  private finishPaymentState() {
    this.loading = false;
    this.activePaymentRequestId = null;
    if (this.submitGuardTimeout) {
      window.clearTimeout(this.submitGuardTimeout);
      this.submitGuardTimeout = undefined;
    }
    if (this.hardStopTimeout) {
      window.clearTimeout(this.hardStopTimeout);
      this.hardStopTimeout = undefined;
    }
    this.cdr.markForCheck();
  }

  private parsePaymentMethod(note?: string | null): string {
    const match = note?.match(/Metodo de pago:\s*([^|]+)/i);
    return match?.[1]?.trim() || 'No especificado';
  }

  private loadPaymentMethods() {
    this.paymentMethodService.listActive().subscribe({
      next: (methods) => {
        const names = methods
          .map((item) => String(item.name || '').trim())
          .filter((name) => name.length > 0);

        this.paymentMethods = names.length > 0 ? names : [...this.defaultPaymentMethods];

        if (!this.paymentMethods.includes(this.selectedPaymentMethod)) {
          this.selectedPaymentMethod = this.paymentMethods[0] || this.defaultPaymentMethods[0];
        }

        this.paymentForm.patchValue({ method: this.selectedPaymentMethod }, { emitEvent: false });
        this.cdr.markForCheck();
      },
      error: () => {
        this.paymentMethods = [...this.defaultPaymentMethods];
        if (!this.paymentMethods.includes(this.selectedPaymentMethod)) {
          this.selectedPaymentMethod = this.paymentMethods[0];
          this.paymentForm.patchValue({ method: this.selectedPaymentMethod }, { emitEvent: false });
        }
        this.cdr.markForCheck();
      },
    });
  }

  private showToast(message: string, type: ToastType) {
    this.toast = { message, type };
    if (this.toastTimeout) {
      window.clearTimeout(this.toastTimeout);
    }
    this.toastTimeout = window.setTimeout(() => {
      this.toast = null;
      this.cdr.markForCheck();
    }, 3200);
    this.cdr.markForCheck();
  }
}
