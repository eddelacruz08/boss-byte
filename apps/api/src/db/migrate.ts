import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

/**
 * A deliberately small migration runner for hand-written SQL.
 *
 *   npm run db:migrate            apply every pending migration
 *   npm run db:migrate -- status  list applied and pending migrations
 *
 * - Files in `migrations/` are applied in filename order (0001_…, 0002_…).
 * - Each file runs in its own transaction: it applies completely or not at all.
 * - A session-level advisory lock stops two deploys migrating at once.
 * - A checksum of every applied file is recorded; editing an applied
 *   migration is reported as an error rather than silently ignored.
 */

const LOCK_KEY = 7_265_112_001;

export interface MigrateOptions {
  connectionString: string;
  ssl?: boolean;
  /** Directory containing the .sql files. Defaults to ./migrations. */
  directory?: string;
  log?: (message: string) => void;
}

interface MigrationFile {
  name: string;
  sql: string;
  checksum: string;
}

async function readMigrations(directory: string): Promise<MigrationFile[]> {
  const names = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(path.join(directory, name), 'utf8');
      return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
    }),
  );
}

async function withClient<T>(
  options: MigrateOptions,
  run: (client: pg.Client, migrations: MigrationFile[], applied: Map<string, string>) => Promise<T>,
): Promise<T> {
  const directory = path.resolve(options.directory ?? process.env.MIGRATIONS_DIR ?? 'migrations');
  const migrations = await readMigrations(directory);
  const client = new pg.Client({
    connectionString: options.connectionString,
    ssl: options.ssl ? { rejectUnauthorized: true } : undefined,
  });
  await client.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       text PRIMARY KEY,
        checksum   text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query<{ name: string; checksum: string }>(
      'SELECT name, checksum FROM schema_migrations',
    );
    return await run(client, migrations, new Map(rows.map((row) => [row.name, row.checksum])));
  } finally {
    // Closing the session also releases the advisory lock.
    await client.end();
  }
}

/** Applies all pending migrations and returns the names of those it ran. */
export function runMigrations(options: MigrateOptions): Promise<string[]> {
  const log = options.log ?? (() => {});

  return withClient(options, async (client, migrations, applied) => {
    const ran: string[] = [];

    for (const migration of migrations) {
      const recorded = applied.get(migration.name);
      if (recorded !== undefined) {
        if (recorded !== migration.checksum) {
          throw new Error(
            `Migration ${migration.name} was changed after it was applied. ` +
              'Restore the original file and put the change in a new migration.',
          );
        }
        continue;
      }

      log(`Applying ${migration.name}`);
      try {
        await client.query('BEGIN');
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [
          migration.name,
          migration.checksum,
        ]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${migration.name} failed: ${(error as Error).message}`, {
          cause: error,
        });
      }
      ran.push(migration.name);
    }

    log(ran.length === 0 ? 'Database is up to date' : `Applied ${ran.length} migration(s)`);
    return ran;
  });
}

export function migrationStatus(options: MigrateOptions) {
  return withClient(options, async (_client, migrations, applied) =>
    migrations.map((migration) => ({
      name: migration.name,
      state: applied.has(migration.name) ? ('applied' as const) : ('pending' as const),
    })),
  );
}

async function main() {
  // Imported lazily so the functions above can be used without a full API environment.
  const { env } = await import('../config/env');
  const options = { connectionString: env.DATABASE_URL, ssl: env.DATABASE_SSL, log: console.log };

  if (process.argv[2] === 'status') {
    for (const { name, state } of await migrationStatus(options)) {
      console.log(`${state === 'applied' ? '✓' : '·'} ${name} (${state})`);
    }
    return;
  }
  await runMigrations(options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
