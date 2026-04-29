# fresh-platform — CLAUDE.md

You are working on **fresh-platform**, a fresh-food commerce platform.

The working name is `fresh-platform`. A real brand will be chosen at launch. Do NOT bake brand-specific names, copy, or assumptions into the codebase. Use environment configuration (e.g. `BRAND_NAME`, `SUPPORT_EMAIL`) wherever a brand string is needed.

This file is the constitution. Read it fully before reading anything else. Do not contradict it. If you think it should change, propose the change in chat — do not silently deviate.

---

## What this is

A fresh-food (perishable goods) commerce platform built around three principles:

1. **ERPNext is the system of record** for products, inventory, suppliers, customers, orders, payments, and accounting. We do NOT replicate this data in our own service.
2. **commerce-api is a thin orchestration layer** between the storefront and ERPNext. It owns customer-facing concerns: catalog presentation, anonymous cart state, customer auth, M-Pesa orchestration. It owns NO commerce primitives.
3. **GCP Pub/Sub is the event spine.** Asynchronous fan-out (notifications, analytics, future agents) hangs off events, not point-to-point HTTP.

Anything that doesn't fit these three principles needs explicit discussion before being built.

---

## Repo Structure

```
fresh-platform/
├── CLAUDE.md                      # this file — the constitution
├── README.md                      # setup + run + deploy
├── PLAN.md                        # week-by-week build plan
├── docker-compose.yml             # local dev: postgres + redis + pubsub emulator
├── package.json                   # pnpm workspaces root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── services/
│   └── commerce-api/              # the only custom service
│       ├── CLAUDE.md              # service-specific rules
│       ├── src/
│       ├── test/
│       ├── migrations/
│       └── Dockerfile
├── packages/
│   └── shared-types/              # TS types shared with the storefront repo
├── infra/
│   ├── terraform/                 # one terraform apply provisions everything
│   └── docker/                    # build configs
├── docs/
│   ├── architecture.md            # full architecture
│   ├── erpnext-setup.md           # how to configure Frappe Cloud
│   └── decisions/                 # ADRs
└── .github/workflows/             # CI + deploy
```

The Flutter storefront lives in a **separate repo** (`fresh-platform-storefront`) that depends on `@fresh-platform/shared-types`. Do not put Flutter code in this repo.

---

## Hard Architectural Rules

These are non-negotiable. Violations require an ADR (`docs/decisions/`) and explicit chat approval.

### 1. ERPNext owns commerce primitives

| Concept | Lives in |
|---|---|
| Items, batches, expiry dates | ERPNext |
| Warehouses, stock levels, FEFO | ERPNext |
| Suppliers, purchase orders | ERPNext |
| Customers (master record) | ERPNext |
| Quotations, sales orders, invoices | ERPNext |
| Payment entries, accounting | ERPNext |
| Customer auth credentials (email + password hash) | commerce-api Postgres |
| Anonymous cart state | commerce-api Redis |
| Catalog cache (read-through from ERPNext) | commerce-api Redis |
| M-Pesa transaction logs (raw callbacks) | commerce-api Postgres |

If you find yourself adding a `products` table or an `orders` table to commerce-api, stop. That data belongs in ERPNext.

### 2. Cart math is delegated to ERPNext

When the customer checks out, commerce-api creates an **ERPNext Quotation** with the cart items, gets back the totals (subtotal, tax, shipping, grand total), and shows them to the user. We do NOT compute taxes, discounts, or totals ourselves. On payment success, the Quotation is converted to a **Sales Order**, which deducts inventory and posts to the ledger.

Cart state in Redis is just `{ items: [{ item_code, qty }], customer_id?: string, shipping_address?: {...} }`. No prices, no totals, no math.

### 3. ERPNext is hit through one client

All ERPNext calls go through `services/commerce-api/src/plugins/erpnext.ts`. No exceptions. The client handles auth, retries, error mapping, and idempotency. Routes never make raw HTTP calls to ERPNext.

### 4. Events flow through Pub/Sub, not direct HTTP

When commerce-api needs to notify another consumer (SMS, analytics, cache invalidator, future agents), it publishes to a Pub/Sub topic. It does NOT call those consumers directly. Topics:

- `catalog.updated` — published by ERPNext webhook handler when items change
- `order.placed` — published by commerce-api after Sales Order creation
- `payment.confirmed` — published after M-Pesa confirms
- `payment.failed` — published on M-Pesa failure or timeout
- `shipment.dispatched` — published when ERPNext marks delivery dispatched

Add new topics by ADR. Do not add ad-hoc.

### 5. Idempotency is mandatory for non-idempotent operations

Anything that creates an ERPNext document, sends an SMS, or initiates a payment requires an idempotency key. The client generates a UUID; the server stores it and returns the previous result on retry. Implementation lives in `src/lib/idempotency.ts`.

### 6. Money is integers in cents (KES smallest unit)

Never use floats for money. The Flutter storefront and commerce-api both serialize money as integer cents. ERPNext returns decimal strings — convert at the boundary in the ERPNext client.

### 7. Phone numbers normalize at the boundary

Daraja requires `254XXXXXXXXX`. The UI may display `+254 7XX XXX XXX`. commerce-api normalizes on every write. Bare digits, no spaces, leading `254`. Validation lives in `src/lib/phone.ts`.

---

