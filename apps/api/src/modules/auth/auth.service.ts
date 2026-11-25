import {
  SECURITY,
  type AuthTokens,
  type ChangePasswordInput,
  type LoginInput,
  type MfaVerifyInput,
  type RegisterInput,
  type Role,
  type TotpSetupResponse,
} from '@bossbyte/shared';
import { eq } from 'drizzle-orm';
import { env } from '../../config/env';
import { db } from '../../db/client';
import { users } from '../../db/schema';
import { enqueueEmail } from '../../jobs/queues';
import { audit } from '../../lib/audit';
import { qrCodeDataUrl } from '../../lib/documents/qrcode';
import { badRequest, forbidden, tooManyRequests, unauthorized } from '../../lib/errors';
import { verifyFirebaseIdToken } from '../../lib/firebase';
import { redis } from '../../lib/redis';
import {
  createUser,
  findUserByEmail,
  findUserById,
  getUserById,
  type UserRecord,
} from '../users/users.service';
import { hashPassword, verifyPassword } from './password';
import {
  issueRefreshToken,
  revokeAllSessions,
  rotateRefreshToken,
  type SessionMeta,
} from './sessions';
import { signAccessToken, signMfaToken, verifyMfaToken } from './tokens';
import { generateTotpSecret, verifyTotpCode } from './totp';

/** What a completed sign-in yields. The refresh token goes into a cookie, never the body. */
export interface Session extends AuthTokens {
  refreshToken: string;
}

export type LoginOutcome =
  { mfaRequired: false; session: Session } | { mfaRequired: true; mfaToken: string };

type LoginMethod = 'password' | 'totp' | 'passkey' | 'firebase' | 'register';

// ─── Brute-force protection ─────────────────────────────────────────────────

const failureKey = (subject: string) => `auth:failures:${subject}`;

async function assertNotLockedOut(subject: string): Promise<void> {
  const failures = Number(await redis.get(failureKey(subject)));
  if (failures >= SECURITY.lockout.maxFailedAttempts) {
    throw tooManyRequests(
      'Too many failed attempts. Please wait a few minutes and try again.',
      'account_locked',
    );
  }
}

async function recordFailure(subject: string): Promise<void> {
  const key = failureKey(subject);
  const failures = await redis.incr(key);
  if (failures === 1) await redis.expire(key, SECURITY.lockout.windowSeconds);
}

// ─── Sessions ───────────────────────────────────────────────────────────────

async function startSession(
  user: { id: string; role: Role },
  meta: SessionMeta,
  method: LoginMethod,
): Promise<Session> {
  const refreshToken = await issueRefreshToken(user.id, meta);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await audit({
    action: method === 'register' ? 'auth.register' : 'auth.login',
    userId: user.id,
    metadata: { method, ...meta },
  });
  return { ...signAccessToken({ userId: user.id, role: user.role }), refreshToken };
}

/** Finishes a sign-in, or hands back an MFA challenge when the account uses 2FA. */
async function completeFirstFactor(
  user: UserRecord,
  meta: SessionMeta,
  method: LoginMethod,
): Promise<LoginOutcome> {
  if (!user.isActive) throw forbidden('This account has been deactivated', 'account_disabled');
  if (user.totpEnabled) return { mfaRequired: true, mfaToken: signMfaToken(user.id) };
  return { mfaRequired: false, session: await startSession(user, meta, method) };
}

// ─── Password sign-in ───────────────────────────────────────────────────────

export async function register(input: RegisterInput, meta: SessionMeta): Promise<Session> {
  const user = await createUser({ ...input, role: 'viewer' });
  await enqueueEmail({
    to: user.email,
    subject: `Welcome to ${env.APP_NAME}`,
    text: `Hi ${user.name},\n\nYour ${env.APP_NAME} account is ready. Sign in at ${env.APP_URL}.\n`,
  });
  return startSession(user, meta, 'register');
}

export async function login(input: LoginInput, meta: SessionMeta): Promise<LoginOutcome> {
  await assertNotLockedOut(input.email);

  const user = await findUserByEmail(input.email);
  const passwordMatches = await verifyPassword(input.password, user?.passwordHash);
  if (!user || !passwordMatches) {
    await recordFailure(input.email);
    await audit({
      action: 'auth.login_failed',
      userId: user?.id,
      metadata: { email: input.email, ...meta },
    });
    // One message for both cases, so the response does not reveal which emails exist.
    throw unauthorized('Invalid email or password', 'invalid_credentials');
  }

  await redis.del(failureKey(input.email));
  return completeFirstFactor(user, meta, 'password');
}

/**
 * Checks a TOTP code and uses it up. A code stays valid for up to 90 seconds;
 * remembering the time step it belongs to stops an observed code from being
 * used a second time.
 */
