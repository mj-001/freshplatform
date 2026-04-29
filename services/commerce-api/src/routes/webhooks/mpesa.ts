/**
 * M-Pesa webhook — STUB.
 *
 * Implementation lives in PLAN.md week 4.
 *
 * Daraja sends a callback to this endpoint when an STK push completes (success or fail).
 * Body shape (sandbox example):
 *
 * {
 *   "Body": {
 *     "stkCallback": {
 *       "MerchantRequestID": "...",
 *       "CheckoutRequestID": "...",
 *       "ResultCode": 0,         // 0 = success
 *       "ResultDesc": "...",
 *       "CallbackMetadata": {
 *         "Item": [
 *           { "Name": "Amount", "Value": 1.0 },
 *           { "Name": "MpesaReceiptNumber", "Value": "..." },
 *           { "Name": "TransactionDate", "Value": 20260429... },
 *           { "Name": "PhoneNumber", "Value": 2547... }
 *         ]
 *       }
 *     }
 *   }
 * }
 *
 * Hard rules:
 *   - Validate signature/origin. Daraja doesn't sign callbacks but we can lock down
 *     the callback URL by IP whitelist or shared secret in the URL path.
 *   - Idempotency: dedupe on (CheckoutRequestID, MpesaReceiptNumber).
 *   - Always respond 200 OK quickly. Do the heavy work (Sales Order conversion,
 *     Pub/Sub publish) AFTER the response, in a fire-and-forget Promise.
 *     If the heavy work fails, we have the raw_callback in mpesa_transactions
 *     and a retry job picks it up.
 *   - On success: convert Quotation → Sales Order in ERPNext (idempotent), then
 *     publish payment.confirmed and order.placed.
 *   - On failure: update mpesa_transactions row, publish payment.failed.
 */

// eslint-disable-next-line @typescript-eslint/require-await
export default async function mpesaWebhook(/* app: FastifyInstance */) {
  // TODO(week-4): POST /webhooks/mpesa
}
