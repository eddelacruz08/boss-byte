import { SECURITY } from '@bossbyte/shared';
import type { CookieOptions, Request, Response } from 'express';
import { baseCookieOptions } from '../../middleware/csrf';
import type { SessionMeta } from './sessions';

/**
 * The refresh token lives in an httpOnly cookie, out of reach of JavaScript,
 * and is scoped to the auth routes so it is not sent with any other request.
 */
const refreshCookieOptions: CookieOptions = {
  ...baseCookieOptions,
  httpOnly: true,
  path: '/api/v1/auth',
};

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(SECURITY.cookies.refreshToken, token, {
    ...refreshCookieOptions,
    maxAge: SECURITY.tokens.refreshTtlSeconds * 1000,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(SECURITY.cookies.refreshToken, refreshCookieOptions);
}

export function readRefreshCookie(req: Request): string | undefined {
  return (req.cookies as Record<string, string | undefined>)[SECURITY.cookies.refreshToken];
}

export function sessionMeta(req: Request): SessionMeta {
  return { userAgent: req.get('user-agent') ?? null, ipAddress: req.ip ?? null };
}
