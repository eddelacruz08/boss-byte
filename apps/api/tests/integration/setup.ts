import { sql } from 'drizzle-orm';
import { afterAll, beforeEach } from 'vitest';
import { db, pool } from '../../src/db/client';
import { closeQueues } from '../../src/jobs/queues';
import { redis } from '../../src/lib/redis';
import { setStorage } from '../../src/lib/storage';
import { resetRateLimits } from '../../src/middleware/rate-limit';
import { assertDisposable } from '../defaults';
import { storage } from './helpers';

/**
 * Runs in every integration test file, after tests/setup.ts has prepared the
 * environment. Each test starts from the same blank slate: empty tables, an
 * empty Redis database, fresh rate-limit counters and an in-memory object
 * store, so tests can run in any order.
 */

// The modules above connect lazily, so this runs before anything is touched.
assertDisposable(process.env.DATABASE_URL!, process.env.REDIS_URL!);

beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE TABLE audit_logs, files, passkeys, refresh_tokens, users RESTART IDENTITY CASCADE`,
  );
  await redis.flushdb();
  await resetRateLimits();
  storage.clear();
  setStorage(storage);
});

afterAll(async () => {
  await closeQueues();
  if (redis.status !== 'wait' && redis.status !== 'end') await redis.quit();
  await pool.end();
});
