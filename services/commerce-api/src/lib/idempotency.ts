import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { AppError, ErrorCodes } from './errors.js';

/**
 * Idempotency-Key middleware.
 *
 * Usage in a route handler:
 *
 *   const result = await idempotent(app, {
 *     key: req.headers['idempotency-key'] as string | undefined,
 *     requestHash: hashRequest(req.body),
 *     ttlSeconds: 86400,
 *   }, async () => {
 *     return await doTheThingThatMustNotBeDoneTwice();
 *   });
 *
 * Behaviour:
 *   - If key is missing/null: just runs the operation. No idempotency.
 *   - If key has been used with a DIFFERENT request payload: throws CONFLICT.
 *     This catches "client reused the key but changed the body" — likely a bug.
 *   - If key has been used with the SAME request payload: returns the stored result.
 *   - If key is fresh: runs the operation, stores the result, returns it.
 *
 * Cleanup of expired keys is handled by a periodic Postgres job (see migrations).
 */

interface IdempotencyOpts {
  key: string | undefined;
  requestHash: string;
  ttlSeconds?: number;
}

interface StoredResult<T> {
  status: number;
  body: T;
}

export async function idempotent<T>(
  app: FastifyInstance,
  opts: IdempotencyOpts,
  fn: () => Promise<T>,
  successStatus = 200,
): Promise<T> {
  const { key, requestHash, ttlSeconds = 86_400 } = opts;
  if (!key) return fn();

  // Look up existing record
  const existing = await app.sql<
    { request_hash: string; response_status: number; response_body: unknown }[]
  >`
    SELECT request_hash, response_status, response_body
    FROM idempotency_keys
    WHERE key = ${key} AND expires_at > now()
    LIMIT 1
  `;

  if (existing.length > 0) {
    const row = existing[0];
    if (!row) throw new AppError(ErrorCodes.INTERNAL_ERROR, 'idempotency lookup race', 500);
    if (row.request_hash !== requestHash) {
      throw new AppError(
        ErrorCodes.IDEMPOTENCY_KEY_REUSED,
        'Idempotency key was previously used with a different request body.',
        409,
      );
    }
    return row.response_body as T;
  }

  const result = await fn();
  await app.sql`
    INSERT INTO idempotency_keys (key, request_hash, response_status, response_body, expires_at)
    VALUES (
      ${key},
      ${requestHash},
      ${successStatus},
      ${JSON.stringify(result)}::jsonb,
      now() + (${ttlSeconds} || ' seconds')::interval
    )
    ON CONFLICT (key) DO NOTHING
  `;
  return result;
}

/** Stable hash of a request payload for idempotency comparison. */
export function hashRequest(payload: unknown): string {
  const json = JSON.stringify(payload, Object.keys(payload as object).sort());
  return createHash('sha256').update(json).digest('hex');
}
