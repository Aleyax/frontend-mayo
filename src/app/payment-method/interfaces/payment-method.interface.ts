export interface PaymentMethod {
  id: number;
  name: string;
  code: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface PaymentMethodListResponse {
  data: PaymentMethod[];
  total: number;
  page: number;
  limit: number;
}
