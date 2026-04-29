# ADR 0001 — ERPNext as system of record

**Status**: Accepted
**Date**: 2026-04-29
**Context**: initial architecture

## Context

We are building a fresh-food commerce platform. Two paths were considered:

1. Fork Medusa.js v2 and customize it for fresh food
2. Use ERPNext as the source of truth and build a thin custom commerce layer in front of it

Earlier discussions explored option 1 in detail. A Flutter storefront against vanilla Medusa was built and reviewed. The fresh-food domain (perishability, batches, expiry, multi-warehouse, supplier provenance, accounting) does not fit Medusa's data model naturally — these would be permanent customizations against an upstream that doesn't share the same domain.

ERPNext, by contrast, was built for inventory-heavy businesses and has all of these as first-class features.

## Decision

ERPNext is the system of record for: products, batches, expiry, inventory, suppliers, customer master records, quotations, sales orders, invoices, and the accounting ledger.

A small custom Node.js/TypeScript service (`commerce-api`) sits between the storefront and ERPNext. commerce-api owns ONLY: catalog cache, anonymous cart state, customer auth credentials, M-Pesa orchestration, and idempotency keys.

Cart math (subtotals, taxes, shipping, totals) is computed by ERPNext via the Quotation document, not by commerce-api.

## Consequences

Positive:
- Massive reduction in custom code (one ~3,000-line service vs. forking a 50,000-line monorepo)
- Fresh-food domain features work out of the box (Item Batch, Expiry, FEFO, multi-warehouse)
- Real accounting from day one (chart of accounts, journal entries on every sale)
- Working admin UI for ops staff (the ERPNext Desk)
- ERPNext mobile app for receiving and stock-take
- Clean, comprehensible architecture for future hires

Negative:
- ERPNext API is Frappe-style; we have a translation layer in our ERPNext client
- ERPNext can be a single point of failure — caching and graceful degradation are required
- Customer-facing performance tuning happens in commerce-api, not ERPNext (which is a feature, not a bug — we don't fight ERPNext's internals)
- Hosting cost: Frappe Cloud (~$25/month minimum) on top of GCP

Mitigations:
- Read-through cache for catalog (5-minute TTL, webhook invalidation)
- ERPNext failures degrade gracefully (catalog stays available; cart writes blocked)
- Webhook-based cache invalidation keeps cache near-real-time

## Alternatives considered

- **Forked Medusa**: rejected. Domain mismatch; permanent merge tax.
- **Medusa + ERPNext sync**: rejected. Two systems of truth; constant reconciliation pain.
- **ERPNext only (no commerce-api)**: rejected. ERPNext doesn't speak M-Pesa, doesn't issue customer JWTs, isn't built for high-read public traffic.
- **Build everything from scratch**: rejected. ERPNext absorbs months of work for free.
