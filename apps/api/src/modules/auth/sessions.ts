import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SECURITY } from '@bossbyte/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client';
import { refreshTokens } from '../../db/schema';
import { audit } from '../../lib/audit';
import { unauthorized } from '../../lib/errors';

/**
 * Refresh-token rotation with reuse detection.
 *
 * A refresh token is an opaque random string, usable exactly once: exchanging
 * it revokes it and issues a successor in the same "family". If a revoked
 * token is ever presented again, either the legitimate user or an attacker is
 * holding a stolen copy — the two cannot be told apart — so the whole family
 * is revoked and everyone holding a descendant has to sign in again.
 *
 * Only the SHA-256 of each token is stored, so a database leak does not yield
 * usable tokens.
 */

export interface SessionMeta {
  userAgent?: string | null;
  ipAddress?: string | null;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function issueRefreshToken(
  userId: string,
  meta: SessionMeta = {},
  familyId: string = randomUUID(),
): Promise<string> {
  const token = randomBytes(48).toString('base64url');
  await db.insert(refreshTokens).values({
    userId,
    familyId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + SECURITY.tokens.refreshTtlSeconds * 1000),
    userAgent: meta.userAgent?.slice(0, 500) ?? null,
    ipAddress: meta.ipAddress ?? null,
  });
  return token;
}

export async function rotateRefreshToken(
  token: string,
  meta: SessionMeta = {},
): Promise<{ userId: string; refreshToken: string }> {
  const tokenHash = hashToken(token);

  // Revoking and reading in a single statement makes rotation atomic: of two
  // concurrent requests carrying the same token, only one gets a row back.
  const [current] = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)))
    .returning();

  if (!current) {
    const [reused] = await db
      .select({ familyId: refreshTokens.familyId, userId: refreshTokens.userId })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash));

    if (reused) {
      await revokeFamily(reused.familyId);
      await audit({
        action: 'auth.refresh_reuse_detected',
        userId: reused.userId,
        metadata: { familyId: reused.familyId, ...meta },
      });
    }
    throw unauthorized('Session is no longer valid', 'invalid_refresh_token');
  }

  if (current.expiresAt.getTime() <= Date.now()) {
    throw unauthorized('Session has expired', 'refresh_token_expired');
  }

  const refreshToken = await issueRefreshToken(current.userId, meta, current.familyId);
  return { userId: current.userId, refreshToken };
}

async function revokeFamily(familyId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
}

/** Signs out the session a refresh token belongs to. Unknown tokens are ignored. */
export async function revokeSession(token: string): Promise<string | null> {
  const [row] = await db
    .select({ familyId: refreshTokens.familyId, userId: refreshTokens.userId })
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hashToken(token)));
  if (!row) return null;
  await revokeFamily(row.familyId);
  return row.userId;
}

/** Signs a user out everywhere, e.g. after a password change. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}
