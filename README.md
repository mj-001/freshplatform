# fresh-platform

A fresh-food commerce platform: customer-facing API, ERPNext as system of record, GCP Pub/Sub as event spine.

> Working name. Real brand chosen at launch.

## What's in this repo

| Path | What |
|---|---|
| `services/commerce-api/` | Node.js + Fastify customer-facing API |
| `packages/shared-types/` | TS types shared with the Flutter storefront repo |
| `infra/terraform/` | One `terraform apply` provisions everything on GCP |
| `infra/docker/` | Container build configs |
| `docs/` | Architecture, ERPNext setup, decision records |
| `.github/workflows/` | CI + deploy |

The Flutter storefront lives in a separate repo (`fresh-platform-storefront`).

## Prerequisites

- Node.js 22 LTS
- pnpm 9 (`npm install -g pnpm`)
- Docker Desktop
- An ERPNext instance (Frappe Cloud free tier works — see `docs/erpnext-setup.md`)
- A GCP project (only needed to deploy)

## Local setup (10 minutes)

```bash
# 1. Install
pnpm install

# 2. Start local infra
docker compose up -d

# 3. Configure
cp .env.example .env
# Edit .env: set ERPNEXT_URL, ERPNEXT_API_KEY, ERPNEXT_API_SECRET

# 4. Run migrations
pnpm --filter commerce-api migrate

# 5. Start the API
pnpm --filter commerce-api dev

# 6. Verify
curl http://localhost:8080/health
```

## Repo conventions

Read **`CLAUDE.md`** at the repo root before making any changes. It is the constitution. Same applies whether you are a human contributor or running Claude Code.

Service-specific rules live alongside each service: `services/commerce-api/CLAUDE.md`.

## Testing

```bash
pnpm test                              # all services
pnpm --filter commerce-api test        # one service
pnpm --filter commerce-api test:watch  # watch mode
```

Integration tests need `docker compose up` running and a sandbox ERPNext URL in `.env.test`.

## Deploying

First-time setup:

```bash
cd infra/terraform
terraform init
terraform apply
```

Subsequent deploys are automatic — push to `main` and `.github/workflows/deploy-commerce-api.yml` builds the container, pushes to Artifact Registry, and rolls out to Cloud Run.

See `docs/architecture.md` for the full deployment story.

## Where things live

| Question | Answer |
|---|---|
| "Where's the product catalog?" | ERPNext. commerce-api caches it in Redis. |
| "Where do orders live?" | ERPNext Sales Orders. commerce-api creates them via API. |
| "Where do customer logins live?" | commerce-api Postgres. Customer profile lives in ERPNext. |
| "Where's the cart?" | Redis, keyed by anonymous session id or customer id. |
| "How does M-Pesa work?" | commerce-api initiates STK push via Daraja, polls for confirmation, then converts ERPNext Quotation → Sales Order on success. |
| "What about the admin UI?" | ERPNext's built-in admin handles 90% of it. We may build a thin custom admin later for things ERPNext does poorly. |

## Reading order for new contributors

1. `CLAUDE.md` (the constitution)
2. `docs/architecture.md` (the full picture)
3. `docs/erpnext-setup.md` (configure your ERPNext sandbox)
4. `services/commerce-api/CLAUDE.md` (service-specific rules)
5. `PLAN.md` (what we're building, in order)
6. `docs/decisions/` (why we made the calls we did)

## License

UNLICENSED — proprietary.
