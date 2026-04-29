import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { AppError, ErrorCodes } from '../lib/errors.js';
import type { CatalogItem } from '../plugins/erpnext.js';

const CACHE_KEY_LIST = 'catalog:list';
const CACHE_KEY_ITEM = (code: string) => `catalog:item:${code}`;
const CACHE_TTL_SECONDS = 300; // 5 minutes

const CatalogItemSchema = z.object({
  itemCode: z.string(),
  name: z.string(),
  group: z.string().optional(),
  description: z.string().optional(),
  uom: z.string(),
  hasBatch: z.boolean(),
  hasExpiry: z.boolean(),
  shelfLifeDays: z.number().int().optional(),
  countryOfOrigin: z.string().optional(),
  imageUrl: z.string().optional(),
  priceCents: z.number().int().nonnegative(),
});

const ListResponseSchema = z.object({
  items: z.array(CatalogItemSchema),
  total: z.number().int().nonnegative(),
});

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const ItemParamsSchema = z.object({
  itemCode: z.string().min(1),
});

export default async function catalogRoutes(app: FastifyInstance) {
  app.get(
    '/catalog',
    {
      schema: {
        querystring: ListQuerySchema,
        response: { 200: ListResponseSchema },
      },
    },
    async (req) => {
      const { limit, offset } = req.query;
      const cacheKey = `${CACHE_KEY_LIST}:${limit}:${offset}`;

      const cached = await app.redis.get(cacheKey);
      if (cached) {
        app.log.debug({ cacheKey }, 'catalog cache hit');
        return JSON.parse(cached) as { items: CatalogItem[]; total: number };
      }

      const items = await app.erpnext.listItems({ limit, offset });
      const payload = { items, total: items.length };
      await app.redis.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(payload));
      app.log.debug({ cacheKey, count: items.length }, 'catalog cache miss → populated');
      return payload;
    },
  );

  app.get(
    '/catalog/:itemCode',
    {
      schema: {
        params: ItemParamsSchema,
        response: { 200: CatalogItemSchema },
      },
    },
    async (req) => {
      const { itemCode } = req.params;
      const cacheKey = CACHE_KEY_ITEM(itemCode);

      const cached = await app.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as CatalogItem;
      }

      const item = await app.erpnext.getItem(itemCode);
      if (!item) {
        throw new AppError(ErrorCodes.NOT_FOUND, `Item ${itemCode} not found`, 404);
      }

      await app.redis.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(item));
      return item;
    },
  );
}
