import { Category } from '../../category/interfaces/category.interface';
import { Color } from '../../color/interfaces/color.interface';
import { Size } from '../../size/interfaces/size.interface';

export type ProductVariantMode = 'MATRIX' | 'SIMPLE' | 'SIZE_ONLY';

export interface ProductResponse {
  data: Product[];
  total: number;
  page: number;
  limit: number;
  hasMore?: boolean;
}

export interface Product {
  id: number;
  name: string;
  description?: string;
  categoryId: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  category?: Pick<Category, 'id' | 'name'>;
  variantCount?: number;
  imageCount?: number;
  variantMode?: ProductVariantMode;
  variants?: ProductVariant[];
  images?: Array<{ id: number; url: string }>;
}

export interface ProductVariant {
  id: number;
  productId?: number;
  colorId: number;
  sizeId: number;
  sku: string;
  barcode?: string | null;
  price: number;
  imageUrl?: string | null;
  isActive?: boolean;
  isSimpleVariant?: boolean;
  isSizeOnlyVariant?: boolean;
  color?: Pick<Color, 'id' | 'name' | 'hex'> | null;
  size?: Pick<Size, 'id' | 'name'> | null;
}

export interface ProductCreateRequest {
  name: string;
  description?: string;
  categoryId: number;
  variantMode: ProductVariantMode;
  colorIds: number[];
  sizeIds: number[];
  imageUrls?: string[];
  imageFiles?: Array<{ filename: string; data: string }>;
  variants: Array<{
    colorId?: number;
    sizeId?: number;
    price: number;
    imageUrl?: string | null;
    imageFile?: { filename: string; data: string };
  }>;
}

export interface ProductUpdateRequest {
  name?: string;
  description?: string;
  categoryId?: number;
  isActive?: boolean;
  variantMode?: ProductVariantMode;
  colorIds?: number[];
  sizeIds?: number[];
  imageUrls?: string[];
  imageFiles?: Array<{ filename: string; data: string }>;
  variants?: Array<{
    colorId?: number;
    sizeId?: number;
    price: number;
    imageUrl?: string | null;
    imageFile?: { filename: string; data: string };
  }>;
}

export interface GenerateVariantsRequest {
  colorIds: number[];
  sizeIds: number[];
}

export interface GenerateVariantsResponse {
  variants: Array<{
    colorId: number;
    sizeId: number;
  }>;
  count: number;
  message: string;
}
