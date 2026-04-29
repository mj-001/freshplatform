/**
 * Cart routes — STUB.
 *
 * Implementation lives in PLAN.md week 2. This file is a skeleton that names the
 * endpoints, defines the schemas, and shows the expected pattern. Claude Code
 * fills in the bodies in a dedicated slice.
 *
 * Hard rules (see services/commerce-api/CLAUDE.md):
 *   - Cart state lives in Redis, NOT Postgres. No cart tables.
 *   - Cart key: `cart:{cartId}` where cartId is a UUID.
 *   - Cart payload is the minimum: { lines: [{itemCode, qty}], shippingAddress?, customerId? }.
 *     NO prices, NO totals, NO line subtotals — those come from ERPNext at /checkout time.
 *   - Stock validation: call app.erpnext.getItem on add, reject if disabled or out of stock.
 *   - Cart expires after 7 days idle. Use Redis EXPIRE.
 */

import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
// import { AppError, ErrorCodes } from '../lib/errors.js';

// ----- Schemas --------------------------------------------------------------

const CartLineSchema = z.object({
  itemCode: z.string().min(1),
  qty: z.number().int().positive(),
});

const ShippingAddressSchema = z.object({
  recipientName: z.string().min(1),
  phone: z.string().min(9),
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  zone: z.string().min(1),
  notes: z.string().optional(),
});

const CartSchema = z.object({
  id: z.string().uuid(),
  lines: z.array(CartLineSchema),
  shippingAddress: ShippingAddressSchema.optional(),
  customerId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const _CartIdParams = z.object({ id: z.string().uuid() });

// ----- Routes ---------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/require-await
export default async function cartRoutes(app: FastifyInstance) {
  /**
   * POST /carts → create a new empty cart, return cart id and empty cart body.
   */
  app.post(
    '/carts',
    {
      schema: {
        response: { 201: CartSchema },
      },
    },
    async (_req, _reply) => {
      // TODO(week-2): generate UUID, write empty cart to Redis with 7d TTL, return.
      throw new Error('not implemented — see PLAN.md week 2');
    },
  );

  /**
   * GET /carts/:id → return current cart state.
   */
  // TODO(week-2): app.get('/carts/:id', { schema: { params: _CartIdParams, response: { 200: CartSchema } } }, ...)

  /**
   * POST /carts/:id/items → add a line item.
   */
  // TODO(week-2): validate item exists in ERPNext, append/merge line, refresh TTL.

  /**
   * PATCH /carts/:id/items/:itemCode → update qty.
   */
  // TODO(week-2)

  /**
   * DELETE /carts/:id/items/:itemCode → remove a line.
   */
  // TODO(week-2)
}
