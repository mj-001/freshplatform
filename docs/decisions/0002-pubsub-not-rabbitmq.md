# ADR 0002 — GCP Pub/Sub, not RabbitMQ

**Status**: Accepted
**Date**: 2026-04-29
**Context**: initial architecture

## Context

We need an event spine for asynchronous fan-out: SMS notifications on order events, BigQuery analytics ingestion, cache invalidation from ERPNext webhooks, and (eventually) AI agents subscribing to operational events.

Earlier conversations explored RabbitMQ. The case for it was flexibility (custom routing topologies, fine-grained dead-letter behaviour). Earlier conversations also pushed back on it as premature for our consumer count.

For a from-scratch architecture with ERPNext + commerce-api + future analytics + future agents, the consumer count is real from week one. So an event bus belongs in the design. The question is which one.

## Decision

Use GCP Pub/Sub. Not RabbitMQ. Not Kafka.

Topics declared statically in `infra/terraform/pubsub.tf` and mirrored in `services/commerce-api/src/plugins/pubsub.ts`. Adding a topic requires this ADR file pattern (a new ADR) and updates to both files in the same PR.

## Consequences

Positive:
- Native to Cloud Run; no networking ceremony
- Free at MVP scale (10 GB/month free tier covers us comfortably)
- Built-in BigQuery sink — analytics tier needs no custom subscriber
- At-least-once delivery; we make subscribers idempotent regardless
- Dead-letter topics first-class
- Operationally zero — no broker to operate, monitor, or back up

Negative:
- Less flexible routing than RabbitMQ (no exchange topologies, no header-based routing)
- Vendor lock-in to GCP for the messaging layer

Mitigations:
- The publisher abstraction (`PubSubPublisher` interface in `plugins/pubsub.ts`) keeps the rest of the codebase decoupled from the broker. If we ever migrate, only the plugin implementation changes.
- We don't need RabbitMQ-style routing. Topic-per-event-type is sufficient.

## Alternatives considered

- **RabbitMQ self-hosted**: rejected. Operational overhead we're avoiding.
- **CloudAMQP managed RabbitMQ**: rejected. Real cost ($20-100/month minimum), no advantage over Pub/Sub for our patterns, no native GCP integration.
- **Apache Kafka / Confluent Cloud**: rejected. Massive overkill at our scale; expensive minimum cluster.
- **HTTP webhooks point-to-point**: rejected for the long term. Tight coupling, no replay, no fan-out, no buffering during outages. Acceptable internally for one-off bridge integrations.

## When we would revisit

- If Pub/Sub limits genuinely bite (unlikely below 10k events/sec)
- If we need exactly-once semantics that Pub/Sub can't deliver (we make subscribers idempotent, so this is rare)
- If we leave GCP for a different cloud
