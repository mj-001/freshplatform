# services/commerce-api — CLAUDE.md

> The root `/CLAUDE.md` is the constitution. This file scopes Claude Code's behaviour when working **inside `services/commerce-api/`**. It does not override the root, it refines it.

## Scope of this service

commerce-api is a thin orchestration layer between the Flutter storefront and ERPNext. It owns:

- Anonymous cart state (Redis)
- Catalog cache (Redis, read-through from ERPNext)
- Customer auth credentials (Postgres: `customers_auth`)
- M-Pesa transaction logs (Postgres: `mpesa_transactions`)
- Idempotency keys (Postgres: `idempotency_keys`)

It does NOT own: products, batches, inventory, suppliers, orders, invoices, accounting. Those live in ERPNext.

## File layout

```
src/
├── server.ts                 # entry point, Fastify bootstrap
├── config.ts                 # env validation with Zod
├── plugins/
│   ├── erpnext.ts            # the only place that talks to ERPNext
│   ├── redis.ts              # Redis client
│   ├── pubsub.ts             # GCP Pub/Sub publisher
│   ├── postgres.ts           # Postgres client
│   └── auth.ts               # JWT plugin
├── routes/
│   ├── health.ts             # GET /health
│   ├── catalog.ts            # GET /catalog, GET /catalog/:item_code
│   ├── carts.ts              # POST /carts, GET /carts/:id, etc.
│   ├── checkout.ts           # POST /carts/:id/checkout, /pay
│   ├── auth.ts               # POST /auth/register, /login
│   ├── me.ts                 # GET/PATCH /me, GET /me/orders
│   └── webhooks/
│       ├── mpesa.ts          # POST /webhooks/mpesa
│       └── erpnext.ts        # POST /webhooks/erpnext
├── domain/
│   ├── catalog/              # cache logic, item shape transforms
│   ├── cart/                 # cart state operations on Redis
│   └── mpesa/                # Daraja STK push + signature validation
└── lib/
    ├── logger.ts
    ├── errors.ts             # AppError + Fastify error handler
    ├── idempotency.ts        # idempotency key middleware
    └── phone.ts              # phone normalization (254XXXXXXXXX)
```

Tests live next to source: `routes/catalog.ts` → `routes/catalog.test.ts`. Integration tests in `test/`.

## Patterns

### Adding a route

1. Define request and response Zod schemas at the top of the file
2. Export a Fastify plugin function: `export default async function (app: FastifyInstance) { ... }`
3. Register routes inside the plugin
4. Wire it into `server.ts` with `app.register(...)`

Example skeleton:

```ts
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';

const ParamsSchema = z.object({ id: z.string() });
const ResponseSchema = z.object({ id: z.string(), foo: z.string() });

export default async function (app: FastifyInstance) {
  app.get('/things/:id', {
    schema: {
      params: ParamsSchema,
      response: { 200: ResponseSchema },
    },
  }, async (req) => {
    const { id } = req.params;
    // do the work
    return { id, foo: 'bar' };
  });
}
```

### Talking to ERPNext

Always go through `plugins/erpnext.ts`. The client exposes typed methods:

```ts
const items = await app.erpnext.listItems({ limit: 50 });
const quote = await app.erpnext.createQuotation({ customer, items });
```

If you need a method the client doesn't have, add it to the client. Do NOT call ERPNext directly from a route.

### Publishing events

```ts
await app.pubsub.publish('order.placed', { orderId, customerId, total });
```

Topics are declared in `plugins/pubsub.ts`. Adding a new topic requires an ADR.

### Idempotency

Mutating endpoints (anything that creates an ERPNext document, sends an SMS, initiates a payment) accept an `Idempotency-Key` header. Use the helper:

```ts
const result = await app.idempotent(req.headers['idempotency-key'], async () => {
  return await doTheThing();
});
```

The first call executes; subsequent calls with the same key return the stored result.

### Error handling

Throw structured errors:

```ts
throw new AppError('CART_NOT_FOUND', `Cart ${id} not found`, 404);
```

The Fastify error handler maps these to HTTP responses with a stable error code shape:

```json
{ "error": { "code": "CART_NOT_FOUND", "message": "..." } }
```

Never throw raw `Error`. Never return error responses by `reply.code(400).send(...)` — throw and let the handler do it.

## Forbidden patterns

- Adding a `products`, `orders`, `inventory`, or `customers` table to Postgres (those live in ERPNext)
- Importing the ERPNext client from anywhere except other plugins or routes (no domain code talking to ERPNext directly — pass the client in)
- `console.log` (use `req.log` or `app.log`)
- Catching errors just to swallow them (catch only to add context, then re-throw)
- Top-level side effects in modules (no DB connections at import time)
- Magic strings for topic names, error codes, or route paths — define them as constants

## Test conventions

- Unit tests mock at the ERPNext-client and Pub/Sub-publisher boundaries
- Integration tests run against `docker compose` services and a real ERPNext sandbox URL
- Every route has at least one happy-path test and one failure-path test
- Coverage threshold: 70% lines, 65% branches (CI enforced)

Run: `pnpm test` or `pnpm test:watch`.
