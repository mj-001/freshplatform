# ADR 0004 — ERPNext deployment: Frappe Cloud now, self-hosted on GCP at launch

**Status**: Accepted
**Date**: 2026-04-29
**Context**: build phase

## Context

ADR 0001 made ERPNext the system of record. ERPNext now has to be hosted somewhere. Two paths:

1. **Frappe Cloud** — managed by Frappe (the company that builds ERPNext). Free tier, paid plans from $25/month.
2. **Self-hosted on GCP** — Compute Engine VM running ERPNext via the official Docker images, with Cloud SQL Postgres and Cloud Storage for backups.

Both work technically. The choice is about phasing, not about endpoint state.

## Decision

**Build phase (Weeks 1–6 of PLAN.md): Frappe Cloud free tier.**

**Pre-launch (after Week 6, before paid customer traffic): migrate to self-hosted on GCP.**

Both phases use the same ERPNext API. commerce-api's ERPNext client (`services/commerce-api/src/plugins/erpnext.ts`) does not change. Only `ERPNEXT_URL`, `ERPNEXT_API_KEY`, and `ERPNEXT_API_SECRET` change in the environment.

## Why two phases instead of one

### Why Frappe Cloud during the build

- **Free**. We're not paying for ERPNext during weeks of no traffic.
- **Ten minutes to a working site.** No deployment ceremony eating build budget.
- **Backups, updates, monitoring all handled.** We focus on commerce-api, not on operating ERPNext.
- **Reversible.** If we discover a fundamental ERPNext blocker, we haven't sunk a week into self-hosting it.

### Why self-host at launch

- **Latency.** Frappe Cloud's free tier puts the site wherever they choose (often London, Singapore, or US-East). Round-trip from `africa-south1` Cloud Run to Frappe Cloud ≈ 150-250ms per call. Self-hosted on the same GCP VPC ≈ 3-8ms. For checkout flows that hit ERPNext multiple times, this is the difference between a snappy and a sluggish app.
- **Data residency.** Customer data stays in GCP, which simplifies any future Kenyan data protection compliance (Data Protection Act 2019).
- **Cost predictability.** Self-hosted on a single `e2-medium` runs ~$30-50/month. Frappe Cloud's equivalent paid tier (managed but with similar specs) is $25-100/month depending on bench size.
- **No artificial limits.** Frappe Cloud's free tier caps resources and shuts down idle sites. Paid tiers are fine but at that point we're paying anyway.
- **Network control.** Self-hosted means ERPNext is reachable only from our VPC, not the public internet. We don't expose it as a public attack surface.

### Why not self-host from day one

- Setup work (Terraform module, Docker compose, backup tooling, update automation) takes ~3-5 days. That's 10-15% of the build budget. Not worth it before architecture is proven.
- Operating ERPNext during the build phase means babysitting backups and updates while we're trying to ship code. Frappe Cloud babysits for free.
- If the architecture turns out to need adjusting (it always does in some way during weeks 1-2), it's cheaper to discover that against a managed service than against infrastructure we built.

## Migration plan (executed before launch)

When the migration trigger fires (defined below), this is the path:

1. **Provision self-hosted ERPNext on GCP.** A new Terraform module: `infra/terraform/erpnext.tf`. One `e2-medium` VM in `africa-south1`, Cloud SQL Postgres, Cloud Storage bucket for backups, internal-only IP (reachable only from the VPC).
2. **Deploy ERPNext via the official `frappe_docker` images.** Pin to the same major version we've been running on Frappe Cloud.
3. **Take a backup from Frappe Cloud.** Frappe Cloud has a one-click backup that produces a `.sql` + `files.tar` pair.
4. **Restore into the GCP instance.** `bench restore` from the backup.
5. **Verify**: count items, count customers, count quotations. Smoke-test the API with the same calls commerce-api makes.
6. **Update Secret Manager**: rotate `ERPNEXT_URL`, `ERPNEXT_API_KEY`, `ERPNEXT_API_SECRET` to point at the new instance.
7. **Cloud Run picks up the new secrets** on next request (or force a redeploy).
8. **Decommission the Frappe Cloud site** after a 7-day verification window.

Estimated effort: half a day for someone competent with `bench` and Terraform. A full day if it's the first ERPNext production install they've done.

## Migration trigger

Migrate to self-hosted when **any one** of these is true:

- Real customer traffic is about to hit (the launch readiness review)
- Frappe Cloud free-tier limits become a constraint (idle shutdown, request caps)
- Round-trip latency from commerce-api to ERPNext is observed >100ms p50 in production logs and is hurting user-perceived performance
- Compliance review requires data residency in Kenya/GCP

Until any of these fires, stay on Frappe Cloud.

## Consequences

Positive:
- Build phase ships fast — no infrastructure babysitting
- Architecture is proven against a managed ERPNext before we self-host
- Migration path is documented and short
- Self-hosted endpoint gives us the latency, residency, and cost control we want at launch

Negative:
- One-time migration cost (half-day)
- ERPNext URL changes once, requiring secret rotation and a brief Cloud Run redeploy
- We're temporarily dependent on Frappe Cloud uptime during weeks 1–6 (their SLA is fine, but it's a dependency)

Mitigations:
- The ERPNext client doesn't care which URL it talks to — migration is config, not code
- Frappe Cloud free tier has been stable for years; outages are rare and brief
- Build phase has no real customers, so an outage is annoying not damaging

## Alternatives considered

- **Self-host from day one.** Rejected — wastes 3-5 days of build budget on infrastructure setup before the architecture is proven.
- **Frappe Cloud forever (paid tier at launch).** Rejected — latency and data residency win for self-hosted at scale. Also, Frappe Cloud paid pricing climbs faster than self-hosted GCP costs as usage grows.
- **A different ERP entirely (Odoo, NetSuite, custom build).** Rejected by ADR 0001 — ERPNext is the right fit for fresh-food.

## What this means in practice (action items)

- For now: nothing. Continue with Frappe Cloud as documented in `docs/erpnext-setup.md`.
- Before launch: a slice in PLAN.md gets added — "ERPNext self-host migration" — with the steps above.
- Add `infra/terraform/erpnext.tf` (Compute Engine + Cloud SQL + Cloud Storage backup bucket) when that slice is opened.
- Add a backup verification job (weekly `bench restore` to a throwaway instance) once self-hosted.
