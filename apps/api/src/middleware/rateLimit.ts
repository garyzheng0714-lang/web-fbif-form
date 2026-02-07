import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { env } from '../config/env.js';
import { rateLimitRedis } from '../queue/redis.js';
import type { RequestHandler } from 'express';
import { logger } from '../utils/logger.js';

const noopLimiter: RequestHandler = (_req, _res, next) => next();

function resolveStore() {
  if (env.RATE_LIMIT_BACKEND === 'off') return undefined;
  if (env.RATE_LIMIT_BACKEND === 'memory') return undefined;
  if (env.RATE_LIMIT_BACKEND === 'redis') {
    return new RedisStore({
      sendCommand: (...args: string[]) => rateLimitRedis.call(...args)
    });
  }
  if (env.RATE_LIMIT_BACKEND === 'auto') {
    return undefined;
  }
  return undefined;
}

if (env.RATE_LIMIT_BACKEND === 'auto') {
  logger.info('rate limiter auto mode selected: using in-memory store');
}

function createLimiter(options: { windowMs: number; limit: number }) {
  if (env.RATE_LIMIT_BACKEND === 'off') return noopLimiter;

  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    passOnStoreError: true,
    store: resolveStore(),
    handler: (req, res, _next, context) => {
      logger.warn({ ip: req.ip, limit: context.limit }, 'rate limit exceeded');
      res.status(429).json({ error: 'Too Many Requests' });
    }
  });
}

export const apiLimiter = createLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX
});

export const burstLimiter = createLimiter({
  windowMs: 1000,
  limit: env.RATE_LIMIT_BURST
});
