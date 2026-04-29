import fp from 'fastify-plugin';
import { PubSub } from '@google-cloud/pubsub';
import type { FastifyInstance } from 'fastify';

/**
 * Topic registry. Adding a new topic requires an ADR.
 * The keys here are the canonical event names; values are the GCP topic ids.
 */
export const Topics = {
  CATALOG_UPDATED: 'catalog.updated',
  ORDER_PLACED: 'order.placed',
  PAYMENT_CONFIRMED: 'payment.confirmed',
  PAYMENT_FAILED: 'payment.failed',
  SHIPMENT_DISPATCHED: 'shipment.dispatched',
} as const;

export type TopicName = (typeof Topics)[keyof typeof Topics];

export interface PubSubPublisher {
  publish<T extends Record<string, unknown>>(topic: TopicName, payload: T): Promise<string>;
}

declare module 'fastify' {
  interface FastifyInstance {
    pubsub: PubSubPublisher;
  }
}

interface PluginOptions {
  projectId: string;
  emulatorHost?: string;
}

const pubsubPlugin = fp<PluginOptions>(
  async (app: FastifyInstance, opts) => {
    if (opts.emulatorHost) {
      process.env['PUBSUB_EMULATOR_HOST'] = opts.emulatorHost;
    }
    const client = new PubSub({ projectId: opts.projectId });

    const publisher: PubSubPublisher = {
      async publish(topicName, payload) {
        const topic = client.topic(topicName);
        const data = Buffer.from(JSON.stringify(payload));
        const messageId = await topic.publishMessage({
          data,
          attributes: {
            publishedAt: new Date().toISOString(),
            schemaVersion: '1',
          },
        });
        app.log.info({ topic: topicName, messageId }, 'pubsub published');
        return messageId;
      },
    };

    app.decorate('pubsub', publisher);
  },
  { name: 'pubsub' },
);

export default pubsubPlugin;
