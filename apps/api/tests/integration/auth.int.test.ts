import { SECURITY } from '@bossbyte/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { pool } from '../../src/db/client';
import { emailQueue } from '../../src/jobs/queues';
import { isEncrypted } from '../../src/lib/crypto/aes';
import { currentTotpCode } from '../../src/modules/auth/totp';
import { updateUser } from '../../src/modules/users/users.service';
import { app, browser, cookieFrom, createTestUser, PASSWORD } from './helpers';

const REFRESH_COOKIE = SECURITY.cookies.refreshToken;

const auditActions = async () =>
  (
    await pool.query<{ action: string }>('SELECT action FROM audit_logs ORDER BY created_at')
  ).rows.map((row) => row.action);

describe('registration', () => {
  it('creates a viewer, signs them in and queues a welcome email', async () => {
    const { post } = await browser();
    const response = await post('/auth/register', {
      name: 'Ada Lovelace',
      email: ' Ada@Example.com ',
      password: PASSWORD,
    }).expect(201);

    expect(response.body).toEqual({ accessToken: expect.any(String), expiresIn: 900 });
    expect(response.body).not.toHaveProperty('refreshToken');

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${response.body.accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({ email: 'ada@example.com', role: 'viewer', totpEnabled: false });
    expect(me.body).not.toHaveProperty('passwordHash');

    const [job] = await emailQueue().getJobs(['waiting']);
    expect(job?.data).toMatchObject({ to: 'ada@example.com', subject: 'Welcome to BossByte' });
  });

  it('keeps the refresh token in an httpOnly cookie scoped to the auth routes', async () => {
    const { post } = await browser();
    const response = await post('/auth/register', {
      name: 'Ada',
      email: 'ada@example.com',
      password: PASSWORD,
    }).expect(201);

    const cookie = (response.headers['set-cookie'] as unknown as string[]).find((value) =>
      value.startsWith(`${REFRESH_COOKIE}=`),
    );
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('stores a bcrypt hash and a hash of the refresh token, never the originals', async () => {
    const { post } = await browser();
    const response = await post('/auth/register', {
      name: 'Ada',
      email: 'ada@example.com',
      password: PASSWORD,
    }).expect(201);
    const refreshToken = cookieFrom(response, REFRESH_COOKIE)!;

    const { rows: users } = await pool.query('SELECT password_hash FROM users');
    expect(users[0].password_hash).toMatch(/^\$2[aby]\$/);

    const { rows: tokens } = await pool.query('SELECT token_hash FROM refresh_tokens');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokens[0].token_hash).not.toBe(refreshToken);
  });

  it('rejects a duplicate email and a weak password', async () => {
    const existing = await createTestUser();
    const { post } = await browser();

    const duplicate = await post('/auth/register', {
      name: 'Copycat',
      email: existing.email.toUpperCase(),
      password: PASSWORD,
    }).expect(409);
    expect(duplicate.body.error.code).toBe('email_taken');

    const weak = await post('/auth/register', {
      name: 'Weak',
      email: 'weak@example.com',
      password: 'password',
    }).expect(400);
    expect(weak.body.error.code).toBe('validation_error');
  });
});

describe('password sign-in', () => {
  it('signs in with the right password', async () => {
    const user = await createTestUser({ role: 'manager' });
    const { post } = await browser();

    const response = await post('/auth/login', { email: user.email, password: PASSWORD }).expect(
      200,
    );
    expect(response.body).toEqual({
      mfaRequired: false,
      accessToken: expect.any(String),
      expiresIn: 900,
    });
    expect(cookieFrom(response, REFRESH_COOKIE)).toBeDefined();
    expect(await auditActions()).toEqual(['auth.login']);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const user = await createTestUser();
    const { post } = await browser();

    const wrongPassword = await post('/auth/login', { email: user.email, password: 'nope' }).expect(
      401,
    );
    const unknownEmail = await post('/auth/login', {
      email: 'nobody@example.com',
      password: PASSWORD,
    }).expect(401);

    expect(wrongPassword.body.error.code).toBe('invalid_credentials');
    expect(unknownEmail.body.error.message).toBe(wrongPassword.body.error.message);
    expect(cookieFrom(wrongPassword, REFRESH_COOKIE)).toBeUndefined();
    expect(await auditActions()).toEqual(['auth.login_failed', 'auth.login_failed']);
  });

  it('locks the account after repeated failures, even for the right password', async () => {
    const user = await createTestUser();
    const { post } = await browser();

    for (let attempt = 0; attempt < SECURITY.lockout.maxFailedAttempts; attempt += 1) {
      await post('/auth/login', { email: user.email, password: 'wrong' }).expect(401);
    }

    const locked = await post('/auth/login', { email: user.email, password: PASSWORD }).expect(429);
    expect(locked.body.error.code).toBe('account_locked');
  });

  it('turns away a deactivated account', async () => {
    const user = await createTestUser();
    await updateUser(user.id, { isActive: false });
    const { post } = await browser();

    const response = await post('/auth/login', { email: user.email, password: PASSWORD }).expect(
      403,
    );
    expect(response.body.error.code).toBe('account_disabled');
  });
});

describe('refresh-token rotation', () => {
  async function signIn() {
    const user = await createTestUser();
    const session = await browser();
    const response = await session
      .post('/auth/login', { email: user.email, password: PASSWORD })
      .expect(200);
    return { user, ...session, refreshToken: cookieFrom(response, REFRESH_COOKIE)! };
  }

  /** Presents a specific refresh token, as a second browser holding a stolen copy would. */
  async function replay(refreshToken: string) {
    const thief = await browser();
    return thief.post('/auth/refresh').set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`);
  }

  it('exchanges the cookie for a new access token and a new cookie', async () => {
    const { post, refreshToken } = await signIn();

    const response = await post('/auth/refresh').expect(200);
    expect(response.body).toEqual({ accessToken: expect.any(String), expiresIn: 900 });

    const rotated = cookieFrom(response, REFRESH_COOKIE);
    expect(rotated).toBeDefined();
    expect(rotated).not.toBe(refreshToken);

    // The browser now holds the new cookie, so it can keep refreshing.
    await post('/auth/refresh').expect(200);
  });

  it('revokes the whole session when a used token is presented again', async () => {
    const { post, refreshToken } = await signIn();
    await post('/auth/refresh').expect(200);

    const reuse = await replay(refreshToken);
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('invalid_refresh_token');

    // The legitimate browser's newer token belongs to the same family, so it is gone too.
    const legitimate = await post('/auth/refresh').expect(401);
    expect(legitimate.body.error.code).toBe('invalid_refresh_token');
    expect(await auditActions()).toContain('auth.refresh_reuse_detected');
  });

  it('answers 401 when there is no session', async () => {
    const { post } = await browser();
    const response = await post('/auth/refresh').expect(401);
    expect(response.body.error.code).toBe('no_session');
  });

  it('picks up a role change at the next refresh', async () => {
    const { user, post } = await signIn();
    await updateUser(user.id, { role: 'manager' });

    const { body } = await post('/auth/refresh').expect(200);
    const me = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${body.accessToken}`);
    // Viewers cannot list users; managers can.
    expect(me.status).toBe(200);
  });

  it('signs out: the cookie is cleared and the token no longer works', async () => {
    const { post, refreshToken } = await signIn();

    const response = await post('/auth/logout').expect(204);
    expect(cookieFrom(response, REFRESH_COOKIE)).toBeUndefined();

    await post('/auth/refresh').expect(401);
    expect((await replay(refreshToken)).status).toBe(401);
    expect(await auditActions()).toContain('auth.logout');
  });

  it('signs out everywhere when the password changes', async () => {
    const { user, post, refreshToken } = await signIn();
    const newPassword = 'Another-Strong-Pass-99';

    await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', user.authorization)
      .send({ currentPassword: 'not-the-password', newPassword })
      .expect(400);

    await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', user.authorization)
      .send({ currentPassword: PASSWORD, newPassword })
      .expect(204);

    expect((await replay(refreshToken)).status).toBe(401);
    await post('/auth/login', { email: user.email, password: PASSWORD }).expect(401);
    await post('/auth/login', { email: user.email, password: newPassword }).expect(200);
  });
});

