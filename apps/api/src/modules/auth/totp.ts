import { SECURITY } from '@bossbyte/shared';
import { Secret, TOTP } from 'otpauth';
import { env } from '../../config/env';

/** Time-based one-time passwords (RFC 6238), compatible with any authenticator app. */

function totpFor(secretBase32: string, accountName: string): TOTP {
  return new TOTP({
    issuer: env.APP_NAME,
    label: accountName,
    algorithm: SECURITY.totp.algorithm,
    digits: SECURITY.totp.digits,
    period: SECURITY.totp.periodSeconds,
    secret: Secret.fromBase32(secretBase32),
  });
}

/** Creates a new shared secret and the `otpauth://` URI that enrols it in an app. */
export function generateTotpSecret(accountName: string): { secret: string; uri: string } {
  const secret = new Secret({ size: 20 }).base32;
  return { secret, uri: totpFor(secret, accountName).toString() };
}

/**
 * Checks a code against the secret, tolerating a little clock drift. Returns
 * the matching time-step counter, or null when the code is wrong.
 */
export function verifyTotpCode(secretBase32: string, code: string, timestamp = Date.now()) {
  const delta = totpFor(secretBase32, '').validate({
    token: code,
    timestamp,
    window: SECURITY.totp.window,
  });
  if (delta === null) return null;
  return Math.floor(timestamp / 1000 / SECURITY.totp.periodSeconds) + delta;
}

/** The code an authenticator app would currently show. Used by tests and tooling. */
export function currentTotpCode(secretBase32: string, timestamp = Date.now()): string {
  return totpFor(secretBase32, '').generate({ timestamp });
}
