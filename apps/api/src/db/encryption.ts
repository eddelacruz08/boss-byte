import { customType } from 'drizzle-orm/pg-core';
import { env } from '../config/env';
import { blindIndex, Keyring } from '../lib/crypto/aes';

/** The keyring built from DATA_ENCRYPTION_KEY and DATA_ENCRYPTION_PREVIOUS_KEYS. */
export const keyring = Keyring.fromBase64(
  env.DATA_ENCRYPTION_KEY,
  env.DATA_ENCRYPTION_PREVIOUS_KEYS,
);

const blindIndexKey = Buffer.from(env.BLIND_INDEX_KEY, 'base64');

/**
 * A `text` column whose value is transparently encrypted with AES-256-GCM on
 * the way into PostgreSQL and decrypted on the way out. Application code only
 * ever sees plaintext; the database only ever stores ciphertext.
 *
 * `context` must be unique per column — by convention "<table>.<column>" — and
 * must never change once data exists, because it is authenticated together
 * with the ciphertext.
 *
 * @example
 *   phone: encryptedText('users.phone')('phone'),
 */
export function encryptedText(context: string) {
  return customType<{ data: string; driverData: string }>({
    dataType: () => 'text',
    toDriver: (value) => keyring.encrypt(value, context),
    fromDriver: (value) => keyring.decrypt(value, context),
  });
}

/**
 * Like `encryptedText`, for structured values. Stored as encrypted JSON.
 *
 * @public Part of the toolkit; no table in the starter schema needs it yet.
 */
export function encryptedJson<T>(context: string) {
  return customType<{ data: T; driverData: string }>({
    dataType: () => 'text',
    toDriver: (value) => keyring.encrypt(JSON.stringify(value), context),
    fromDriver: (value) => JSON.parse(keyring.decrypt(value, context)) as T,
  });
}

/**
 * Blind index for exact-match lookups on an encrypted column. Store the result
 * in a sibling column (e.g. `phone_bidx`) and query that instead.
 */
export function searchableHash(value: string, context: string): string {
  return blindIndex(value, blindIndexKey, context);
}

/** Canonical form of a phone number for blind indexing: digits only, with a leading "+" kept. */
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  return (trimmed.startsWith('+') ? '+' : '') + trimmed.replace(/\D/g, '');
}
