import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Stable error codes. Keep this list curated.
 * Anything thrown to a client must use one of these.
 */
export const ErrorCodes = {
  // 4xx
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',

  // Domain — cart
  CART_NOT_FOUND: 'CART_NOT_FOUND',
  CART_EMPTY: 'CART_EMPTY',
  ITEM_OUT_OF_STOCK: 'ITEM_OUT_OF_STOCK',

  // Domain — auth
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_TAKEN: 'EMAIL_TAKEN',

  // Domain — payment
  PAYMENT_INITIATION_FAILED: 'PAYMENT_INITIATION_FAILED',
  PAYMENT_NOT_FOUND: 'PAYMENT_NOT_FOUND',
  PAYMENT_ALREADY_CONFIRMED: 'PAYMENT_ALREADY_CONFIRMED',

  // Upstream
  ERPNEXT_UNAVAILABLE: 'ERPNEXT_UNAVAILABLE',
  ERPNEXT_BAD_RESPONSE: 'ERPNEXT_BAD_RESPONSE',
  MPESA_UNAVAILABLE: 'MPESA_UNAVAILABLE',

  // 5xx
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, statusCode = 400, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Fastify error handler. Maps AppError to structured responses, hides internals on 5xx.
 */
export function errorHandler(error: FastifyError, req: FastifyRequest, reply: FastifyReply) {
  if (error instanceof AppError) {
    req.log.warn({ code: error.code, details: error.details }, error.message);
    return reply.status(error.statusCode).send({
      error: { code: error.code, message: error.message, details: error.details },
    });
  }

  // Validation errors from Fastify/Zod
  if (error.validation) {
    req.log.warn({ validation: error.validation }, 'validation failed');
    return reply.status(400).send({
      error: {
        code: ErrorCodes.VALIDATION_FAILED,
        message: 'Request validation failed',
        details: { issues: error.validation },
      },
    });
  }

  // Anything else: log full, return generic
  req.log.error({ err: error }, 'unhandled error');
  return reply.status(500).send({
    error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Internal server error' },
  });
}
