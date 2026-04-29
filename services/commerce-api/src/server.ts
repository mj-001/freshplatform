import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import { loadConfig } from './config.js';
import { createLogger } from './lib/logger.js';
import { errorHandler } from './lib/errors.js';

import erpnextPlugin from './plugins/erpnext.js';
import redisPlugin from './plugins/redis.js';
import postgresPlugin from './plugins/postgres.js';
import pubsubPlugin from './plugins/pubsub.js';

import healthRoutes from './routes/health.js';
import catalogRoutes from './routes/catalog.js';
import cartRoutes from './routes/carts.js';
import checkoutRoutes from './routes/checkout.js';
import authRoutes from './routes/auth.js';

async function build() {
  const config = loadConfig();
  const logger = createLogger(config);

  const app = Fastify({ loggerInstance: logger, trustProxy: true }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);

  // Cross-cutting plugins
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: true, credentials: true });
  await app.register(sensible);
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  // Infrastructure plugins
  await app.register(postgresPlugin, { url: config.DATABASE_URL });
  await app.register(redisPlugin, { url: config.REDIS_URL });
  const pubsubOpts: { projectId: string; emulatorHost?: string } = {
    projectId: config.PUBSUB_PROJECT_ID,
  };
  if (config.PUBSUB_EMULATOR_HOST) {
    pubsubOpts.emulatorHost = config.PUBSUB_EMULATOR_HOST;
  }
  await app.register(pubsubPlugin, pubsubOpts);
  await app.register(erpnextPlugin, {
    url: config.ERPNEXT_URL,
    apiKey: config.ERPNEXT_API_KEY,
    apiSecret: config.ERPNEXT_API_SECRET,
  });

  // Routes
  await app.register(healthRoutes);
  await app.register(catalogRoutes);
  await app.register(cartRoutes);
  await app.register(checkoutRoutes);
  await app.register(authRoutes);

  // TODO: me, webhooks/mpesa, webhooks/erpnext (week 1, 4, 5)

  return app;
}

async function start() {
  const app = await build();
  const config = loadConfig();
  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.fatal({ err }, 'failed to start');
    process.exit(1);
  }

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, async () => {
      app.log.info({ sig }, 'shutting down');
      await app.close();
      process.exit(0);
    });
  }
}

// Run if invoked directly
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  void start();
}

export { build };
