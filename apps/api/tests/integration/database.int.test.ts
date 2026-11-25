import path from 'node:path';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { pool } from '../../src/db/client';
import { migrationStatus, runMigrations } from '../../src/db/migrate';
import { cached, invalidate, redis } from '../../src/lib/redis';
import { getStorage } from '../../src/lib/storage';
import { app } from './helpers';

const migrations = {
  connectionString: process.env.DATABASE_URL!,
  directory: path.resolve(import.meta.dirname, '../../migrations'),
};

describe('migrations', () => {
  it('have all been applied by the global setup', async () => {
    const status = await migrationStatus(migrations);
    expect(status.length).toBeGreaterThanOrEqual(3);
    expect(status.every((migration) => migration.state === 'applied')).toBe(true);
    expect(status.map((migration) => migration.name)).toEqual(
      status.map((migration) => migration.name).sort(),
    );
  });

  it('are idempotent: a second run applies nothing', async () => {
    expect(await runMigrations(migrations)).toEqual([]);
  });

  it('record a checksum, so an edited migration is noticed', async () => {
    const { rows } = await pool.query<{ name: string; checksum: string }>(
      'SELECT name, checksum FROM schema_migrations ORDER BY name LIMIT 1',
    );
    const original = rows[0]!;

    await pool.query('UPDATE schema_migrations SET checksum = $1 WHERE name = $2', [
      'tampered',
      original.name,
    ]);
    try {
      await expect(runMigrations(migrations)).rejects.toThrow(/was changed after it was applied/);
    } finally {
      await pool.query('UPDATE schema_migrations SET checksum = $1 WHERE name = $2', [
        original.checksum,
        original.name,
      ]);
    }
  });
});

describe('readiness probe', () => {
  it('reports the database, Redis and storage as reachable', async () => {
    const { body } = await request(app).get('/health/ready').expect(200);
    expect(body).toEqual({
      status: 'ok',
      checks: { database: 'ok', redis: 'ok', storage: 'ok' },
    });
  });

  it('stays ready, but says so, when only storage is unreachable', async () => {
    const storage = getStorage();
    const ping = vi.spyOn(storage, 'ping').mockRejectedValue(new Error('bucket unreachable'));
    try {
      const { body } = await request(app).get('/health/ready').expect(200);
      expect(body).toEqual({
        status: 'degraded',
        checks: { database: 'ok', redis: 'ok', storage: 'error' },
      });
    } finally {
      ping.mockRestore();
    }
  });
});

describe('cache', () => {
  it('loads once, serves from Redis until invalidated, and expires', async () => {
    let calls = 0;
    const load = async () => ({ value: (calls += 1) });

    expect(await cached('test:key', 60, load)).toEqual({ value: 1 });
    expect(await cached('test:key', 60, load)).toEqual({ value: 1 });
    expect(await redis.ttl('cache:test:key')).toBeGreaterThan(0);

    await invalidate('test:key');
    expect(await cached('test:key', 60, load)).toEqual({ value: 2 });
  });
});
