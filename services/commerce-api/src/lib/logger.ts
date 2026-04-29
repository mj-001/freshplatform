import pino from 'pino';
import type { Config } from '../config.js';

export function createLogger(config: Config) {
  return pino({
    level: config.LOG_LEVEL,
    base: {
      service: 'commerce-api',
      env: config.NODE_ENV,
    },
    transport:
      config.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
        : undefined,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.password',
        '*.api_secret',
        '*.MPESA_PASSKEY',
        '*.MPESA_CONSUMER_SECRET',
        '*.JWT_SECRET',
      ],
      remove: true,
    },
  });
}