describe('two-factor authentication', () => {
  async function enrol() {
    const user = await createTestUser();
    const setup = await request(app)
      .post('/api/v1/auth/totp/setup')
      .set('Authorization', user.authorization)
      .expect(200);
    const secret = setup.body.secret as string;

    // Each code works once, so enrol with the previous period's code (still
    // inside the drift window) and leave the current one for signing in.
    const enrolCode = currentTotpCode(secret, Date.now() - SECURITY.totp.periodSeconds * 1000);
    await request(app)
      .post('/api/v1/auth/totp/enable')
      .set('Authorization', user.authorization)
      .send({ code: enrolCode })
      .expect(204);
    return {
      user,
      secret,
      enrolCode,
      setup: setup.body as { uri: string; qrCodeDataUrl: string },
    };
  }

  const wrongCode = (secret: string) =>
    currentTotpCode(secret) === '000000' ? '000001' : '000000';

  it('hands out a secret with a QR code and stores it encrypted', async () => {
    const { user, secret, setup } = await enrol();

    expect(setup.uri).toContain(`secret=${secret}`);
    expect(setup.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);

    const { rows } = await pool.query('SELECT totp_secret, totp_enabled FROM users WHERE id = $1', [
      user.id,
    ]);
    expect(rows[0].totp_enabled).toBe(true);
    expect(isEncrypted(rows[0].totp_secret)).toBe(true);
    expect(rows[0].totp_secret).not.toContain(secret);
  });

  it('does not enable 2FA on a wrong code', async () => {
    const user = await createTestUser();
    const setup = await request(app)
      .post('/api/v1/auth/totp/setup')
      .set('Authorization', user.authorization)
      .expect(200);

    const response = await request(app)
      .post('/api/v1/auth/totp/enable')
      .set('Authorization', user.authorization)
      .send({ code: wrongCode(setup.body.secret) })
      .expect(400);
    expect(response.body.error.code).toBe('invalid_totp_code');

    // Still a one-step sign-in.
    const { post } = await browser();
    const login = await post('/auth/login', { email: user.email, password: PASSWORD }).expect(200);
    expect(login.body.mfaRequired).toBe(false);
  });

  it('asks for a code after the password, and only then starts a session', async () => {
    const { user, secret } = await enrol();
    const { post } = await browser();

    const login = await post('/auth/login', { email: user.email, password: PASSWORD }).expect(200);
    expect(login.body).toEqual({ mfaRequired: true, mfaToken: expect.any(String) });
    expect(cookieFrom(login, REFRESH_COOKIE)).toBeUndefined();

    // The intermediate token is not an access token.
    await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.mfaToken}`)
      .expect(401);

    const rejected = await post('/auth/mfa/verify', {
      mfaToken: login.body.mfaToken,
      code: wrongCode(secret),
    }).expect(401);
    expect(rejected.body.error.code).toBe('invalid_totp_code');

    const verified = await post('/auth/mfa/verify', {
      mfaToken: login.body.mfaToken,
      code: currentTotpCode(secret),
    }).expect(200);
    expect(verified.body).toEqual({ accessToken: expect.any(String), expiresIn: 900 });
    expect(cookieFrom(verified, REFRESH_COOKIE)).toBeDefined();
  });

  it('accepts each code only once', async () => {
    const { user, secret } = await enrol();
    const { post } = await browser();
    const login = await post('/auth/login', { email: user.email, password: PASSWORD }).expect(200);
    const code = currentTotpCode(secret);

    await post('/auth/mfa/verify', { mfaToken: login.body.mfaToken, code }).expect(200);
    const replayed = await post('/auth/mfa/verify', { mfaToken: login.body.mfaToken, code }).expect(
      401,
    );
    expect(replayed.body.error.code).toBe('invalid_totp_code');
  });

  it('does not accept the code that enabled 2FA as a sign-in code', async () => {
    const { user, enrolCode } = await enrol();
    const { post } = await browser();
    const login = await post('/auth/login', { email: user.email, password: PASSWORD }).expect(200);

    const replayed = await post('/auth/mfa/verify', {
      mfaToken: login.body.mfaToken,
      code: enrolCode,
    }).expect(401);
    expect(replayed.body.error.code).toBe('invalid_totp_code');
  });

  it('turns 2FA off again with the password', async () => {
    const { user } = await enrol();

    await request(app)
      .post('/api/v1/auth/totp/disable')
      .set('Authorization', user.authorization)
      .send({ password: PASSWORD })
      .expect(204);

    const { rows } = await pool.query('SELECT totp_secret, totp_enabled FROM users WHERE id = $1', [
      user.id,
    ]);
    expect(rows[0]).toEqual({ totp_secret: null, totp_enabled: false });
  });
});

describe('optional sign-in methods', () => {
  it('reports Firebase sign-in as unavailable when it is not configured', async () => {
    const { post } = await browser();
    const response = await post('/auth/firebase', { idToken: 'anything' }).expect(501);
    expect(response.body.error.code).toBe('firebase_not_configured');
  });

  it('issues a passkey challenge', async () => {
    const { post } = await browser();
    const { body } = await post('/auth/passkeys/login/options').expect(200);
    expect(body.challengeId).toEqual(expect.any(String));
    expect(body.options.challenge).toEqual(expect.any(String));
    expect(body.options.rpId).toBe('localhost');
  });
});
