/**
 * Checkout routes — STUB.
 *
 * Implementation lives in PLAN.md weeks 3 and 4.
 *
 * Hard rules:
 *   - Checkout creates an ERPNext Quotation. We do NOT compute totals.
 *   - Pay route initiates M-Pesa STK push and inserts an mpesa_transactions row.
 *   - On Daraja callback (webhooks/mpesa), we convert the Quotation → Sales Order
 *     in ERPNext, with an idempotency key so retries are safe.
 *   - Publish `payment.confirmed` and `order.placed` to Pub/Sub on success.
 *   - The storefront polls GET /payments/:id for status.
 */

import { z } from 'zod';
import type { FastifyInstance } from 'fastify';

const _CheckoutResponse = z.object({
  quotationId: z.string(),
  totals: z.object({
    subtotalCents: z.number().int(),
    shippingCents: z.number().int(),
    taxCents: z.number().int(),
    grandTotalCents: z.number().int(),
    currency: z.literal('KES'),
  }),
});

const _PayRequest = z.object({
  phone: z.string().min(9), // normalize via lib/phone.ts
});

const _PaymentSession = z.object({
  id: z.string(),
  status: z.enum(['initiated', 'confirmed', 'failed', 'timeout']),
  cartId: z.string(),
  amountCents: z.number().int(),
  initiatedAt: z.string(),
  confirmedAt: z.string().optional(),
  failureReason: z.string().optional(),
});

// eslint-disable-next-line @typescript-eslint/require-await
export default async function checkoutRoutes(_app: FastifyInstance) {
  // TODO(week-3): POST /carts/:id/checkout
  // TODO(week-4): POST /carts/:id/pay
  // TODO(week-4): GET /payments/:id
}
