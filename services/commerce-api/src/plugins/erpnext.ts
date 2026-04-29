import { request } from 'undici';
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, ErrorCodes } from '../lib/errors.js';

/**
 * ERPNext client. The ONLY place in commerce-api that talks to ERPNext.
 *
 * Why a single client?
 *   - Centralizes auth, retries, logging, error mapping
 *   - Hides ERPNext's quirks (snake_case, decimal-string money, etc.)
 *   - Gives us a single seam to mock in tests
 *
 * Money: ERPNext returns decimal strings (e.g. "1234.50"). We convert to integer cents
 * at this boundary so the rest of the codebase only ever sees integers.
 */

// ----- Wire types (what ERPNext returns) -----------------------------------

const ErpItemRaw = z.object({
  name: z.string(),                    // ERPNext's primary key, e.g. "ITEM-0001"
  item_code: z.string(),
  item_name: z.string(),
  item_group: z.string().optional(),
  description: z.string().nullable().optional(),
  stock_uom: z.string().optional(),
  has_batch_no: z.union([z.literal(0), z.literal(1)]).optional(),
  has_expiry_date: z.union([z.literal(0), z.literal(1)]).optional(),
  shelf_life_in_days: z.number().int().nullable().optional(),
  country_of_origin: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  disabled: z.union([z.literal(0), z.literal(1)]).optional(),
  // standard_rate is in the company currency, as a decimal string
  standard_rate: z.union([z.string(), z.number()]).optional(),
});

const ErpQuotationRaw = z.object({
  name: z.string(),
  customer: z.string().optional(),
  total: z.union([z.string(), z.number()]),
  net_total: z.union([z.string(), z.number()]),
  total_taxes_and_charges: z.union([z.string(), z.number()]).optional(),
  grand_total: z.union([z.string(), z.number()]),
  currency: z.string(),
  status: z.string(),
});

// ----- Domain types (what the rest of the app sees) -------------------------

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
  /** Price in cents (integer). */
  priceCents: number;
}

export interface QuotationLine {
  itemCode: string;
  qty: number;
}

export interface Quotation {
  id: string;
  customer?: string;
  /** All amounts in cents. */
  netTotalCents: number;
  taxCents: number;
  grandTotalCents: number;
  currency: string;
  status: string;
}

// ----- Client ---------------------------------------------------------------

export interface ErpNextClient {
  listItems(params?: { limit?: number; offset?: number }): Promise<CatalogItem[]>;
  getItem(itemCode: string): Promise<CatalogItem | null>;
  createQuotation(input: {
    customer?: string;
    items: QuotationLine[];
    shippingZone?: string;
  }): Promise<Quotation>;
  submitQuotationAsSalesOrder(quotationId: string, idempotencyKey: string): Promise<{ salesOrderId: string }>;
}

declare module 'fastify' {
  interface FastifyInstance {
    erpnext: ErpNextClient;
  }
}

// ----- Plugin ---------------------------------------------------------------

interface PluginOptions {
  url: string;
  apiKey: string;
  apiSecret: string;
}

