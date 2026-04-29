// Topics MUST match those declared in services/commerce-api/src/plugins/pubsub.ts.
// Adding or removing a topic requires an ADR.

locals {
  pubsub_topics = [
    "catalog.updated",
    "order.placed",
    "payment.confirmed",
    "payment.failed",
    "shipment.dispatched",
  ]
}

resource "google_pubsub_topic" "topics" {
  for_each = toset(local.pubsub_topics)
  name     = each.value
  depends_on = [google_project_service.apis]

  message_retention_duration = "604800s" # 7 days
}

// Dead letter topic for any subscriber failures
resource "google_pubsub_topic" "dead_letter" {
  name                       = "dead-letter"
  message_retention_duration = "1209600s" # 14 days
  depends_on                 = [google_project_service.apis]
}
