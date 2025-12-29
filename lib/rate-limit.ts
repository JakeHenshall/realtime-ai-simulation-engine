import { RateLimiterRedis } from 'rate-limiter-flexible';
import { getRedis } from './redis';

const redis = getRedis();

// API rate limiter: 100 requests per minute per IP
export const apiRateLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:api',
  points: 100,
  duration: 60,
  blockDuration: 60,
});

// AI rate limiter: 50 requests per minute per user
export const aiRateLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:ai',
  points: 50,
  duration: 60,
  blockDuration: 60,
});

// Simulation creation limiter: 10 per hour per user
export const simulationRateLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:simulation',
  points: 10,
  duration: 3600,
  blockDuration: 3600,
});

export async function checkRateLimit(
  limiter: RateLimiterRedis,
  key: string
): Promise<void> {
  try {
    await limiter.consume(key);
  } catch (rejRes: any) {
    if (rejRes.msBeforeNext) {
      throw new Error(
        `Rate limit exceeded. Try again in ${Math.ceil(rejRes.msBeforeNext / 1000)} seconds.`
      );
    }
    throw new Error('Rate limit exceeded');
  }
}