const erpnextPlugin = fp<PluginOptions>(
  async (app: FastifyInstance, opts: PluginOptions) => {
    const { url, apiKey, apiSecret } = opts;
    const baseUrl = url.replace(/\/+$/, '');
    const authHeader = `token ${apiKey}:${apiSecret}`;

    async function call<T>(
      method: 'GET' | 'POST' | 'PUT',
      path: string,
      options: { query?: Record<string, string | number>; body?: unknown; idempotencyKey?: string } = {},
    ): Promise<T> {
      const qs = options.query
        ? '?' + new URLSearchParams(
            Object.entries(options.query).map(([k, v]) => [k, String(v)]),
          ).toString()
        : '';
      const fullUrl = `${baseUrl}${path}${qs}`;
      const headers: Record<string, string> = {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      if (options.idempotencyKey) {
        headers['X-Idempotency-Key'] = options.idempotencyKey;
      }
      const start = Date.now();
      try {
        const res = await request(fullUrl, {
          method,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          headersTimeout: 15_000,
          bodyTimeout: 30_000,
        });
        const duration = Date.now() - start;
        const text = await res.body.text();
        app.log.info({ erpnext: { method, path, status: res.statusCode, duration } }, 'erpnext call');

        if (res.statusCode >= 500) {
          throw new AppError(
            ErrorCodes.ERPNEXT_UNAVAILABLE,
            `ERPNext ${method} ${path} failed with ${res.statusCode}`,
            502,
            { body: text.slice(0, 500) },
          );
        }
        if (res.statusCode === 404) {
          // Caller decides if 404 is fatal or expected.
          throw new AppError(ErrorCodes.NOT_FOUND, `ERPNext resource not found: ${path}`, 404);
        }
        if (res.statusCode >= 400) {
          throw new AppError(
            ErrorCodes.ERPNEXT_BAD_RESPONSE,
            `ERPNext ${method} ${path} returned ${res.statusCode}`,
            502,
            { body: text.slice(0, 500) },
          );
        }
        return JSON.parse(text) as T;
      } catch (err) {
        if (err instanceof AppError) throw err;
        const duration = Date.now() - start;
        app.log.error({ err, erpnext: { method, path, duration } }, 'erpnext network error');
        throw new AppError(
          ErrorCodes.ERPNEXT_UNAVAILABLE,
          `ERPNext network error: ${(err as Error).message}`,
          502,
        );
      }
    }

    /** Convert ERPNext's decimal money string to integer cents. */
    function toCents(value: string | number): number {
      const num = typeof value === 'number' ? value : parseFloat(value);
      if (Number.isNaN(num)) {
        throw new AppError(ErrorCodes.ERPNEXT_BAD_RESPONSE, `Invalid money value: ${value}`, 502);
      }
      return Math.round(num * 100);
    }

    function transformItem(raw: unknown): CatalogItem {
      const parsed = ErpItemRaw.parse(raw);
      const result: CatalogItem = {
        itemCode: parsed.item_code,
        name: parsed.item_name,
        uom: parsed.stock_uom ?? 'Nos',
        hasBatch: parsed.has_batch_no === 1,
        hasExpiry: parsed.has_expiry_date === 1,
        priceCents: parsed.standard_rate ? toCents(parsed.standard_rate) : 0,
      };
      if (parsed.item_group) result.group = parsed.item_group;
      if (parsed.description) result.description = parsed.description;
      if (parsed.shelf_life_in_days) result.shelfLifeDays = parsed.shelf_life_in_days;
      if (parsed.country_of_origin) result.countryOfOrigin = parsed.country_of_origin;
      if (parsed.image) result.imageUrl = parsed.image;
      return result;
    }

    const client: ErpNextClient = {
      async listItems({ limit = 50, offset = 0 } = {}) {
        const fields = JSON.stringify([
          'name', 'item_code', 'item_name', 'item_group', 'description',
          'stock_uom', 'has_batch_no', 'has_expiry_date', 'shelf_life_in_days',
          'country_of_origin', 'image', 'disabled', 'standard_rate',
        ]);
        const filters = JSON.stringify([['disabled', '=', 0]]);
        const data = await call<{ data: unknown[] }>('GET', '/api/resource/Item', {
          query: { fields, filters, limit_page_length: limit, limit_start: offset },
        });
        return data.data.map(transformItem);
      },

      async getItem(itemCode) {
        try {
          const data = await call<{ data: unknown }>('GET', `/api/resource/Item/${encodeURIComponent(itemCode)}`);
          return transformItem(data.data);
        } catch (err) {
          if (err instanceof AppError && err.code === ErrorCodes.NOT_FOUND) return null;
          throw err;
        }
      },

      async createQuotation({ customer, items, shippingZone }) {
        const body = {
          quotation_to: customer ? 'Customer' : 'Lead',
          ...(customer ? { party_name: customer } : {}),
          ...(shippingZone ? { shipping_zone: shippingZone } : {}),
          items: items.map((line) => ({ item_code: line.itemCode, qty: line.qty })),
        };
        const data = await call<{ data: unknown }>('POST', '/api/resource/Quotation', { body });
        const parsed = ErpQuotationRaw.parse(data.data);
        return {
          id: parsed.name,
          ...(parsed.customer ? { customer: parsed.customer } : {}),
          netTotalCents: toCents(parsed.net_total),
          taxCents: parsed.total_taxes_and_charges ? toCents(parsed.total_taxes_and_charges) : 0,
          grandTotalCents: toCents(parsed.grand_total),
          currency: parsed.currency,
          status: parsed.status,
        };
      },

      async submitQuotationAsSalesOrder(quotationId, idempotencyKey) {
        const data = await call<{ message: { name: string } }>(
          'POST',
          '/api/method/erpnext.selling.doctype.quotation.quotation.make_sales_order',
          {
            body: { source_name: quotationId },
            idempotencyKey,
          },
        );
        return { salesOrderId: data.message.name };
      },
    };

    app.decorate('erpnext', client);
  },
  { name: 'erpnext' },
);

export default erpnextPlugin;
