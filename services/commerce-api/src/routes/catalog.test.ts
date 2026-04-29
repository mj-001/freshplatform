import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import catalogRoutes from './catalog.js';
import { errorHandler } from '../lib/errors.js';
import type { CatalogItem, ErpNextClient } from '../plugins/erpnext.js';

/**
 * Reference test for the cache+ERPNext pattern. This is the template every
 * route test should follow:
 *   - Build a minimal Fastify app with mock plugins
 *   - Mock at the boundary (ERPNext client, Redis client)
 *   - Assert behaviour, not implementation
 */

function buildTestApp(opts: {
  erpnext: ErpNextClient;
  redis: { get: ReturnType<typeof vi.fn>; setEx: ReturnType<typeof vi.fn> };
}): FastifyInstance {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.decorate('erpnext', opts.erpnext as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.decorate('redis', opts.redis as any);
  void app.register(catalogRoutes);
  return app;
}

const sampleItem: CatalogItem = {
  itemCode: 'MANGO-APPLE-1KG',
  name: 'Apple Mango (1kg)',
  uom: 'Kg',
  hasBatch: true,
  hasExpiry: true,
  shelfLifeDays: 5,
  countryOfOrigin: 'Kenya',
  priceCents: 25000,
};

describe('GET /catalog', () => {
  let app: FastifyInstance;
  const listItems = vi.fn();
  const redisGet = vi.fn();
  const redisSetEx = vi.fn();

  beforeAll(async () => {
    app = buildTestApp({
      erpnext: { listItems, getItem: vi.fn(), createQuotation: vi.fn(), submitQuotationAsSalesOrder: vi.fn() },
      redis: { get: redisGet, setEx: redisSetEx },
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves from cache when available', async () => {
    redisGet.mockResolvedValueOnce(JSON.stringify({ items: [sampleItem], total: 1 }));

    const res = await app.inject({ method: 'GET', url: '/catalog' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items: [sampleItem], total: 1 });
    expect(listItems).not.toHaveBeenCalled();
  });

  it('falls through to ERPNext on cache miss and populates cache', async () => {
    redisGet.mockResolvedValueOnce(null);
    listItems.mockResolvedValueOnce([sampleItem]);
    redisSetEx.mockResolvedValueOnce('OK');

    const res = await app.inject({ method: 'GET', url: '/catalog' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items: [sampleItem], total: 1 });
    expect(listItems).toHaveBeenCalledOnce();
    expect(redisSetEx).toHaveBeenCalledOnce();
  });
});

describe('GET /catalog/:itemCode', () => {
  let app: FastifyInstance;
  const getItem = vi.fn();
  const redisGet = vi.fn();
  const redisSetEx = vi.fn();

  beforeAll(async () => {
    app = buildTestApp({
      erpnext: { listItems: vi.fn(), getItem, createQuotation: vi.fn(), submitQuotationAsSalesOrder: vi.fn() },
      redis: { get: redisGet, setEx: redisSetEx },
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 404 when item does not exist', async () => {
    redisGet.mockResolvedValueOnce(null);
    getItem.mockResolvedValueOnce(null);

    const res = await app.inject({ method: 'GET', url: '/catalog/NOPE' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Item NOPE not found' },
    });
  });

  it('returns the item from ERPNext on cache miss', async () => {
    redisGet.mockResolvedValueOnce(null);
    getItem.mockResolvedValueOnce(sampleItem);
    redisSetEx.mockResolvedValueOnce('OK');

    const res = await app.inject({ method: 'GET', url: '/catalog/MANGO-APPLE-1KG' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(sampleItem);
  });
});
