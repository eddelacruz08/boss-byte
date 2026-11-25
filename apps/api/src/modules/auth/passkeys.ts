import { randomUUID } from 'node:crypto';
import { SECURITY, type Passkey } from '@bossbyte/shared';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { and, eq } from 'drizzle-orm';
import { env } from '../../config/env';
import { db } from '../../db/client';
import { passkeys, type PasskeyRow } from '../../db/schema';
import { badRequest, notFound, unauthorized } from '../../lib/errors';
import { redis } from '../../lib/redis';

/**
 * WebAuthn passkeys. Every ceremony is two requests: the server issues options
 * containing a random challenge, the browser has an authenticator sign it, and
 * the server verifies the result. Challenges are kept in Redis with a short
 * TTL and deleted on first use, so they cannot be replayed.
 */

const expectedOrigin = new URL(env.APP_URL).origin;
const challengeTtl = SECURITY.webauthn.challengeTtlSeconds;

const registrationKey = (userId: string) => `webauthn:register:${userId}`;
const authenticationKey = (challengeId: string) => `webauthn:login:${challengeId}`;

/** Reads a challenge and deletes it in the same step. */
async function consumeChallenge(key: string): Promise<string> {
  const challenge = await redis.getdel(key);
  if (!challenge)
    throw badRequest('The passkey request expired. Please try again.', 'challenge_expired');
  return challenge;
}

export function toPasskeyDto(row: PasskeyRow): Passkey {
  return {
    id: row.id,
    name: row.name,
    deviceType: row.deviceType,
    backedUp: row.backedUp,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  };
}

export async function listPasskeys(userId: string): Promise<Passkey[]> {
  const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
  return rows.map(toPasskeyDto);
}

export async function deletePasskey(userId: string, passkeyId: string): Promise<void> {
  const deleted = await db
    .delete(passkeys)
    .where(and(eq(passkeys.id, passkeyId), eq(passkeys.userId, userId)))
    .returning({ id: passkeys.id });
  if (deleted.length === 0) throw notFound('Passkey not found', 'passkey_not_found');
}

export async function createRegistrationOptions(user: { id: string; email: string; name: string }) {
  const existing = await db.select().from(passkeys).where(eq(passkeys.userId, user.id));

  const options = await generateRegistrationOptions({
    rpName: env.WEBAUTHN_RP_NAME,
    rpID: env.WEBAUTHN_RP_ID,
    userName: user.email,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(user.id),
    attestationType: 'none',
    // Stops the same authenticator being enrolled twice.
    excludeCredentials: existing.map((row) => ({
      id: row.credentialId,
      transports: row.transports,
    })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });

  await redis.set(registrationKey(user.id), options.challenge, 'EX', challengeTtl);
  return options;
}

export async function verifyRegistration(
  userId: string,
  response: RegistrationResponseJSON,
  name: string,
): Promise<Passkey> {
  const expectedChallenge = await consumeChallenge(registrationKey(userId));

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin,
    expectedRPID: env.WEBAUTHN_RP_ID,
  }).catch((error: Error) => {
    throw badRequest(
      `Passkey could not be verified: ${error.message}`,
      'passkey_verification_failed',
    );
  });
  if (!verification.verified) {
    throw badRequest('Passkey could not be verified', 'passkey_verification_failed');
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const [row] = await db
    .insert(passkeys)
    .values({
      userId,
      name,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: credential.transports ?? [],
    })
    .returning();
  return toPasskeyDto(row!);
}

/**
 * Starts a passkey sign-in. No account needs to be named up front: with
 * discoverable credentials the authenticator itself offers the accounts it
 * holds for this site.
 */
export async function createAuthenticationOptions() {
  const options = await generateAuthenticationOptions({
    rpID: env.WEBAUTHN_RP_ID,
    userVerification: 'preferred',
  });

  const challengeId = randomUUID();
  await redis.set(authenticationKey(challengeId), options.challenge, 'EX', challengeTtl);
  return { challengeId, options };
}

/** Verifies a passkey assertion and returns the id of the user it belongs to. */
export async function verifyAuthentication(
  challengeId: string,
  response: AuthenticationResponseJSON,
): Promise<string> {
  const expectedChallenge = await consumeChallenge(authenticationKey(challengeId));

  const [passkey] = await db.select().from(passkeys).where(eq(passkeys.credentialId, response.id));
  if (!passkey) throw unauthorized('Passkey not recognised', 'passkey_not_recognised');

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin,
    expectedRPID: env.WEBAUTHN_RP_ID,
    credential: {
      id: passkey.credentialId,
      publicKey: Buffer.from(passkey.publicKey, 'base64url'),
      counter: passkey.counter,
      transports: passkey.transports,
    },
  }).catch(() => {
    throw unauthorized('Passkey could not be verified', 'passkey_verification_failed');
  });
  if (!verification.verified) {
    throw unauthorized('Passkey could not be verified', 'passkey_verification_failed');
  }

  // The signature counter lets us notice a cloned authenticator next time.
  await db
    .update(passkeys)
    .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(eq(passkeys.id, passkey.id));

  return passkey.userId;
}
