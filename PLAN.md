# PLAN.md — fresh-platform build plan

This is the build sequence. It assumes one builder (you + Claude Code) working roughly half-time. Each week ships something demonstrable. Don't skip ahead.

## Week 0 — Foundations (this scaffold)

**Goal**: clone the repo, run it locally, deploy an empty service to GCP, point Claude Code at it.

- [x] Repo scaffolded with this constitution
- [ ] You: create GitHub repo, push this scaffold
- [ ] You: sign up for Frappe Cloud (free tier), create a sandbox ERPNext site
- [ ] You: create GCP project, enable APIs (Cloud Run, Cloud SQL, Memorystore, Pub/Sub, Artifact Registry, Secret Manager)
- [ ] Claude Code: complete the Terraform — fill in the variables, test `terraform plan`
- [ ] Deploy a "hello world" `commerce-api` to Cloud Run
- [ ] Verify GitHub Actions deploys on push to `main`

**Done when**: pushing a comment change to `services/commerce-api/src/server.ts` causes a redeploy in GCP.

---

## Week 1 — ERPNext as catalog

**Goal**: a customer can browse the catalog. Items are managed in ERPNext.

- [ ] In ERPNext: create the chart of accounts (Kenya), create one warehouse, enable Item Batch + Expiry features
- [ ] In ERPNext: create 20 test items with batches, expiry dates, prices in KES
- [ ] commerce-api: implement the ERPNext client (`plugins/erpnext.ts`) — auth, retries, pagination, error mapping
- [ ] commerce-api: `GET /catalog` route — read from ERPNext, cache in Redis with a 5-min TTL
- [ ] commerce-api: `GET /catalog/:item_code` route — single item with batch info (next-to-expire batch surfaced)
- [ ] commerce-api: webhook receiver for ERPNext item updates — invalidates the cache
- [ ] Tests: catalog cache hit/miss/invalidation

**Done when**: a curl to `/catalog` returns a list of items from ERPNext, and editing an item in ERPNext reflects within a minute.

---

## Week 2 — Cart state

**Goal**: a customer can add and remove items from a cart. Cart is anonymous (no login required).

- [ ] commerce-api: `POST /carts` — creates a cart, returns a cart token (UUID stored in Redis)
- [ ] commerce-api: `POST /carts/:id/items` — add an item (validates against ERPNext stock + status)
- [ ] commerce-api: `PATCH /carts/:id/items/:item_code` — update qty
- [ ] commerce-api: `DELETE /carts/:id/items/:item_code`
- [ ] commerce-api: `GET /carts/:id` — returns cart with prices fetched live from ERPNext (or cache)
- [ ] Tests: cart lifecycle, stock validation, expired cart cleanup

**Done when**: you can build up a cart via curl and read it back. Cart expires after 7 days idle.

---

## Week 3 — Checkout (Quotation flow)

**Goal**: a customer enters address + phone, gets a quote with totals from ERPNext.

- [ ] commerce-api: `POST /carts/:id/checkout` — creates ERPNext Quotation with cart items, returns totals + quotation id
- [ ] commerce-api: capture shipping address on the cart (free-form for v1, structured later)
- [ ] commerce-api: shipping cost — flat rate for v1, configurable in ERPNext as a Shipping Rule
- [ ] Tests: quotation creation, total reconciliation

**Done when**: `POST /checkout` returns subtotal, shipping, tax, grand total — all calculated by ERPNext.

---

## Week 4 — M-Pesa STK push

**Goal**: a customer pays. On success, the Quotation becomes a Sales Order in ERPNext.

- [ ] commerce-api: `POST /carts/:id/pay` — initiates Daraja STK push, returns a payment session id
- [ ] commerce-api: `POST /webhooks/mpesa` — Daraja callback, validates signature, marks payment record paid
- [ ] commerce-api: `GET /payments/:id` — storefront polls this for status
- [ ] commerce-api: on `payment.confirmed`, convert Quotation → Sales Order in ERPNext (with idempotency key)
- [ ] commerce-api: on `payment.failed`, leave Quotation as-is, return error
- [ ] Pub/Sub: publish `order.placed` after Sales Order created, `payment.confirmed` after payment
- [ ] Tests: STK push happy path, callback signature validation, idempotency on retry, race between callback and poll

