import Redis from 'ioredis';
import { logger } from './logger';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      // Enable TLS for production Redis connections
      tls: process.env.NODE_ENV === 'production' && redisUrl.startsWith('rediss://') 
        ? { rejectUnauthorized: true } 
        : undefined,
    });

    redis.on('error', (err) => {
      logger.error({ error: err }, 'Redis connection error');
    });
  }

  return redis;
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

