import { pool } from './client';
import { keyring } from './encryption';

/**
 * Re-encrypts every encrypted column under the current DATA_ENCRYPTION_KEY.
 *
 *   npm run db:rotate-keys -- --dry-run   count the rows that would change
 *   npm run db:rotate-keys                re-encrypt them
 *
 * Rotating a key:
 *   1. Generate a new key and set it as DATA_ENCRYPTION_KEY.
 *   2. Append the old key to DATA_ENCRYPTION_PREVIOUS_KEYS and deploy. New
 *      writes now use the new key; old rows still decrypt with the old one.
 *   3. Run this script.
 *   4. Once it reports nothing left to rotate, remove the old key.
 *
 * The script can be interrupted and re-run: rows already on the current key
 * are skipped. Blind indexes use BLIND_INDEX_KEY and are not affected.
 */

interface EncryptedColumn {
  table: string;
  column: string;
  /** Must match the context given to `encryptedText` in db/schema.ts. */
  context: string;
}

/** Add an entry here whenever a new encrypted column is introduced. */
const ENCRYPTED_COLUMNS: EncryptedColumn[] = [
  { table: 'users', column: 'phone', context: 'users.phone' },
  { table: 'users', column: 'totp_secret', context: 'users.totp_secret' },
];

const BATCH_SIZE = 500;

async function rotateColumn({ table, column, context }: EncryptedColumn, dryRun: boolean) {
  let rotated = 0;
  let scanned = 0;
  let lastId = '00000000-0000-0000-0000-000000000000';

  // Identifiers come from the constant above, never from input, so interpolating them is safe.
  for (;;) {
    const { rows } = await pool.query<{ id: string; value: string }>(
      `SELECT id, ${column} AS value FROM ${table}
        WHERE ${column} IS NOT NULL AND id > $1
        ORDER BY id LIMIT ${BATCH_SIZE}`,
      [lastId],
    );
    if (rows.length === 0) break;

    for (const row of rows) {
      scanned++;
      if (!keyring.needsRotation(row.value)) continue;
      rotated++;
      if (dryRun) continue;
      // Matching on the old value means a row edited in the meantime is left alone;
      // it was already written with the current key.
      await pool.query(`UPDATE ${table} SET ${column} = $1 WHERE id = $2 AND ${column} = $3`, [
        keyring.rotate(row.value, context),
        row.id,
        row.value,
      ]);
    }
    lastId = rows.at(-1)!.id;
  }

  console.log(
    `${table}.${column}: ${rotated} of ${scanned} row(s) ${dryRun ? 'need rotating' : 'rotated'}`,
  );
  return rotated;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  let total = 0;
  for (const column of ENCRYPTED_COLUMNS) total += await rotateColumn(column, dryRun);

  if (total === 0) {
    console.log('Every row is on the current key. Retired keys can be removed.');
  } else if (dryRun) {
    console.log(`${total} value(s) would be re-encrypted. Run again without --dry-run.`);
  } else {
    console.log(`Re-encrypted ${total} value(s).`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
