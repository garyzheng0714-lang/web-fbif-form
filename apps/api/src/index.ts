import { createServer } from './server.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { pingRedisClient } from './queue/redis.js';

async function bootstrap() {
  if (env.REDIS_REQUIRED) {
    const redisReady = await pingRedisClient();
    if (!redisReady) {
      throw new Error('redis_required_but_unavailable');
    }
  }

  const app = createServer();
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'API server listening');
  });
}

bootstrap().catch((err) => {
  logger.error({ err }, 'API bootstrap failed');
  process.exit(1);
});
