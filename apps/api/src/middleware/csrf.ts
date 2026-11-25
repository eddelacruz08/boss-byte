import { randomUUID } from 'node:crypto';
import { SECURITY } from '@bossbyte/shared';
import { doubleCsrf } from 'csrf-csrf';
import type { CookieOptions, Request, RequestHandler } from 'express';
import { env, isProduction } from '../config/env';

/**
 * CSRF protection, double-submit cookie pattern.
 *
 * Browsers attach cookies to cross-site requests automatically, so every
 * state-changing request that relies on a cookie (sign-in, token refresh,
 * sign-out) must also carry a token that a foreign site cannot read: the
 * dashboard fetches one from GET /auth/csrf-token and echoes it in the
 * `x-csrf-token` header.
 *
 * Requests authenticated with an `Authorization: Bearer` header are exempt.
 * A browser never adds that header on its own, so they cannot be forged
 * cross-site — which also keeps the API usable from scripts and mobile apps.
 */

const DEVICE_COOKIE = 'bb_sid';

/** SameSite=None is only honoured on Secure cookies. */
export const baseCookieOptions: CookieOptions = {
  sameSite: env.COOKIE_SAME_SITE,
  secure: isProduction || env.COOKIE_SAME_SITE === 'none',
  path: '/',
};

/**
 * Gives every browser a stable anonymous identifier. CSRF tokens are bound to
 * it, so a token issued to one browser is useless in another.
 */
export const deviceSession: RequestHandler = (req, res, next) => {
  const cookies = req.cookies as Record<string, string | undefined>;
  if (!cookies[DEVICE_COOKIE]) {
    const id = randomUUID();
    cookies[DEVICE_COOKIE] = id;
    res.cookie(DEVICE_COOKIE, id, {
      ...baseCookieOptions,
      httpOnly: true,
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });
  }
  next();
};

const hasBearerToken = (req: Request) =>
  req.headers.authorization?.toLowerCase().startsWith('bearer ') ?? false;

const csrf = doubleCsrf({
  getSecret: () => env.CSRF_SECRET,
  getSessionIdentifier: (req) =>
    (req.cookies as Record<string, string | undefined>)[DEVICE_COOKIE] ?? '',
  cookieName: SECURITY.cookies.csrfToken,
  cookieOptions: { ...baseCookieOptions, httpOnly: true },
  getCsrfTokenFromRequest: (req) => req.headers[SECURITY.headers.csrfToken],
  skipCsrfProtection: hasBearerToken,
  errorConfig: { statusCode: 403, message: 'Invalid or missing CSRF token', code: 'EBADCSRFTOKEN' },
});

/** Rejects state-changing requests that lack a valid token. GET, HEAD and OPTIONS pass. */
export const csrfProtection = csrf.doubleCsrfProtection;
export const generateCsrfToken = csrf.generateCsrfToken;
export const invalidCsrfTokenError = csrf.invalidCsrfTokenError;
