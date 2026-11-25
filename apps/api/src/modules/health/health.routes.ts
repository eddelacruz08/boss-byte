import { sql } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../../db/client';
import { redis } from '../../lib/redis';
import { getStorage } from '../../lib/storage';

const CHECK_TIMEOUT_MS = 2_000;

/** A dependency that hangs is as unhealthy as one that refuses the connection. */
function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), CHECK_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function check(run: () => Promise<unknown>): Promise<'ok' | 'error'> {
  try {
    await withTimeout(run());
    return 'ok';
  } catch {
    return 'error';
  }
}

export const healthRouter: Router = Router();

/**
 * Liveness: the process is up and able to answer. It deliberately checks
 * nothing else — restarting the API does not fix a database outage.
 */
healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
});

/**
 * Readiness: the dependencies a request needs are reachable. Load balancers
 * should poll this one. Object storage is reported but does not fail the probe:
 * only file endpoints need it, and taking every instance out of rotation would
 * turn a storage outage into a full one.
 */
healthRouter.get('/ready', async (_req, res) => {
  const [database, cache, storage] = await Promise.all([
    check(() => db.execute(sql`select 1`)),
    check(() => redis.ping()),
    check(() => getStorage().ping()),
  ]);
  const ready = database === 'ok' && cache === 'ok';
  res.status(ready ? 200 : 503).json({
    status: !ready ? 'unavailable' : storage === 'ok' ? 'ok' : 'degraded',
    checks: { database, redis: cache, storage },
  });
});
