import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import * as schema from './schema';

/** Connections are opened on demand, so importing this module is side-effect free. */
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: true } : undefined,
});

pool.on('error', (error) => logger.error({ err: error }, 'Unexpected PostgreSQL pool error'));

export const db = drizzle(pool, { schema });

/** @public */
export type Database = typeof db;
/**
 * The handle passed to a `db.transaction(async (tx) => …)` callback.
 *
 * @public
 */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
