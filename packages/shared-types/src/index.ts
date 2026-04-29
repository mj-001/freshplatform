/**
 * Shared types between commerce-api and the Flutter storefront.
 *
 * All money is integer cents (smallest unit of KES).
 * All phone numbers are normalised to "254XXXXXXXXX".
 * All timestamps are ISO 8601 strings (UTC).
 */

// ===== Catalog ==============================================================

export interface CatalogItem {
  itemCode: string;
  name: string;
  group?: string;
  description?: string;
  uom: string;
  hasBatch: boolean;
  hasExpiry: boolean;
  shelfLifeDays?: number;
  countryOfOrigin?: string;
  imageUrl?: string;
  priceCents: number;
}

export interface CatalogListResponse {
  items: CatalogItem[];
  total: number;
}

// ===== Cart =================================================================

export interface CartLine {
  itemCode: string;
  qty: number;
  /** Snapshotted at add-to-cart time, refreshed on read. */
  unitPriceCents: number;
}

export interface ShippingAddress {
  recipientName: string;
  phone: string;        // "254XXXXXXXXX"
  line1: string;
  line2?: string;
  city: string;
  zone: string;         // "Westlands", "Karen", etc. — comes from the backend
  notes?: string;
}

export interface Cart {
  id: string;
  lines: CartLine[];
  shippingAddress?: ShippingAddress;
  customerId?: string;
  /** Computed by ERPNext on /checkout. Null until checkout invoked. */
  totals?: CartTotals;
  createdAt: string;
  updatedAt: string;
}

export interface CartTotals {
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  grandTotalCents: number;
  currency: 'KES';
}

// ===== Auth =================================================================

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  customer: CustomerProfile;
  expiresAt: string;
}

export interface CustomerProfile {
  id: string;             // ERPNext customer id
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
}

// ===== Payment ==============================================================

export type PaymentStatus = 'initiated' | 'confirmed' | 'failed' | 'timeout';

export interface InitiatePaymentRequest {
  cartId: string;
  phone: string;
}

export interface PaymentSession {
  id: string;
  status: PaymentStatus;
  cartId: string;
  amountCents: number;
  initiatedAt: string;
  confirmedAt?: string;
  failureReason?: string;
}

// ===== Orders (read-through from ERPNext Sales Orders) ======================

export type OrderStatus =
  | 'draft'
  | 'placed'
  | 'preparing'
  | 'dispatched'
  | 'delivered'
  | 'cancelled';

export interface OrderLine {
  itemCode: string;
  itemName: string;
  qty: number;
  unitPriceCents: number;
  totalCents: number;
}

export interface Order {
  id: string;             // ERPNext Sales Order name
  status: OrderStatus;
  placedAt: string;
  customer: CustomerProfile;
  lines: OrderLine[];
  totals: CartTotals;
  shippingAddress: ShippingAddress;
}

// ===== Errors ===============================================================

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
