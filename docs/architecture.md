# Architecture

This is the long-form companion to `CLAUDE.md`. CLAUDE.md tells you what the rules are; this tells you why.

## The shape of the system

```
                                                       ┌──────────────────┐
                                                       │  Flutter         │
                                                       │  storefront      │
                                                       │  (separate repo) │
                                                       └────────┬─────────┘
                                                                │ HTTPS
                                                                ▼
   ┌───────────────────┐                  ┌────────────────────────────────────┐
   │                   │                  │                                    │
   │   ERPNext         │ ◄── REST/HTTP ── │   commerce-api  (Cloud Run)        │
   │   (Frappe Cloud)  │                  │   - catalog cache (Redis)          │
   │                   │ ── webhooks ──►  │   - cart state (Redis)             │
   │   System of       │                  │   - customer auth (Postgres)       │
   │   record          │                  │   - M-Pesa orchestration           │
   │                   │                  │                                    │
   └───────────────────┘                  └────────────┬───────────────────────┘
                                                       │
                                                       │ publish
                                                       ▼
                                         ┌─────────────────────────────────┐
                                         │   GCP Pub/Sub                   │
                                         │   catalog.updated               │
                                         │   order.placed                  │
                                         │   payment.confirmed / .failed   │
                                         │   shipment.dispatched           │
                                         └────┬────────────┬──────────┬────┘
                                              │            │          │
                                              ▼            ▼          ▼
                                       ┌──────────┐ ┌──────────┐ ┌──────────┐
                                       │ SMS      │ │ BigQuery │ │ Cache    │
                                       │ notifier │ │ sink     │ │ invalid  │
                                       └──────────┘ └──────────┘ └──────────┘
```

## Why ERPNext is the system of record

The fresh-food domain (perishability, lots, batches, expiry, multi-warehouse, supplier management, accounting) is exactly what ERPNext is built for. ERPNext's Item Batch + Expiry + FEFO are first-class features. We get:

- A real chart of accounts
- Multi-warehouse with stock transfers
- Purchase orders with supplier-side workflows
- Sales orders that deduct inventory and post journal entries automatically
- A working admin UI for ops staff
- A mobile app for receiving and stock-take

Building any of this from scratch is months of work. Replicating it in a Medusa fork is a permanent maintenance tax. ERPNext does it natively.

## Why commerce-api exists at all

ERPNext does NOT do well as a customer-facing storefront API:
- Its REST API exposes internal Frappe document semantics
- Auth is Frappe-style (key/secret), not customer JWTs
- It's not optimised for high-read traffic patterns (catalog browsing)
- It doesn't speak M-Pesa Daraja
- Its rate limits assume internal staff usage, not customer traffic spikes

commerce-api fills exactly this gap. It is **deliberately small**:
- Catalog cache (read-through, invalidated by ERPNext webhooks)
- Cart state (Redis, ephemeral, math delegated to ERPNext quotations)
- Customer auth (JWT, password hash in Postgres, profile in ERPNext)
- M-Pesa orchestration (STK push, callback handling, status polling)
- Idempotency layer (so retries are safe)

It does NOT:
- Compute prices, taxes, totals, or discounts (ERPNext does)
- Store products, batches, inventory, or orders (ERPNext does)
- Implement workflows, approvals, or accounting (ERPNext does)

If a feature seems to need the commerce-api to track product or order state, the answer is almost always "make ERPNext the source of truth and have commerce-api read from it."

## Why GCP Pub/Sub, not RabbitMQ

Earlier conversations went back and forth on this. The settled answer:

- We are committed to GCP for managed Postgres, managed Redis, BigQuery later, and Cloud Run.
- Pub/Sub is free at MVP scale, native to Cloud Run, scales to millions/sec without operator effort, and has a built-in BigQuery sink for the analytics tier we'll want.
- RabbitMQ is more flexible (routing topologies, custom dead-letter behaviour) but we don't need that flexibility yet, and self-hosting (or even CloudAMQP) is operational overhead we're avoiding.
- Pub/Sub's at-least-once delivery is fine because we make subscribers idempotent.

