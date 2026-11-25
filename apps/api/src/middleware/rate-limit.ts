import { SECURITY } from '@bossbyte/shared';
import {
  MemoryStore,
  rateLimit,
  type Options,
  type RateLimitRequestHandler,
} from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { env, isTest } from '../config/env';
import { tooManyRequests } from '../lib/errors';
import { redis } from '../lib/redis';

const memoryStores: MemoryStore[] = [];

function createMemoryStore(): MemoryStore {
  const store = new MemoryStore();
  memoryStores.push(store);
  return store;
}

/** Forgets every counter, so one test cannot use up another's allowance. Tests only. */
export async function resetRateLimits(): Promise<void> {
  await Promise.all(memoryStores.map((store) => store.resetAll()));
}

/**
 * Rate limiting with counters in Redis, so limits hold across every API
 * instance rather than per process. Tests use the built-in memory store.
 */
function createLimiter(
  name: string,
  { windowMs, limit }: { windowMs: number; limit: number },
  overrides: Partial<Options> = {},
): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store: isTest
      ? createMemoryStore()
      : new RedisStore({
          prefix: `ratelimit:${name}:`,
          sendCommand: (command: string, ...args: string[]) =>
            redis.call(command, ...args) as Promise<RedisReply>,
        }),
    // If Redis is unreachable, let requests through rather than take the API down with it.
    passOnStoreError: true,
    handler: (_req, _res, next) => next(tooManyRequests('Too many requests. Please slow down.')),
    ...overrides,
  });
}

/** Applied to every request. */
export const globalRateLimit = createLimiter(
  'global',
  {
    ...SECURITY.rateLimit.global,
    limit: env.RATE_LIMIT_GLOBAL_MAX ?? SECURITY.rateLimit.global.limit,
  },
  { skip: (req) => req.path.startsWith('/health') },
);

/** A much tighter limit for endpoints that accept credentials. */
export const authRateLimit = createLimiter('auth', {
  ...SECURITY.rateLimit.auth,
  limit: env.RATE_LIMIT_AUTH_MAX ?? SECURITY.rateLimit.auth.limit,
});