async function consumeTotpCode(userId: string, secret: string, code: string): Promise<boolean> {
  const counter = verifyTotpCode(secret, code);
  if (counter === null) return false;
  const firstUse = await redis.set(`auth:totp-used:${userId}:${counter}`, '1', 'EX', 120, 'NX');
  return firstUse === 'OK';
}

export async function verifyMfa(input: MfaVerifyInput, meta: SessionMeta): Promise<Session> {
  const userId = verifyMfaToken(input.mfaToken);
  await assertNotLockedOut(userId);

  const user = await findUserById(userId);
  if (!user?.isActive || !user.totpEnabled || !user.totpSecret) {
    throw unauthorized('Invalid token', 'invalid_token');
  }

  if (!(await consumeTotpCode(userId, user.totpSecret, input.code))) {
    await recordFailure(userId);
    throw unauthorized('That code is not valid', 'invalid_totp_code');
  }

  await redis.del(failureKey(userId));
  return startSession(user, meta, 'totp');
}

export async function refreshSession(token: string, meta: SessionMeta): Promise<Session> {
  const { userId, refreshToken } = await rotateRefreshToken(token, meta);
  const user = await findUserById(userId);
  if (!user?.isActive) throw unauthorized('Session is no longer valid', 'invalid_refresh_token');
  // Re-reading the user means role changes take effect at the next refresh.
  return { ...signAccessToken({ userId: user.id, role: user.role }), refreshToken };
}

export async function changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
  const user = await getUserById(userId);
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw badRequest('Current password is incorrect', 'invalid_password');
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(input.newPassword), updatedAt: new Date() })
    .where(eq(users.id, userId));
  // A password change signs the account out everywhere.
  await revokeAllSessions(userId);
  await audit({ action: 'auth.password_changed', userId });
  await enqueueEmail({
    to: user.email,
    subject: `Your ${env.APP_NAME} password was changed`,
    text: `Hi ${user.name},\n\nYour password was just changed. If this was not you, contact an administrator immediately.\n`,
  });
}

// ─── Other first factors ────────────────────────────────────────────────────

/** A verified passkey is already possession plus biometrics or a PIN, so no TOTP step follows. */
export async function loginWithPasskey(userId: string, meta: SessionMeta): Promise<Session> {
  const user = await findUserById(userId);
  if (!user?.isActive) throw forbidden('This account has been deactivated', 'account_disabled');
  return startSession(user, meta, 'passkey');
}

export async function loginWithFirebase(idToken: string, meta: SessionMeta): Promise<LoginOutcome> {
  const identity = await verifyFirebaseIdToken(idToken);

  const [linked] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.firebaseUid, identity.uid));
  let user = linked ? await findUserById(linked.id) : await findUserByEmail(identity.email);

  if (!user) {
    user = await createUser({
      email: identity.email,
      name: identity.name,
      role: 'viewer',
      firebaseUid: identity.uid,
    });
  } else if (!user.firebaseUid) {
    // First Firebase sign-in for an existing account: link the two by verified email.
    await db.update(users).set({ firebaseUid: identity.uid }).where(eq(users.id, user.id));
  }

  return completeFirstFactor(user, meta, 'firebase');
}

// ─── TOTP enrolment ─────────────────────────────────────────────────────────

/** Step 1: create a secret and show it to the user. 2FA is not active until step 2. */
export async function setupTotp(userId: string): Promise<TotpSetupResponse> {
  const user = await getUserById(userId);
  if (user.totpEnabled) {
    throw badRequest('Two-factor authentication is already enabled', 'totp_already_enabled');
  }

  const { secret, uri } = generateTotpSecret(user.email);
  // Encrypted at rest by the column type.
  await db.update(users).set({ totpSecret: secret }).where(eq(users.id, userId));
  return { secret, uri, qrCodeDataUrl: await qrCodeDataUrl(uri) };
}

/** Step 2: prove the authenticator app is set up by entering a code from it. */
export async function enableTotp(userId: string, code: string): Promise<void> {
  const user = await getUserById(userId);
  if (user.totpEnabled) {
    throw badRequest('Two-factor authentication is already enabled', 'totp_already_enabled');
  }
  if (!user.totpSecret) throw badRequest('Start two-factor setup first', 'totp_not_set_up');
  // Used up here too, so the code that turned 2FA on cannot also sign someone in.
  if (!(await consumeTotpCode(userId, user.totpSecret, code))) {
    throw badRequest('That code is not valid', 'invalid_totp_code');
  }

  await db
    .update(users)
    .set({ totpEnabled: true, updatedAt: new Date() })
    .where(eq(users.id, userId));
  await audit({ action: 'auth.totp_enabled', userId });
}

export async function disableTotp(userId: string, password: string): Promise<void> {
  const user = await getUserById(userId);
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw badRequest('Password is incorrect', 'invalid_password');
  }

  await db
    .update(users)
    .set({ totpEnabled: false, totpSecret: null, updatedAt: new Date() })
    .where(eq(users.id, userId));
  await audit({ action: 'auth.totp_disabled', userId });
}
