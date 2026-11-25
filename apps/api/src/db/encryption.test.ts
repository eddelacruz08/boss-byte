import { describe, expect, it } from 'vitest';
import { isEncrypted } from '../lib/crypto/aes';
import { keyring, normalizePhone, searchableHash } from './encryption';
import { users } from './schema';

describe('encrypted columns', () => {
  it('encrypts on the way to the database and decrypts on the way back', () => {
    const stored = users.phone.mapToDriverValue('+63 917 555 0101') as string;

    expect(isEncrypted(stored)).toBe(true);
    expect(stored).not.toContain('917');
    expect(users.phone.mapFromDriverValue(stored)).toBe('+63 917 555 0101');
  });

  it('binds each ciphertext to its own column', () => {
    const phone = users.phone.mapToDriverValue('JBSWY3DPEHPK3PXP') as string;

    // Moving a ciphertext from users.phone into users.totp_secret must not decrypt.
    expect(() => users.totpSecret.mapFromDriverValue(phone)).toThrow('failed authentication');
    expect(keyring.decrypt(phone, 'users.phone')).toBe('JBSWY3DPEHPK3PXP');
  });
});

describe('blind index', () => {
  it('is deterministic, so equal values can be found', () => {
    const first = searchableHash(normalizePhone('+63 917 555 0101'), 'users.phone');
    const second = searchableHash(normalizePhone('+63-917-555-0101'), 'users.phone');
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs between values and between columns', () => {
    const phone = searchableHash('+639175550101', 'users.phone');
    expect(searchableHash('+639175550102', 'users.phone')).not.toBe(phone);
    expect(searchableHash('+639175550101', 'customers.phone')).not.toBe(phone);
  });

  it('normalises phone numbers', () => {
    expect(normalizePhone(' +63 (917) 555-0101 ')).toBe('+639175550101');
    expect(normalizePhone('0917 555 0101')).toBe('09175550101');
  });
});
