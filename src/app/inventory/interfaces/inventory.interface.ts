export interface InventoryStore {
  id: number;
  name: string;
  code: string;
}

export interface InventoryVariantProduct {
  id: number;
  name: string;
}

export interface InventoryVariantColor {
  id: number;
  name: string;
}

export interface InventoryVariantSize {
  id: number;
  name: string;
}

export interface InventoryVariant {
  id: number;
  sku: string;
  barcode?: string;
  price: string;
  product: InventoryVariantProduct;
  color: InventoryVariantColor;
  size: InventoryVariantSize;
}

export interface Inventory {
  id: number;
  stock: number;
  reservedStock: number;
  availableStock?: number;
  store: InventoryStore;
  variant: InventoryVariant;
}

export type InventoryMovementType =
  | 'IN'
  | 'OUT'
  | 'ADJUSTMENT'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'RESERVED'
  | 'UNRESERVED';

export interface InventoryMovement {
  id: number;
  type: InventoryMovementType;
  quantity: number;
  note?: string;
  createdAt: string;
  inventory: Inventory;
  responsibleUser?: {
    id: number;
    firstName: string;
    lastName: string;
  };
}

export type StockTransferStatus = 'PENDING' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';

export interface StockTransferItem {
  id: number;
  quantity: number;
  variantId: number;
  variant: InventoryVariant;
}

export interface StockTransfer {
  id: number;
  code: string;
  status: StockTransferStatus;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
  fromStoreId: number;
  toStoreId: number;
  orderId?: number | null;
  fromStore: InventoryStore;
  toStore: InventoryStore;
  createdBy?: {
    id: number;
    firstName: string;
    lastName: string;
  } | null;
  receivedBy?: {
    id: number;
    firstName: string;
    lastName: string;
  } | null;
  items: StockTransferItem[];
}
