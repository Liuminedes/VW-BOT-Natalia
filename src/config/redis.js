import Redis from 'ioredis';
import { config } from './env.js';
import { logger } from './logger.js';

let client = null;

export function getRedisClient() {
  if (!client) {
    client = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });
    client.on('error', (err) => logger.error(`[Redis] Error: ${err.message}`));
    client.on('connect', () => logger.info('[Redis] Conectado'));
  }
  return client;
}
