import { generateKeyPairSync, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { env } from '../../config/env';
import { getJwtKeys } from '../../config/keys';
import { hashPassword, verifyPassword } from './password';
import { signAccessToken, signMfaToken, verifyAccessToken, verifyMfaToken } from './tokens';
import { currentTotpCode, generateTotpSecret, verifyTotpCode } from './totp';

const errorWithCode = (code: string) => expect.objectContaining({ status: 401, code });

describe('passwords', () => {
  it('hashes with bcrypt and verifies', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('never verifies against a missing hash', async () => {
    expect(await verifyPassword('anything', null)).toBe(false);
    expect(await verifyPassword('timing-equaliser', undefined)).toBe(false);
  });
});

describe('access tokens', () => {
  const userId = randomUUID();

  it('round-trips the user and role', () => {
    const { accessToken, expiresIn } = signAccessToken({ userId, role: 'manager' });
    expect(expiresIn).toBe(900);
    expect(verifyAccessToken(accessToken)).toEqual({ userId, role: 'manager' });
  });

  it('is signed with RS256', () => {
    const { accessToken } = signAccessToken({ userId, role: 'admin' });
    expect(jwt.decode(accessToken, { complete: true })?.header.alg).toBe('RS256');
  });

  it('rejects garbage and tampered tokens', () => {
    const { accessToken } = signAccessToken({ userId, role: 'viewer' });
    const [header, , signature] = accessToken.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: userId, role: 'admin', typ: 'access' }),
    ).toString('base64url');

    expect(() => verifyAccessToken('not-a-token')).toThrowError(errorWithCode('invalid_token'));
    expect(() => verifyAccessToken(`${header}.${forgedPayload}.${signature}`)).toThrowError(
      errorWithCode('invalid_token'),
    );
  });

  it('rejects a token signed by a different key', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const forged = jwt.sign({ role: 'admin', typ: 'access' }, privateKey, {
      algorithm: 'RS256',
      subject: userId,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });
    expect(() => verifyAccessToken(forged)).toThrowError(errorWithCode('invalid_token'));
  });

  it('rejects HS256 tokens signed with the public key (key confusion)', () => {
    const forged = jwt.sign(
      { role: 'admin', typ: 'access', sub: userId, iss: env.JWT_ISSUER, aud: env.JWT_AUDIENCE },
      Buffer.from(getJwtKeys().publicKey).toString('base64'),
      { algorithm: 'HS256' },
    );
    expect(() => verifyAccessToken(forged)).toThrowError(errorWithCode('invalid_token'));
  });

  it('reports expiry distinctly, so clients know to refresh', () => {
    const expired = jwt.sign({ role: 'viewer', typ: 'access' }, getJwtKeys().privateKey, {
      algorithm: 'RS256',
      subject: userId,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      expiresIn: -10,
    });
    expect(() => verifyAccessToken(expired)).toThrowError(errorWithCode('token_expired'));
  });

  it('does not accept an MFA token as an access token, or the reverse', () => {
    const mfaToken = signMfaToken(userId);
    const { accessToken } = signAccessToken({ userId, role: 'admin' });

    expect(verifyMfaToken(mfaToken)).toBe(userId);
    expect(() => verifyAccessToken(mfaToken)).toThrowError(errorWithCode('invalid_token'));
    expect(() => verifyMfaToken(accessToken)).toThrowError(errorWithCode('invalid_token'));
  });
});

describe('TOTP', () => {
  const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
  const STEP = 30_000;

  it('creates a secret and an otpauth URI for authenticator apps', () => {
    const { secret, uri } = generateTotpSecret('ada@example.com');
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain('issuer=BossByte');
  });

  it('accepts the current code and returns its time step', () => {
    const { secret } = generateTotpSecret('ada@example.com');
    const code = currentTotpCode(secret, NOW);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotpCode(secret, code, NOW)).toBe(Math.floor(NOW / STEP));
  });

  it('tolerates one step of clock drift, and no more', () => {
    const { secret } = generateTotpSecret('ada@example.com');
    const code = currentTotpCode(secret, NOW);

    expect(verifyTotpCode(secret, code, NOW + STEP)).toBe(Math.floor(NOW / STEP));
    expect(verifyTotpCode(secret, code, NOW - STEP)).toBe(Math.floor(NOW / STEP));
    expect(verifyTotpCode(secret, code, NOW + 3 * STEP)).toBeNull();
  });

  it('rejects wrong codes and codes for another secret', () => {
    const first = generateTotpSecret('ada@example.com').secret;
    const second = generateTotpSecret('ada@example.com').secret;
    const code = currentTotpCode(first, NOW);
    const wrong = code === '000000' ? '000001' : '000000';

    expect(verifyTotpCode(first, wrong, NOW)).toBeNull();
    expect(verifyTotpCode(second, code, NOW)).toBeNull();
  });
});