Adding RabbitMQ later, if Pub/Sub limits ever bite, is straightforward — the Pub/Sub publisher abstraction in `plugins/pubsub.ts` keeps the rest of the codebase decoupled from the broker choice.

## Why Cloud Run, not GKE

Cloud Run gives us:
- Scale-to-zero for dev environments (cost ~$0/month idle)
- Simple deploy story (`gcloud run deploy`)
- Automatic HTTPS + cert management
- No Kubernetes to operate

GKE is the right answer when we have ≥3 services that need to share pods, sidecars (Istio, Linkerd), or stateful workloads. We don't.

## Data ownership

| Concept | Source of truth | Cached/copied | Notes |
|---|---|---|---|
| Items / products | ERPNext | Redis (commerce-api) | TTL 5 min, invalidated by webhook |
| Item batches + expiry | ERPNext | — | Read live; never cached |
| Inventory levels | ERPNext | — | Read live; cart validation |
| Customer master | ERPNext | — | Read-through |
| Customer auth (email, password hash) | commerce-api Postgres | — | Never in ERPNext |
| Cart | commerce-api Redis | — | Ephemeral, 7-day TTL |
| Quotation | ERPNext | — | Created at /checkout |
| Sales Order | ERPNext | — | Created on payment success |
| Payment ledger | ERPNext | — | Sales Invoice + Payment Entry |
| M-Pesa raw transactions | commerce-api Postgres | — | For our reconciliation |
| Idempotency keys | commerce-api Postgres | — | 24h TTL |
| Analytics events | BigQuery | Pub/Sub messages | Subscribed via sink |

If a feature requires storing something not on this list, raise it.

## Failure modes

### ERPNext is down
- Catalog: serve from cache (5-min TTL). Stale but available.
- Cart writes: reject with 503; user sees "try again in a moment."
- Checkout: reject (we can't compute totals without ERPNext).
- Payments: existing in-flight payments still complete; new ones blocked.

### Redis is down
- Catalog: fall through to ERPNext. Slower but functional.
- Carts: lost. User must re-add items. Acceptable for v1.

### Postgres is down
- Auth: existing JWTs still validate. New logins/registrations blocked.
- M-Pesa: reject new payments. In-flight callbacks queue and retry.

### Pub/Sub is down
- commerce-api: continues to serve. Events queue locally up to a buffer, then drop with logged warnings.
- Subscribers (SMS, analytics): no events received. Backfill from ERPNext later.

## Observability

- Structured JSON logs to stdout, captured by Cloud Logging
- Trace ids propagated from Flutter → commerce-api → ERPNext
- p50/p95/p99 latency on every route via Fastify hooks
- Error rate alerts via Cloud Monitoring (>1% 5xx for 5 min → email)
- Per-endpoint timing dashboard in Looker Studio
- Pub/Sub dead-letter topic monitored — anything landing there is a bug

## Security

- All secrets in Secret Manager. Never in env files in prod. Never in logs.
- Service accounts with least privilege per service.
- VPC private connectivity from Cloud Run to Cloud SQL and Memorystore. No public DB IPs.
- Customer JWT secret rotates manually every 90 days (rotation flow TBD).
- M-Pesa callback signature validated on every request.
- Rate limits at Cloud Run (default) + Fastify (per-route, stricter on auth endpoints).
- bcrypt cost factor 12 for password hashing.

## What this architecture punts on (intentionally)

- **Multi-tenancy**: single brand only. We add brand isolation when we have a second brand.
- **Internationalisation**: KES + English only. Future work.
- **Feature flags**: not needed at MVP. Add when we have parallel feature teams.
- **A/B testing**: not yet.
- **Real-time push to storefront**: the storefront polls. WebSockets if/when it actually matters.
- **CDN-cached catalog**: Cloudflare in front of `/catalog` only when traffic justifies it.
