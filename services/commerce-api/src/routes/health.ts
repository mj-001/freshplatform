import { z } from 'zod';
import type { FastifyInstance } from 'fastify';

const HealthResponse = z.object({
  status: z.literal('ok'),
  service: z.literal('commerce-api'),
  version: z.string(),
  uptime: z.number(),
});

const ReadyResponse = z.object({
  status: z.enum(['ready', 'degraded']),
  checks: z.object({
    postgres: z.boolean(),
    redis: z.boolean(),
  }),
});

export default async function healthRoutes(app: FastifyInstance) {
  app.get(
    '/health',
    {
      schema: {
        response: { 200: HealthResponse },
      },
    },
    async () => ({
      status: 'ok' as const,
      service: 'commerce-api' as const,
      version: process.env['npm_package_version'] ?? '0.0.0',
      uptime: process.uptime(),
    }),
  );

  app.get(
    '/ready',
    {
      schema: {
        response: { 200: ReadyResponse, 503: ReadyResponse },
      },
    },
    async (_req, reply) => {
      const checks = { postgres: false, redis: false };
      try {
        await app.sql`SELECT 1`;
        checks.postgres = true;
      } catch (err) {
        app.log.warn({ err }, 'readiness: postgres failed');
      }
      try {
        await app.redis.ping();
        checks.redis = true;
      } catch (err) {
        app.log.warn({ err }, 'readiness: redis failed');
      }
      const allHealthy = checks.postgres && checks.redis;
      return reply.status(allHealthy ? 200 : 503).send({
        status: allHealthy ? ('ready' as const) : ('degraded' as const),
        checks,
      });
    },
  );
}
