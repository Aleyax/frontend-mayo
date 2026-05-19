export interface MarketplaceProductVariant {
  id: number;
  sku: string;
  barcode?: string | null;
  price: number;
  imageUrl?: string | null;
  color?: {
    id: number;
    name: string;
    hex?: string | null;
  } | null;
  size?: {
    id: number;
    name: string;
  } | null;
  availableStock: number;
  reservedStock: number;
  isSimpleVariant?: boolean;
  isSizeOnlyVariant?: boolean;
}

export interface MarketplaceCatalogProduct {
  id: number;
  name: string;
  description?: string | null;
  category?: {
    id: number;
    name: string;
  } | null;
  imageUrl?: string | null;
  images: Array<{ id: number; url: string }>;
  variants: MarketplaceProductVariant[];
  colors: Array<{ id: number; name: string; hex?: string | null }>;
  sizes: Array<{ id: number; name: string }>;
  minPrice: number;
  maxPrice: number;
  totalAvailableStock: number;
  hasStock: boolean;
  allowBackorder: boolean;
  availabilityLabel: string;
}

export interface MarketplaceCatalogResponse {
  data: MarketplaceCatalogProduct[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface MarketplaceOrderItemSummary {
  variantId: number;
  productName: string;
  colorName: string;
  sizeName: string;
  requestedQuantity: number;
  reservedQuantity: number;
  pendingQuantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface MarketplaceOrderSummary {
  code: string;
  status: string;
  publicStatus: string;
  createdAt: string;
  clientName: string;
  clientPhone: string;
  totals: {
    subtotal: number;
    tax: number;
    total: number;
  };
  items: MarketplaceOrderItemSummary[];
  reviewMessage: string;
}

export interface MarketplaceTrackResponse {
  code: string;
  status: string;
  publicStatus: string;
  createdAt: string;
  hasPending: boolean;
  reviewMessage: string;
  items: Array<{
    productName: string;
    colorName: string;
    sizeName: string;
    requestedQuantity: number;
    reservedQuantity: number;
    pendingQuantity: number;
  }>;
}