## Tech Choices (locked)

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js 22 LTS | |
| Language | TypeScript 5.x strict | |
| Web framework | Fastify 5 | |
| Validation | Zod | with `fastify-type-provider-zod` |
| HTTP client | undici | built-in, plus retry wrapper |
| DB | Postgres 16 | one DB, owned by commerce-api |
| DB client | postgres (porsager/postgres) | no ORM |
| Migrations | node-pg-migrate | |
| Cache + cart | Redis 7 | Memorystore in prod |
| Auth | JWT via jose | bcrypt for password hash |
| Logging | pino | Fastify default |
| Tests | Vitest + supertest | |
| Package manager | pnpm 9 | workspaces |
| Container | Distroless Node | multi-stage Dockerfile |
| Infra | Terraform | GCP only |
| CI/CD | GitHub Actions | |

Do NOT propose: Express, NestJS, Prisma, TypeORM, Sequelize, Drizzle, Mongoose, MongoDB, RabbitMQ, Kafka, Yarn, npm workspaces, Jest.

---

## Coding Conventions

- **TypeScript strict mode is on.** No `any`, no `!` non-null assertion without a comment justifying it.
- **All env vars are validated with Zod at startup.** Missing or malformed env = process exits with code 1. No optional chaining around config.
- **Schemas live next to routes.** `src/routes/checkout.ts` exports its own request/response schemas. Don't centralize schemas in a `schemas/` directory.
- **No barrel files** (`index.ts` re-exporting siblings). Import from the actual module.
- **Async/await everywhere.** No `.then()` chains except in legacy library callbacks.
- **Errors are structured.** Throw `AppError` from `src/lib/errors.ts` with a code (`CART_NOT_FOUND`, `ERPNEXT_UNAVAILABLE`, etc.). Fastify error handler maps codes to HTTP statuses.
- **Logging at info level on every external call** (ERPNext, Daraja, Pub/Sub) with duration and outcome.
- **Tests next to source**: `src/routes/catalog.ts` → `src/routes/catalog.test.ts`. The `test/` dir is for integration tests only.
- **File names: kebab-case.** Class/type names: PascalCase. Function names: camelCase.
- **Conventional commits.** `feat(commerce-api): add cart line item route`.

---

## Build / Run / Deploy

### Local dev

```bash
pnpm install
docker compose up -d                # postgres + redis + pubsub emulator
cp .env.example .env                # fill in ERPNEXT_API_KEY etc.
pnpm --filter commerce-api dev      # http://localhost:8080
```

### CI

GitHub Actions runs on every PR: `pnpm install`, `pnpm lint`, `pnpm test`, `pnpm build`. PRs that fail CI cannot merge.

### Deploy

`main` branch deploys automatically to GCP via `.github/workflows/deploy-commerce-api.yml`:
1. Build container, push to Artifact Registry
2. Deploy to Cloud Run
3. Run migrations against Cloud SQL

Manual rollback: redeploy the previous container tag from Artifact Registry.

### Infrastructure

Provisioned by Terraform in `infra/terraform/`. One `terraform apply` provisions:
- Cloud Run service for commerce-api
- Cloud SQL Postgres (db-f1-micro for dev, db-custom-2-7680 for prod)
- Memorystore Redis
- Pub/Sub topics + subscriptions
- Secret Manager entries
- Service accounts with least privilege
- Artifact Registry repository

Region: `africa-south1` only. Latency to Nairobi is the deciding factor.

---

## How to work in this repo

### Vertical slices

A slice ships a feature end-to-end. For commerce-api: route + ERPNext call + tests + (if relevant) Pub/Sub publish + storefront type update + docs entry. Resist building horizontal layers ("all routes first, then auth, then tests").

### Branching

- One branch per slice: `slice/catalog-cache`, `slice/checkout-quotation-flow`.
- PRs require: passing CI, one example test for the new code, no decrease in coverage.

### Tests

Run `pnpm test` before declaring a slice done. Integration tests use `docker compose` services + a real ERPNext sandbox URL (provided in `.env.test`). Unit tests mock at the ERPNext client boundary.

### What to ask vs just do

**Just do:**
- Routine code edits, refactors within a service, bug fixes, test additions
- Schema changes that follow established patterns
- Adding a new route that fits an existing pattern

**Ask first:**
- Adding a new dependency
- Touching the ERPNext client contract (its inputs/outputs)
- New Pub/Sub topics or subscriber wiring
- Anything that crosses a service boundary
- Anything in `infra/terraform/`
- Anything that contradicts this CLAUDE.md

---

## What gets pushed back on

If you propose any of these, expect to be told no:

- Adding a `products` or `orders` table to commerce-api Postgres
- Computing prices, taxes, or totals in commerce-api
- Calling ERPNext from a route directly (bypassing the client plugin)
- Adding RabbitMQ, Kafka, or any other message bus
- Introducing an ORM
- Building a custom admin UI before ERPNext's admin proves insufficient
- Hardcoding the brand name, support email, or any other tenant-specific string
- Adding a payment provider that isn't M-Pesa (Stripe, PayPal, etc.)
- Replacing Cloud Run with GKE or self-hosted Kubernetes
- Adding a frontend framework (React, Vue, Next.js) — the storefront is Flutter and lives elsewhere

---

## Out of scope (for now)

These are real future needs, just not now:

- Loyalty / member tiers — wait until ERPNext customer groups prove insufficient
- Multi-warehouse delivery routing — ERPNext warehouses + a delivery zone table is enough for v1
- AI agents (Nexus AI) — they hang off Pub/Sub later
- Multi-tenant brand support — single brand for now, abstract via env vars
- Internationalization — KES + English only at launch

Nothing on this list gets started without an ADR and an explicit greenlight.