**Done when**: end-to-end flow works on the Daraja sandbox — phone gets a prompt, you enter PIN, the API confirms within ~10 seconds, Sales Order shows up in ERPNext.

---

## Week 5 — Customer auth

**Goal**: customers can register, log in, see their order history.

- [ ] commerce-api: `POST /auth/register` — email + password, creates ERPNext Customer, returns JWT
- [ ] commerce-api: `POST /auth/login` — JWT
- [ ] commerce-api: `GET /me` — current customer profile (read-through from ERPNext)
- [ ] commerce-api: `GET /me/orders` — customer's Sales Orders from ERPNext
- [ ] commerce-api: `PATCH /me` — update name, phone, addresses (writes to ERPNext)
- [ ] Cart: support attaching a logged-in customer to an anonymous cart
- [ ] Tests: register/login/refresh, JWT validation, customer-cart linking

**Done when**: storefront can register and log in a real customer, and order history shows up.

---

## Week 6 — Storefront integration

**Goal**: the Flutter storefront is repointed at commerce-api. End-to-end purchase from app works.

- [ ] Storefront repo: replace Medusa client with commerce-api client
- [ ] Storefront repo: update Product, Cart, Order models to match commerce-api schemas
- [ ] Storefront repo: surface fresh-food fields (shelf life, supplier, organic) on PDP
- [ ] Storefront repo: rewrite M-Pesa screen to use real STK push + status polling (no fake `Future.delayed`)
- [ ] Storefront repo: idempotency keys on checkout
- [ ] Storefront repo: 401 handling in Dio interceptor

**Done when**: a real human can install the Android APK, register, browse, add to cart, pay with M-Pesa sandbox, see their order.

---

## Week 7 — Notifications + analytics

**Goal**: customers get SMS confirmations. Order events flow to BigQuery.

- [ ] New service or scheduled function: `sms-notifier` subscribes to `order.placed` + `shipment.dispatched`, sends SMS via Africa's Talking
- [ ] BigQuery sink subscribed to all topics — flat tables for analytics
- [ ] Simple Looker Studio dashboard: orders/day, revenue/day, top items

**Done when**: placing an order fires an SMS within 30s and a row appears in BigQuery.

---

## Week 8 — Hardening

**Goal**: handle the unhappy paths.

- [ ] Rate limiting on commerce-api (Cloud Armor or Fastify plugin)
- [ ] Structured logging with trace ids — request id flows from Flutter through commerce-api to ERPNext
- [ ] Error budget alerting: > 1% 5xx for 5 min triggers PagerDuty/email
- [ ] Backup verification: Cloud SQL backups restorable; ERPNext backups via Frappe Cloud
- [ ] Load test: 100 concurrent users on the catalog page, p95 < 300ms
- [ ] Security review: secrets in Secret Manager only, no leaks in logs, JWT secret rotation plan

**Done when**: a chaos test (kill the cache, kill the DB connection, return 500 from ERPNext) doesn't crash the service — it degrades gracefully.

---

## After week 8

These are the next things you'll want, in rough priority:

1. **A small custom admin** for things ERPNext does poorly: home-page banners, featured collections, M-Pesa transaction reconciliation
2. **Loyalty / member tiers** — likely Customer Groups in ERPNext + a price list per group
3. **Delivery slot booking** — capacity management for fresh-food delivery windows
4. **Multi-warehouse routing** — pick the right warehouse based on delivery zone
5. **Nexus AI agents** — read from BigQuery, act through commerce-api endpoints

Each of these gets its own ADR and slice plan. Don't start any of them in the first 8 weeks.

---

## Definition of done (per slice)

- [ ] Code merged to `main` via PR with one approver
- [ ] CI green (lint, type-check, unit tests, integration tests)
- [ ] At least one new test for the new behaviour
- [ ] Deployed to GCP via the auto-deploy workflow
- [ ] Smoke-tested in deployed environment (curl the new endpoint)
- [ ] If user-facing: storefront integration ticket created
- [ ] If architectural: ADR added to `docs/decisions/`
