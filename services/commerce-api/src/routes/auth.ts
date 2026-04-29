/**
 * Auth routes — STUB.
 *
 * Implementation lives in PLAN.md week 5. This file names the endpoints
 * and defines schemas. Claude Code fills in the bodies in a dedicated slice.
 *
 * Hard rules (see services/commerce-api/CLAUDE.md and CLAUDE.md):
 *   - Email + password ONLY in Postgres. The customer profile (name, addresses)
 *     lives in ERPNext as a Customer document.
 *   - Register flow MUST be atomic: if creating the ERPNext Customer fails after
 *     we've inserted into customers_auth, roll back. Use a Postgres transaction
 *     and only commit after ERPNext returns success.
 *   - bcrypt cost factor 12.
 *   - JWT payload: { sub: erpnextCustomerId, email }, signed HS256 with JWT_SECRET.
 *   - On register, immediately log the user in (return token).
 */

import { z } from 'zod';
import type { FastifyInstance } from 'fastify';

const _RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72), // bcrypt limit
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(9),
});

const _LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const _AuthResponse = z.object({
  token: z.string(),
  customer: z.object({
    id: z.string(),
    email: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    phone: z.string(),
  }),
  expiresAt: z.string(),
});

// eslint-disable-next-line @typescript-eslint/require-await
export default async function authRoutes(_app: FastifyInstance) {
  // TODO(week-5): POST /auth/register
  // TODO(week-5): POST /auth/login
  // TODO(week-5): POST /auth/logout (optional — JWT is stateless)
}
