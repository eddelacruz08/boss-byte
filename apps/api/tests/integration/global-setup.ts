import path from 'node:path';
import pg from 'pg';
import { runMigrations } from '../../src/db/migrate';
import { assertDisposable, TEST_DATABASE_URL, TEST_REDIS_URL } from '../defaults';

/**
 * Runs once before the integration tests: creates the test database if it
 * does not exist yet and brings its schema up to date with the same SQL
 * migrations production uses.
 */
export default async function globalSetup(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL || TEST_DATABASE_URL;
  assertDisposable(databaseUrl, process.env.REDIS_URL || TEST_REDIS_URL);

  const target = new URL(databaseUrl);
  const database = target.pathname.slice(1);

  // CREATE DATABASE cannot run from inside the database it creates.
  const maintenance = new URL(databaseUrl);
  maintenance.pathname = '/postgres';
  const client = new pg.Client({ connectionString: maintenance.href });

  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `Integration tests need PostgreSQL at ${target.host} (start it with "npm run docker:up"): ` +
        (error as Error).message,
      { cause: error },
    );
  }

  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE ${client.escapeIdentifier(database)}`);
    }
  } finally {
    await client.end();
  }

  await runMigrations({
    connectionString: databaseUrl,
    directory: path.resolve(import.meta.dirname, '../../migrations'),
  });
}
