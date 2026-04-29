/**
 * ERPNext webhook receiver — STUB.
 *
 * Implementation lives in PLAN.md week 1.
 *
 * ERPNext fires a webhook on Item insert/update (configured in ERPNext admin).
 * We use it to invalidate the catalog cache.
 *
 * Hard rules:
 *   - Validate the X-Webhook-Secret header against the env-configured secret.
 *   - Be liberal in what we accept (Frappe payload shape varies).
 *   - On any item event: DEL `catalog:item:{itemCode}` and DEL `catalog:list:*`
 *     (use SCAN — never KEYS — to find list keys to delete).
 *   - Publish `catalog.updated` to Pub/Sub for downstream subscribers.
 *   - Respond 200 quickly even if cache invalidation fails (we'd rather miss an
 *     invalidation than block ERPNext).
 */

// eslint-disable-next-line @typescript-eslint/require-await
export default async function erpnextWebhook(/* app: FastifyInstance */) {
  // TODO(week-1): POST /webhooks/erpnext/item-updated
}
