/**
 * Where the integration tests keep their data. Both are separate from what
 * `npm run dev` uses, because the tests empty them between cases.
 */
export const TEST_DATABASE_URL = 'postgres://bossbyte:bossbyte@localhost:5432/bossbyte_test';
export const TEST_REDIS_URL = 'redis://localhost:6379/1';

/**
 * The integration tests truncate every table and flush Redis before each
 * case. Refuse to do that to anything that does not look disposable, in case
 * DATABASE_URL or REDIS_URL was exported in the shell for another purpose.
 */
export function assertDisposable(databaseUrl: string, redisUrl: string): void {
  const database = new URL(databaseUrl).pathname.slice(1);
  if (!database.endsWith('_test')) {
    throw new Error(
      `Refusing to run integration tests against the database "${database}": ` +
        'its name must end in "_test".',
    );
  }

  const redisDatabase = new URL(redisUrl).pathname.slice(1);
  if (redisDatabase === '' || redisDatabase === '0') {
    throw new Error(
      'Refusing to run integration tests against Redis database 0: ' +
        'point REDIS_URL at another one, e.g. redis://localhost:6379/1.',
    );
  }
}
