# ADR 0003 — Orders live in ERPNext, not commerce-api

**Status**: Accepted
**Date**: 2026-04-29
**Context**: initial architecture

## Context

Two patterns were considered for where the order record lives:

1. **commerce-api owns orders.** A custom orders table in commerce-api Postgres. Commerce-api computes prices, taxes, totals. ERPNext receives stock movement entries (Stock Entry / Delivery Note) when orders ship.

2. **ERPNext owns orders.** Sales Orders are created in ERPNext at checkout. ERPNext computes prices, taxes, totals via Quotation. commerce-api never stores order line items, prices, or totals.

## Decision

ERPNext owns orders. Sales Order is the single source of truth for any order in the system.

Flow:

1. Customer hits `POST /carts/:id/checkout`
2. commerce-api creates an **ERPNext Quotation** with the cart line items
3. ERPNext returns subtotal, tax, shipping, grand_total — all computed from its price lists, tax templates, and shipping rules
4. commerce-api shows totals to the customer
5. Customer pays via M-Pesa STK push
6. On payment confirmation, commerce-api calls ERPNext `make_sales_order` to convert Quotation → Sales Order
7. ERPNext deducts inventory, creates a Sales Invoice, posts journal entries

commerce-api's only persistent record of the transaction is the M-Pesa payment row (for reconciliation) and the idempotency key.

## Consequences

Positive:
- Cart math (taxes, discounts, shipping) is computed by ERPNext in its native model — we don't reinvent it
- Inventory deduction, accounting entries, and customer ledger updates happen automatically as ERPNext's standard sales workflow
- Pricing changes (price list updates, promotions, customer-group pricing) propagate without commerce-api changes
- One place to look up an order's status, history, and reconciled payments
- Future ops (refunds, returns, credit notes) use ERPNext's existing flows

Negative:
- ERPNext must be available to complete a checkout. Cached quotations cannot be created.
- ERPNext API latency directly impacts checkout time
- Pricing edge cases that ERPNext doesn't handle natively (e.g. complex customer-tier overrides) require ERPNext customization, not commerce-api workarounds

Mitigations:
- Checkout is the most failure-tolerant moment of the customer journey — users will retry a 503 on submit
- Quotation creation is fast (<500ms typical) on Frappe Cloud
- ERPNext is well-extended via Custom Fields and Server Scripts when we need pricing customization

## Alternatives considered

- **commerce-api orders + ERPNext stock movements only**: rejected. Forces us to reimplement cart math, taxation, and reconciliation. Two systems of truth.
- **Hybrid: cart in commerce-api, order in ERPNext, but commerce-api caches order summaries**: deferred. We'll add a denormalised `orders_view` cache if read latency on `/me/orders` ever becomes a problem. Until then, read-through from ERPNext is fine.

## What this means in practice

- Never add a `products`, `prices`, `orders`, `order_items`, `taxes`, or `inventory` table to commerce-api Postgres. If you find yourself wanting one, the answer is to use ERPNext's existing entity instead.
- Never compute taxes or discounts in commerce-api code. All money-affecting logic lives in ERPNext (price lists, tax templates, pricing rules, shipping rules).
- Customer-facing order history is a read-through to ERPNext Sales Order list, filtered by customer.
