import { randomUUID } from 'node:crypto';
import { ROLES, SECURITY, type Role } from '@bossbyte/shared';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { getJwtKeys } from '../../config/keys';
import { unauthorized } from '../../lib/errors';

/**
 * RS256 JWTs. The API signs with the private key; anything that only needs to
 * verify a token (another service, a gateway) needs just the public key.
 *
 * Two kinds of token are issued, told apart by the `typ` claim so that one
 * can never be replayed as the other:
 *   - "access": authorises API calls for a few minutes.
 *   - "mfa":    proves the password step succeeded; only valid for /auth/mfa/verify.
 */
type TokenType = 'access' | 'mfa';

export interface AccessTokenClaims {
  userId: string;
  role: Role;
}

function sign(type: TokenType, subject: string, claims: object, expiresInSeconds: number): string {
  return jwt.sign({ ...claims, typ: type }, getJwtKeys().privateKey, {
    algorithm: 'RS256',
    subject,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    expiresIn: expiresInSeconds,
    jwtid: randomUUID(),
  });
}

function verify(type: TokenType, token: string): jwt.JwtPayload {
  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, getJwtKeys().publicKey, {
      // Pinning the algorithm blocks "alg: none" and HS256 key-confusion attacks.
      algorithms: ['RS256'],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw unauthorized('Token has expired', 'token_expired');
    }
    throw unauthorized('Invalid token', 'invalid_token');
  }

  if (typeof payload === 'string' || payload.typ !== type || !payload.sub) {
    throw unauthorized('Invalid token', 'invalid_token');
  }
  return payload;
}

export function signAccessToken({ userId, role }: AccessTokenClaims) {
  const expiresIn = SECURITY.tokens.accessTtlSeconds;
  return { accessToken: sign('access', userId, { role }, expiresIn), expiresIn };
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  const payload = verify('access', token);
  if (!ROLES.includes(payload.role)) throw unauthorized('Invalid token', 'invalid_token');
  return { userId: payload.sub!, role: payload.role as Role };
}

export function signMfaToken(userId: string): string {
  return sign('mfa', userId, {}, SECURITY.tokens.mfaChallengeTtlSeconds);
}

/** Returns the id of the user who passed the password step. */
export function verifyMfaToken(token: string): string {
  return verify('mfa', token).sub!;
}
