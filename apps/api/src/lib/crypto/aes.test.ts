import { describe, expect, it } from 'vitest';
import { blindIndex, DecryptionError, generateKey, isEncrypted, Keyring, parseKey } from './aes';

const keyring = () => Keyring.fromBase64(generateKey());

describe('Keyring', () => {
  it('round-trips text, including unicode and the empty string', () => {
    const ring = keyring();
    for (const value of ['hello', '', 'π ≈ 3.14159 — 日本語 🚀', 'x'.repeat(10_000)]) {
      expect(ring.decrypt(ring.encrypt(value))).toBe(value);
    }
  });

  it('never produces the same ciphertext twice', () => {
    const ring = keyring();
    const first = ring.encrypt('same value');
    const second = ring.encrypt('same value');
    expect(first).not.toBe(second);
    expect(isEncrypted(first)).toBe(true);
    expect(first).not.toContain('same value');
  });

  it('rejects tampered payloads', () => {
    const ring = keyring();
    const parts = ring.encrypt('do not touch').split('.');
    const ciphertext = Buffer.from(parts[4]!, 'base64url');
    ciphertext[0] = ciphertext[0]! ^ 0xff;
    parts[4] = ciphertext.toString('base64url');
    expect(() => ring.decrypt(parts.join('.'))).toThrow(DecryptionError);
  });

  it('binds a ciphertext to its context', () => {
    const ring = keyring();
    const payload = ring.encrypt('+1 555 0100', 'users.phone');
    expect(ring.decrypt(payload, 'users.phone')).toBe('+1 555 0100');
    expect(() => ring.decrypt(payload, 'users.totp_secret')).toThrow(DecryptionError);
  });

  it('rejects values that are not ciphertexts or use an unknown key', () => {
    const ring = keyring();
    expect(() => ring.decrypt('plain text')).toThrow(DecryptionError);
    expect(() => ring.decrypt(keyring().encrypt('other key'))).toThrow(/No key with id/);
  });

  it('decrypts with a retired key and rotates onto the active one', () => {
    const oldKey = generateKey();
    const newKey = generateKey();
    const legacy = Keyring.fromBase64(oldKey).encrypt('secret', 'ctx');

    const ring = Keyring.fromBase64(newKey, [oldKey]);
    expect(ring.decrypt(legacy, 'ctx')).toBe('secret');
    expect(ring.needsRotation(legacy)).toBe(true);

    const rotated = ring.rotate(legacy, 'ctx');
    expect(ring.needsRotation(rotated)).toBe(false);
    // Once rotated, the retired key is no longer needed.
    expect(Keyring.fromBase64(newKey).decrypt(rotated, 'ctx')).toBe('secret');
  });
});

describe('parseKey', () => {
  it('requires exactly 32 bytes', () => {
    expect(() => parseKey(Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/);
    expect(parseKey(generateKey()).id).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('blindIndex', () => {
  const key = parseKey(generateKey()).key;

  it('is deterministic for a key and context, and differs otherwise', () => {
    expect(blindIndex('a@b.co', key, 'users.email')).toBe(blindIndex('a@b.co', key, 'users.email'));
    expect(blindIndex('a@b.co', key, 'users.email')).not.toBe(blindIndex('a@b.co', key, 'other'));
    expect(blindIndex('a@b.co', key)).not.toBe(blindIndex('a@b.co', parseKey(generateKey()).key));
  });
});
