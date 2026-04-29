import fp from 'fastify-plugin';
import postgres, { type Sql } from 'postgres';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    sql: Sql;
  }
}

interface PluginOptions {
  url: string;
}

const postgresPlugin = fp<PluginOptions>(
  async (app: FastifyInstance, opts) => {
    const sql = postgres(opts.url, {
      max: 10,
      idle_timeout: 30,
      connect_timeout: 10,
      onnotice: () => {}, // suppress NOTICEs in logs
    });

    // Verify connectivity at startup so we fail fast.
    await sql`SELECT 1`;

    app.decorate('sql', sql);
    app.addHook('onClose', async () => {
      await sql.end({ timeout: 5 });
    });
  },
  { name: 'postgres' },
);

export default postgresPlugin;
