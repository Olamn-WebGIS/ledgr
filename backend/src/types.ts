export interface SalePayload {
  product_id: number;
  quantity: number;
  selling_price: number;
}

export interface ProductRow {
  id: number;
  cost_price: string;
  current_stock: number;
}
