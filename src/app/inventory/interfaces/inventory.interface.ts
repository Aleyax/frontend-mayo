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

export type InventoryReservationStatus = 'ACTIVE' | 'RELEASED' | 'COMPLETED';

export interface InventoryReservationOrderSummary {
  id: number;
  code: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  sourceStoreId?: number | null;
  fulfillmentStoreId?: number | null;
}

export interface InventoryReservation {
  id: number;
  quantity: number;
  status: InventoryReservationStatus;
  createdAt: string;
  updatedAt: string;
  inventoryId: number;
  variantId: number;
  orderId?: number | null;
  inventory: Inventory;
  order?: InventoryReservationOrderSummary | null;
  reservedBy?: {
    id: number;
    firstName: string;
    lastName: string;
  } | null;
}

export interface InventoryReservedReconcileItem {
  inventoryId: number;
  storeId: number;
  storeName: string;
  variantId: number;
  sku: string;
  previousReservedStock: number;
  targetReservedStock: number;
  difference: number;
  reconciled: boolean;
}

export interface InventoryReservedReconcileResult {
  adjustedCount: number;
  unchangedCount: number;
  requestedInventoryCount?: number;
  processedInventoryCount: number;
  items: InventoryReservedReconcileItem[];
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
