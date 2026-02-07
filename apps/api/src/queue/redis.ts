import IORedis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const RedisCtor = IORedis as unknown as new (
  url: string,
  options?: {
    maxRetriesPerRequest?: null | number;
    enableOfflineQueue?: boolean;
    lazyConnect?: boolean;
    connectTimeout?: number;
  }
) => any;

export const redis = new RedisCtor(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true
});

export const rateLimitRedis = new RedisCtor(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  connectTimeout: 1000
});

redis.on('error', (err: Error) => {
  logger.warn({ err: err.message }, 'redis queue connection error');
});

rateLimitRedis.on('error', (err: Error) => {
  logger.warn({ err: err.message }, 'redis rate-limit connection error');
});

export async function pingRedisClient(timeoutMs = 1200): Promise<boolean> {
  try {
    const pingPromise = rateLimitRedis.ping();
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('redis_ping_timeout')), timeoutMs);
    });
    await Promise.race([pingPromise, timeout]);
    return true;
  } catch {
    return false;
  }
}
