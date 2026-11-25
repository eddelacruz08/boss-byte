import { Redis } from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

/**
 * The shared Redis connection for caching, rate limiting and short-lived
 * auth state. `lazyConnect` means importing this module does not open a
 * socket; the connection is made on the first command.
 *
 * Bull manages its own connections (see jobs/queues.ts).
 */
export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

redis.on('error', (error) => logger.error({ err: error }, 'Redis connection error'));

const CACHE_PREFIX = 'cache:';

/**
 * Read-through cache: returns the cached value for `key`, or runs `load`,
 * stores its result for `ttlSeconds` and returns it.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<T> {
  const hit = await redis.get(CACHE_PREFIX + key);
  if (hit !== null) return JSON.parse(hit) as T;

  const value = await load();
  await redis.set(CACHE_PREFIX + key, JSON.stringify(value), 'EX', ttlSeconds);
  return value;
}

export async function invalidate(...keys: string[]): Promise<void> {
  if (keys.length > 0) await redis.del(...keys.map((key) => CACHE_PREFIX + key));
}
