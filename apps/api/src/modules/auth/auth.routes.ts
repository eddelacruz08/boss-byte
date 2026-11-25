import {
  changePasswordSchema,
  firebaseLoginSchema,
  idParamSchema,
  loginSchema,
  mfaVerifySchema,
  passkeyLoginVerifySchema,
  passkeyRegisterVerifySchema,
  registerSchema,
  totpDisableSchema,
  totpEnableSchema,
  updateProfileSchema,
  type AuthTokens,
  type LoginResponse,
} from '@bossbyte/shared';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { Router, type Response } from 'express';
import { audit } from '../../lib/audit';
import { unauthorized } from '../../lib/errors';
import { parseBody, parseParams } from '../../lib/validate';
import { authenticate, currentUser } from '../../middleware/authenticate';
import { generateCsrfToken } from '../../middleware/csrf';
import { authRateLimit } from '../../middleware/rate-limit';
import { getUserById, toUserDto, updateUser } from '../users/users.service';
import * as authService from './auth.service';
import { clearRefreshCookie, readRefreshCookie, sessionMeta, setRefreshCookie } from './cookies';
import * as passkeys from './passkeys';
import { revokeSession } from './sessions';

export const authRouter: Router = Router();

/** Puts the refresh token in its cookie and returns the body the client sees. */
function sendSession(res: Response, session: authService.Session, status = 200): void {
  const { refreshToken, ...tokens } = session;
  setRefreshCookie(res, refreshToken);
  res.status(status).json(tokens satisfies AuthTokens);
}

function sendLoginOutcome(res: Response, outcome: authService.LoginOutcome): void {
  if (outcome.mfaRequired) {
    res.json({ mfaRequired: true, mfaToken: outcome.mfaToken } satisfies LoginResponse);
    return;
  }
  const { refreshToken, ...tokens } = outcome.session;
  setRefreshCookie(res, refreshToken);
  res.json({ mfaRequired: false, ...tokens } satisfies LoginResponse);
}

// ─── Public ─────────────────────────────────────────────────────────────────

authRouter.get('/csrf-token', (req, res) => {
  res.json({ csrfToken: generateCsrfToken(req, res) });
});

authRouter.post('/register', authRateLimit, async (req, res) => {
  const session = await authService.register(parseBody(registerSchema, req), sessionMeta(req));
  sendSession(res, session, 201);
});

authRouter.post('/login', authRateLimit, async (req, res) => {
  const outcome = await authService.login(parseBody(loginSchema, req), sessionMeta(req));
  sendLoginOutcome(res, outcome);
});

authRouter.post('/mfa/verify', authRateLimit, async (req, res) => {
  sendSession(res, await authService.verifyMfa(parseBody(mfaVerifySchema, req), sessionMeta(req)));
});

authRouter.post('/firebase', authRateLimit, async (req, res) => {
  const { idToken } = parseBody(firebaseLoginSchema, req);
  sendLoginOutcome(res, await authService.loginWithFirebase(idToken, sessionMeta(req)));
});

authRouter.post('/passkeys/login/options', authRateLimit, async (_req, res) => {
  res.json(await passkeys.createAuthenticationOptions());
});

authRouter.post('/passkeys/login/verify', authRateLimit, async (req, res) => {
  const { challengeId, response } = parseBody(passkeyLoginVerifySchema, req);
  const userId = await passkeys.verifyAuthentication(
    challengeId,
    response as unknown as AuthenticationResponseJSON,
  );
  sendSession(res, await authService.loginWithPasskey(userId, sessionMeta(req)));
});

/** Exchanges the refresh cookie for a new access token, rotating the cookie. */
authRouter.post('/refresh', async (req, res) => {
  const token = readRefreshCookie(req);
  if (!token) throw unauthorized('Not signed in', 'no_session');

  try {
    sendSession(res, await authService.refreshSession(token, sessionMeta(req)));
  } catch (error) {
    clearRefreshCookie(res);
    throw error;
  }
});

authRouter.post('/logout', async (req, res) => {
  const token = readRefreshCookie(req);
  if (token) {
    const userId = await revokeSession(token);
    if (userId) await audit({ action: 'auth.logout', userId, req });
  }
  clearRefreshCookie(res);
  res.status(204).end();
});

// ─── Signed-in user ─────────────────────────────────────────────────────────

authRouter.get('/me', authenticate, async (req, res) => {
  res.json(toUserDto(await getUserById(currentUser(req).userId)));
});

authRouter.patch('/me', authenticate, async (req, res) => {
  const input = parseBody(updateProfileSchema, req);
  res.json(toUserDto(await updateUser(currentUser(req).userId, input)));
});

authRouter.post('/change-password', authenticate, authRateLimit, async (req, res) => {
  await authService.changePassword(currentUser(req).userId, parseBody(changePasswordSchema, req));
  // Every session was revoked, including this one.
  clearRefreshCookie(res);
  res.status(204).end();
});

authRouter.post('/totp/setup', authenticate, async (req, res) => {
  res.json(await authService.setupTotp(currentUser(req).userId));
});

authRouter.post('/totp/enable', authenticate, authRateLimit, async (req, res) => {
  const { code } = parseBody(totpEnableSchema, req);
  await authService.enableTotp(currentUser(req).userId, code);
  res.status(204).end();
});

authRouter.post('/totp/disable', authenticate, authRateLimit, async (req, res) => {
  const { password } = parseBody(totpDisableSchema, req);
  await authService.disableTotp(currentUser(req).userId, password);
  res.status(204).end();
});

authRouter.get('/passkeys', authenticate, async (req, res) => {
  res.json(await passkeys.listPasskeys(currentUser(req).userId));
});

authRouter.post('/passkeys/register/options', authenticate, async (req, res) => {
  const user = await getUserById(currentUser(req).userId);
  res.json(await passkeys.createRegistrationOptions(user));
});

authRouter.post('/passkeys/register/verify', authenticate, async (req, res) => {
  const { response, name } = parseBody(passkeyRegisterVerifySchema, req);
  const { userId } = currentUser(req);
  const passkey = await passkeys.verifyRegistration(
    userId,
    response as unknown as RegistrationResponseJSON,
    name,
  );
  await audit({ action: 'auth.passkey_added', userId, metadata: { passkeyId: passkey.id }, req });
  res.status(201).json(passkey);
});

authRouter.delete('/passkeys/:id', authenticate, async (req, res) => {
  const { id } = parseParams(idParamSchema, req);
  const { userId } = currentUser(req);
  await passkeys.deletePasskey(userId, id);
  await audit({ action: 'auth.passkey_removed', userId, metadata: { passkeyId: id }, req });
  res.status(204).end();
});
