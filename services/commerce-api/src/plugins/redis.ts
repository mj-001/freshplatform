import fp from 'fastify-plugin';
import { createClient, type RedisClientType } from 'redis';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    redis: RedisClientType;
  }
}

interface PluginOptions {
  url: string;
}

const redisPlugin = fp<PluginOptions>(
  async (app: FastifyInstance, opts) => {
    const client: RedisClientType = createClient({ url: opts.url });
    client.on('error', (err) => app.log.error({ err }, 'redis error'));
    await client.connect();

    app.decorate('redis', client);
    app.addHook('onClose', async () => {
      await client.quit();
    });
  },
  { name: 'redis' },
);

export default redisPlugin;
