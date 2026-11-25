import type { Role } from '@bossbyte/shared';
import { isProduction } from '../config/env';
import { createUser, findUserByEmail } from '../modules/users/users.service';
import { pool } from './client';

/**
 * Creates one account per role so every permission level can be tried out
 * straight after installation.
 *
 *   npm run db:seed
 *
 * Safe to run repeatedly: accounts that already exist are left untouched.
 * Set SEED_PASSWORD to choose the password; the default is for local
 * development only and is refused in production.
 */

const DEFAULT_PASSWORD = 'BossByte-Dev-2026';

const ACCOUNTS: { email: string; name: string; role: Role; phone: string }[] = [
  { email: 'admin@bossbyte.local', name: 'Ada Admin', role: 'admin', phone: '+63 917 555 0101' },
  {
    email: 'manager@bossbyte.local',
    name: 'Miguel Manager',
    role: 'manager',
    phone: '+63 917 555 0102',
  },
  { email: 'staff@bossbyte.local', name: 'Sam Staff', role: 'staff', phone: '+63 917 555 0103' },
  {
    email: 'viewer@bossbyte.local',
    name: 'Vera Viewer',
    role: 'viewer',
    phone: '+63 917 555 0104',
  },
];

async function main() {
  const password = process.env.SEED_PASSWORD || DEFAULT_PASSWORD;
  if (isProduction && password === DEFAULT_PASSWORD) {
    throw new Error('Refusing to seed production with the default password. Set SEED_PASSWORD.');
  }

  for (const account of ACCOUNTS) {
    if (await findUserByEmail(account.email)) {
      console.log(`· ${account.email} already exists`);
      continue;
    }
    // Phone numbers go through the encrypted column, so the seed doubles as a
    // demonstration: look at the `phone` column in pgAdmin and you see ciphertext.
    await createUser({ ...account, password });
    console.log(`✓ ${account.email} (${account.role})`);
  }

  console.log(`\nSign in with any of the accounts above. Password: ${password}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
