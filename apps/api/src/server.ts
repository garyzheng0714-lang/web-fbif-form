import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { csrfRouter } from './routes/csrf.js';
import { submissionsRouter } from './routes/submissions.js';
import { uploadsRouter } from './routes/uploads.js';
import { logger } from './utils/logger.js';
import { pingRedisClient } from './queue/redis.js';
import { prisma } from './utils/db.js';

export function createServer() {
  const app = express();

  app.set('trust proxy', env.TRUST_PROXY);
  const httpLogger = pinoHttp as unknown as (options: { logger: typeof logger }) => express.RequestHandler;
  app.use(httpLogger({ logger }));
  app.use(helmet());
  app.use(cors({
    origin: env.WEB_ORIGIN,
    credentials: true
  }));
  app.use(cookieParser());
  app.use(express.json({ limit: '16kb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.get('/health/live', (_req, res) => res.json({ ok: true }));
  app.get('/health/ready', async (_req, res) => {
    const redisReady = await pingRedisClient();
    let dbReady = true;

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbReady = false;
    }

    const ready = dbReady && (!env.REDIS_REQUIRED || redisReady);
    res.status(ready ? 200 : 503).json({
      ok: ready,
      checks: {
        db: dbReady,
        redis: redisReady
      }
    });
  });

  app.use('/api/csrf', apiLimiter, csrfRouter);
  app.use('/api/submissions', apiLimiter, submissionsRouter);
  app.use('/api/uploads', apiLimiter, uploadsRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
