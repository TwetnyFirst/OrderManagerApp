export interface Shipment {
  id: number;
  order_id: number;
  waybill: string;
  label_path: string;
  provider: 'DPD' | 'APaczka';
  created_at: string;
}

export interface Order {
  id: number;
  order_number: string;
  customer_name: string;
  company_name: string | null;
  nip: string | null;
  email: string;
  phone: string;
  street: string;
  city: string;
  zip_code: string;
  delivery_method: string;
  payment_method: string;
  total_price: number;
  packages_count: number;
  status: string;
  created_at: string;
  source: 'Email' | 'PrestaShop';
  paczkomat_id: string | null;
  parcel_size: string;
  shipments: Shipment[];
}

export interface Sender {
  id: number;
  fid: string;
  name: string;
  company: string;
  street: string;
  city: string;
  zip_code: string;
  phone: string;
  email: string;
}

export interface OrdersResponse {
  orders: Order[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
  limit: number;
}
