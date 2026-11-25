import { SECURITY } from '@bossbyte/shared';
import bcrypt from 'bcrypt';
import { isTest } from '../../config/env';

// bcrypt is intentionally slow; a low cost keeps the test suite fast.
const ROUNDS = isTest ? 4 : SECURITY.password.bcryptRounds;

// Compared against when the account does not exist, so that a login attempt
// takes the same time whether or not the email is registered.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', ROUNDS);

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string | null | undefined,
): Promise<boolean> {
  const matches = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return Boolean(hash) && matches;
}
