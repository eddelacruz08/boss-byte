import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM authenticated encryption for values stored in the database.
 *
 * A ciphertext is a single printable string:
 *
 *   v1.<keyId>.<iv>.<authTag>.<ciphertext>      (each part base64url)
 *
 * - A fresh random 96-bit IV is generated for every encryption, so encrypting
 *   the same value twice never yields the same output.
 * - The GCM auth tag makes tampering detectable: a modified payload fails to
 *   decrypt instead of returning garbage.
 * - `keyId` is a fingerprint of the key that produced the payload, which is
 *   what makes key rotation possible (see `Keyring`).
 * - An optional `context` (e.g. "users.phone") is bound in as additional
 *   authenticated data, so a ciphertext copied into another column or table
 *   will not decrypt there.
 */

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface EncryptionKey {
  /** Short, non-secret fingerprint used to pick the right key when decrypting. */
  id: string;
  key: Buffer;
}

export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecryptionError';
  }
}

/** Generates a new random key, base64-encoded for use in an environment variable. */
export function generateKey(): string {
  return randomBytes(KEY_BYTES).toString('base64');
}

export function parseKey(base64: string): EncryptionKey {
  const key = Buffer.from(base64, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(`Encryption keys must be ${KEY_BYTES} bytes, base64-encoded`);
  }
  const id = createHash('sha256').update(key).digest('hex').slice(0, 8);
  return { id, key };
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(`${VERSION}.`) && value.split('.').length === 5;
}

export class Keyring {
  private readonly keys = new Map<string, Buffer>();

  /**
   * @param active   Key used for all new encryptions.
   * @param previous Retired keys, kept only to decrypt rows not yet re-encrypted.
   */
  constructor(
    private readonly active: EncryptionKey,
    previous: readonly EncryptionKey[] = [],
  ) {
    for (const { id, key } of [active, ...previous]) this.keys.set(id, key);
  }

  static fromBase64(active: string, previous: readonly string[] = []): Keyring {
    return new Keyring(parseKey(active), previous.map(parseKey));
  }

  encrypt(plaintext: string, context = ''): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.active.key, iv);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      VERSION,
      this.active.id,
      ...[iv, tag, ciphertext].map((part) => part.toString('base64url')),
    ].join('.');
  }

  decrypt(payload: string, context = ''): string {
    const [version, keyId, iv, tag, ciphertext] = payload.split('.');
    if (version !== VERSION || !keyId || !iv || !tag || ciphertext === undefined) {
      throw new DecryptionError('Value is not a recognised ciphertext');
    }
    const key = this.keys.get(keyId);
    if (!key) {
      throw new DecryptionError(
        `No key with id "${keyId}" is loaded; was a retired key removed too early?`,
      );
    }

    const tagBuffer = Buffer.from(tag, 'base64url');
    if (tagBuffer.length !== TAG_BYTES) throw new DecryptionError('Malformed auth tag');

    try {
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'));
      decipher.setAAD(Buffer.from(context, 'utf8'));
      decipher.setAuthTag(tagBuffer);
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      // Deliberately vague: wrong key, wrong context and tampering are indistinguishable.
      throw new DecryptionError('Ciphertext failed authentication');
    }
  }

  /** True when the payload was produced by a retired key and should be re-encrypted. */
  needsRotation(payload: string): boolean {
    return payload.split('.')[1] !== this.active.id;
  }

  /** Re-encrypts a payload under the active key. */
  rotate(payload: string, context = ''): string {
    return this.encrypt(this.decrypt(payload, context), context);
  }
}

/**
 * A deterministic keyed hash (HMAC-SHA256) of a value, stored alongside its
 * ciphertext so the row can still be found by exact match. Because encryption
 * is randomised, `WHERE phone = $1` cannot work on an encrypted column;
 * `WHERE phone_bidx = blindIndex($1)` can.
 *
 * Normalise the value first (trim, lower-case, strip formatting) so that
 * equivalent inputs produce the same index.
 */
export function blindIndex(value: string, key: Buffer, context = ''): string {
  return createHmac('sha256', key).update(context).update('\0').update(value).digest('hex');
}
