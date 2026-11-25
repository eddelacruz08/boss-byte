import { hasEveryPermission, type Permission, type Role } from '@bossbyte/shared';
import type { Request, RequestHandler } from 'express';
import { forbidden, unauthorized } from '../lib/errors';
import { verifyAccessToken } from '../modules/auth/tokens';

/**
 * Requires a valid `Authorization: Bearer <access token>` header and exposes
 * the caller as `req.auth`.
 *
 * Verification is stateless — no database or Redis round trip — so a role
 * change or deactivation takes effect when the access token expires (15
 * minutes at most). Refresh tokens are revoked immediately in both cases.
 */
export const authenticate: RequestHandler = (req, _res, next) => {
  const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
  if (scheme?.toLowerCase() !== 'bearer' || !token) throw unauthorized();

  req.auth = verifyAccessToken(token);
  next();
};

/**
 * Requires the authenticated user's role to hold every listed permission.
 * Use after `authenticate`.
 *
 * @example
 *   router.delete('/:id', authenticate, authorize('users:delete'), handler);
 */
export function authorize(...permissions: Permission[]): RequestHandler {
  return (req, _res, next) => {
    if (!hasEveryPermission(currentUser(req).role, permissions)) throw forbidden();
    next();
  };
}

/** The authenticated caller. Throws 401 if the route forgot `authenticate`. */
export function currentUser(req: Request): { userId: string; role: Role } {
  if (!req.auth) throw unauthorized();
  return req.auth;
}
