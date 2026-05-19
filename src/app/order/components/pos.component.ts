import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { finalize, firstValueFrom, timeout } from 'rxjs';
import { ProductService } from '../../product/services/product.service';
import { StoreService } from '../../store/services/store.service';
import { OrderService } from '../services/order.service';
import { AuthService } from '../../auth/auth.service';

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

type ToastType = 'success' | 'error' | 'info';

@Component({
  selector: 'app-pos',
  templateUrl: './pos.component.html',
  styleUrls: ['./pos.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule]
})
export class PosComponent implements OnInit {
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

  showVariantSelector = false;
  showPaymentDrawer = false;
  showSalesHistory = false;
  showMobileCart = false;

  selectedProductForVariant: PosProduct | null = null;
  selectedVariant: PosVariant | null = null;
  selectedColor = '';
  selectedSize = '';
  variantQuantity = 1;
  remoteStockSuggestions: RemoteStockOption[] = [];
  loadingRemoteStock = false;
  selectedRemoteStoreId: number | null = null;
  remoteFulfillmentStoreId: number | null = null;

  paymentMethods = ['Efectivo', 'Tarjeta', 'Yape', 'Plin', 'Transferencia', 'Nequi'];
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
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.initializeForms();
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
    this.variantQuantity = 1;
    this.syncSelectedVariant();
    this.showVariantSelector = true;
  }

  closeVariantSelector() {
    this.showVariantSelector = false;
    this.selectedProductForVariant = null;
    this.selectedVariant = null;
    this.selectedColor = '';
    this.selectedSize = '';
    this.variantQuantity = 1;
    this.clearRemoteStockSuggestions();
  }

  selectColor(colorName: string) {
    this.selectedColor = colorName;
    this.selectedSize = '';
    this.syncSelectedVariant();
  }

  selectSize(sizeName: string) {
    this.selectedSize = sizeName;
    this.syncSelectedVariant();
  }

  setVariantQuantity(quantity: number) {
    const max = this.getSelectedVariantEffectiveStock() || 1;
    this.variantQuantity = Math.min(Math.max(1, quantity), Math.max(1, max));
  }

  addVariantToCart() {
    if (!this.selectedProductForVariant || !this.selectedVariant) {
      this.showToast('Selecciona color y talla antes de agregar.', 'error');
      return;
    }

    const usingRemoteStock = this.selectedVariant.availableStock <= 0;
    const remoteStock = usingRemoteStock ? this.getSelectedRemoteStockOption() : null;
    const effectiveStock = usingRemoteStock ? (remoteStock?.availableStock ?? 0) : this.selectedVariant.availableStock;

    if (effectiveStock <= 0) {
      if (usingRemoteStock) {
        this.showToast('Sin stock en esta tienda y sin disponibilidad remota seleccionada.', 'error');
      } else {
        this.showToast('Esta variante no tiene stock disponible.', 'error');
      }
      return;
    }

    if (this.variantQuantity > effectiveStock) {
      this.showToast(`Stock disponible: ${effectiveStock}`, 'error');
      return;
    }

    const fulfillmentStoreId = remoteStock?.storeId ?? null;
    const fulfillmentStoreName = remoteStock?.storeName ?? null;

    if (fulfillmentStoreId && this.remoteFulfillmentStoreId && this.remoteFulfillmentStoreId !== fulfillmentStoreId) {
      this.showToast('Solo puedes trabajar con una tienda de abastecimiento remoto por venta.', 'error');
      return;
    }

    const existingItem = this.cart.find((item) => item.variantId === this.selectedVariant?.id);
    if (existingItem && (existingItem.fulfillmentStoreId ?? null) !== fulfillmentStoreId) {
      this.showToast('Esta variante ya fue agregada con otra tienda de abastecimiento.', 'error');
      return;
    }

    const nextQuantity = (existingItem?.quantity || 0) + this.variantQuantity;
    if (nextQuantity > effectiveStock) {
      this.showToast(`Ya tienes el maximo disponible (${effectiveStock}) en el carrito.`, 'error');
      return;
    }

    if (existingItem) {
      existingItem.quantity = nextQuantity;
      existingItem.subtotal = existingItem.quantity * existingItem.price;
      existingItem.availableStock = effectiveStock;
      existingItem.fulfillmentStoreId = fulfillmentStoreId;
      existingItem.fulfillmentStoreName = fulfillmentStoreName;
    } else {
      this.cart.push({
        productId: this.selectedProductForVariant.id,
        productName: this.selectedProductForVariant.name,
        variantId: this.selectedVariant.id,
        sku: this.selectedVariant.sku,
        colorName: this.selectedVariant.colorName,
        sizeName: this.selectedVariant.sizeName,
        price: this.selectedVariant.price,
        imageUrl: this.selectedVariant.imageUrl || this.selectedProductForVariant.imageUrl,
        quantity: this.variantQuantity,
        subtotal: this.selectedVariant.price * this.variantQuantity,
        availableStock: effectiveStock,
        fulfillmentStoreId,
        fulfillmentStoreName
      });
    }

    this.syncRemoteFulfillmentFromCart();
    this.updateTotals();
    this.closeVariantSelector();
    this.showToast(
      fulfillmentStoreId
        ? `Producto agregado con stock remoto de ${fulfillmentStoreName}.`
        : 'Producto agregado al carrito.',
      'success'
    );
  }

  openPaymentDrawer() {
    if (this.cart.length === 0) {
      this.showToast('El carrito esta vacio.', 'error');
      return;
    }

    this.selectedPaymentMethod = 'Efectivo';
    this.paymentForm.patchValue({ method: 'Efectivo', amountPaid: this.total });
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
    this.tax = this.subtotal * this.taxRate;
    this.total = this.subtotal + this.tax;
    this.paymentForm?.patchValue({ amountPaid: this.total }, { emitEvent: false });
    this.calculateChange();
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

  private mapProduct(product: any): PosProduct {
    const variants: PosVariant[] = (product.variants || []).map((variant: any) => ({
      id: Number(variant.id),
      sku: variant.sku || '',
      barcode: variant.barcode || null,
      colorName: variant.color?.name || 'Sin color',
      colorHex: variant.color?.hex || null,
      sizeName: variant.size?.name || 'Sin talla',
      price: Number(variant.price || 0),
      imageUrl: variant.imageUrl || null,
      availableStock: 0,
      reservedStock: 0
    }));

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
    if (this.selectedVariant) {
      this.selectedSize = this.selectedVariant.sizeName;
      this.variantQuantity = Math.min(this.variantQuantity, Math.max(1, this.getSelectedVariantEffectiveStock()));
      if (this.selectedVariant.availableStock <= 0) {
        this.loadRemoteStockRecommendations(this.selectedVariant.id);
      }
    }
  }

  selectRemoteStoreForVariant(storeId: number) {
    this.selectedRemoteStoreId = storeId;
    this.variantQuantity = Math.min(this.variantQuantity, Math.max(1, this.getSelectedVariantEffectiveStock()));
    this.cdr.markForCheck();
  }

  isRemoteStoreSelected(storeId: number): boolean {
    return this.selectedRemoteStoreId === storeId;
  }

  canAddSelectedVariant(): boolean {
    return !!this.selectedVariant && this.getSelectedVariantEffectiveStock() > 0;
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

  private loadRemoteStockRecommendations(variantId: number) {
    if (!this.selectedStoreId) {
      return;
    }

    const requestId = ++this.remoteStockRequestId;
    this.loadingRemoteStock = true;
    this.selectedRemoteStoreId = null;
    this.cdr.markForCheck();

    this.orderService.getRemoteStock(variantId, this.selectedStoreId).subscribe({
      next: (response: any) => {
        if (requestId !== this.remoteStockRequestId) {
          return;
        }

        const suggestions: RemoteStockOption[] = (response?.data || []).map((store: any) => ({
          storeId: Number(store.storeId),
          storeName: String(store.storeName || ''),
          storeType: store.storeType,
          availableStock: Number(store.availableStock || 0),
          reservedStock: Number(store.reservedStock || 0)
        })).filter((store: RemoteStockOption) => store.availableStock > 0);

        this.remoteStockSuggestions = suggestions;

        if (this.remoteFulfillmentStoreId && suggestions.some((store) => store.storeId === this.remoteFulfillmentStoreId)) {
          this.selectedRemoteStoreId = this.remoteFulfillmentStoreId;
        } else if (suggestions.length > 0) {
          this.selectedRemoteStoreId = suggestions[0].storeId;
        } else {
          this.selectedRemoteStoreId = null;
        }

        this.loadingRemoteStock = false;
        this.variantQuantity = Math.min(this.variantQuantity, Math.max(1, this.getSelectedVariantEffectiveStock()));
        this.cdr.markForCheck();
      },
      error: () => {
        if (requestId !== this.remoteStockRequestId) {
          return;
        }
        this.remoteStockSuggestions = [];
        this.selectedRemoteStoreId = null;
        this.loadingRemoteStock = false;
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
    const referenceNote = `Ref: ${paymentRef}`;
    const remoteStoreName = this.getStoreNameById(this.remoteFulfillmentStoreId);
    const remoteFulfillmentNote =
      this.remoteFulfillmentStoreId && this.remoteFulfillmentStoreId !== Number(this.selectedStoreId)
        ? `Fulfillment remoto: ${remoteStoreName || `Tienda #${this.remoteFulfillmentStoreId}`}`
        : null;
    const baseNote = note ? `${note} | ${paymentNote}` : paymentNote;
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
