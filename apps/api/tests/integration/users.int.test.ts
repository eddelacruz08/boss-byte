import { randomUUID } from 'node:crypto';
import { SECURITY } from '@bossbyte/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { pool } from '../../src/db/client';
import { isEncrypted } from '../../src/lib/crypto/aes';
import { findUsersByPhone } from '../../src/modules/users/users.service';
import { app, browser, cookieFrom, createTestUser, PASSWORD } from './helpers';

const api = (authorization: string) => ({
  get: (path: string) => request(app).get(`/api/v1${path}`).set('Authorization', authorization),
  post: (path: string, body: object) =>
    request(app).post(`/api/v1${path}`).set('Authorization', authorization).send(body),
  patch: (path: string, body: object) =>
    request(app).patch(`/api/v1${path}`).set('Authorization', authorization).send(body),
  delete: (path: string) =>
    request(app).delete(`/api/v1${path}`).set('Authorization', authorization),
});

describe('creating users', () => {
  it('lets an admin create a user', async () => {
    const admin = await createTestUser({ role: 'admin' });

    const { body } = await api(admin.authorization)
      .post('/users', {
        name: 'Grace Hopper',
        email: 'Grace@Example.com',
        password: PASSWORD,
        role: 'manager',
        phone: '+63 917 555 0101',
      })
      .expect(201);

    expect(body).toMatchObject({
      name: 'Grace Hopper',
      email: 'grace@example.com',
      role: 'manager',
      phone: '+63 917 555 0101',
      isActive: true,
      passkeyCount: 0,
    });
    expect(body).not.toHaveProperty('passwordHash');
    expect(body).not.toHaveProperty('totpSecret');

    const { rows } = await pool.query(
      "SELECT action, user_id, metadata FROM audit_logs WHERE action = 'user.created'",
    );
    expect(rows[0]).toMatchObject({
      user_id: admin.id,
      metadata: { targetId: body.id, role: 'manager' },
    });
  });

  it('refuses roles without the permission, and duplicates', async () => {
    const staff = await createTestUser({ role: 'staff' });
    const admin = await createTestUser({ role: 'admin' });
    const input = { name: 'Someone', email: 'someone@example.com', password: PASSWORD };

    await api(staff.authorization).post('/users', input).expect(403);
    await api(admin.authorization).post('/users', input).expect(201);

    const duplicate = await api(admin.authorization).post('/users', input).expect(409);
    expect(duplicate.body.error.code).toBe('email_taken');
  });
});

describe('encryption at rest', () => {
  it('stores the phone number as AES-GCM ciphertext and returns it decrypted', async () => {
    const user = await createTestUser({ phone: '+63 917 555 0101' });
    const staff = await createTestUser({ role: 'staff' });

    const { rows } = await pool.query('SELECT phone, phone_bidx FROM users WHERE id = $1', [
      user.id,
    ]);
    expect(isEncrypted(rows[0].phone)).toBe(true);
    expect(rows[0].phone).not.toMatch(/917|555|0101/);
    expect(rows[0].phone_bidx).toMatch(/^[0-9a-f]{64}$/);

    const { body } = await api(staff.authorization).get(`/users/${user.id}`).expect(200);
    expect(body.phone).toBe('+63 917 555 0101');
  });

  it('encrypts the same number differently every time, yet finds it by blind index', async () => {
    const first = await createTestUser({ phone: '+63 917 555 0101' });
    const second = await createTestUser({ phone: '+63-917-555-0101' });
    await createTestUser({ phone: '+63 917 555 0199' });

    const { rows } = await pool.query(
      'SELECT phone, phone_bidx FROM users WHERE phone IS NOT NULL ORDER BY email',
    );
    expect(rows[0].phone).not.toBe(rows[1].phone);
    expect(rows[0].phone_bidx).toBe(rows[1].phone_bidx);
    expect(rows[2].phone_bidx).not.toBe(rows[0].phone_bidx);

    const matches = await findUsersByPhone('+63 (917) 555-0101');
    expect(matches.map((match) => match.id).sort()).toEqual([first.id, second.id].sort());
  });

  it('keeps the ciphertext and the blind index in step on update', async () => {
    const admin = await createTestUser({ role: 'admin' });
    const user = await createTestUser({ phone: '+63 917 555 0101' });

    await api(admin.authorization)
      .patch(`/users/${user.id}`, { phone: '+63 917 555 0202' })
      .expect(200);
    expect(await findUsersByPhone('+63 917 555 0101')).toHaveLength(0);
    expect(await findUsersByPhone('+63 917 555 0202')).toHaveLength(1);

    const cleared = await api(admin.authorization)
      .patch(`/users/${user.id}`, { phone: null })
      .expect(200);
    expect(cleared.body.phone).toBeNull();
    const { rows } = await pool.query('SELECT phone, phone_bidx FROM users WHERE id = $1', [
      user.id,
    ]);
    expect(rows[0]).toEqual({ phone: null, phone_bidx: null });
  });

  it('does not write personal data into the audit trail', async () => {
    const admin = await createTestUser({ role: 'admin' });
    const user = await createTestUser();

    await api(admin.authorization)
      .patch(`/users/${user.id}`, { phone: '+63 917 555 0303' })
      .expect(200);

    const { rows } = await pool.query(
      "SELECT metadata FROM audit_logs WHERE action = 'user.updated'",
    );
    expect(rows[0].metadata).toEqual({ targetId: user.id, fields: ['phone'] });
  });
});

describe('listing users', () => {
  it('pages, searches, filters and sorts', async () => {
    const admin = await createTestUser({ role: 'admin', name: 'Zed Admin' });
    await createTestUser({ name: 'Alice Santos', email: 'alice@example.com', role: 'staff' });
    await createTestUser({ name: 'Bob Reyes', email: 'bob@example.com', role: 'staff' });
    await createTestUser({ name: 'Carol Cruz', email: 'carol@example.com' });
    const { get } = api(admin.authorization);

    const firstPage = await get('/users?pageSize=2&sortBy=name&sortOrder=asc').expect(200);
    expect(firstPage.body.data.map((user: { name: string }) => user.name)).toEqual([
      'Alice Santos',
      'Bob Reyes',
    ]);
    expect(firstPage.body.meta).toEqual({ page: 1, pageSize: 2, total: 4, totalPages: 2 });

    const secondPage = await get('/users?pageSize=2&page=2&sortBy=name&sortOrder=asc').expect(200);
    expect(secondPage.body.data.map((user: { name: string }) => user.name)).toEqual([
      'Carol Cruz',
      'Zed Admin',
    ]);

    const search = await get('/users?search=SANTOS').expect(200);
    expect(search.body.data).toHaveLength(1);

    const byEmail = await get('/users?search=bob@').expect(200);
    expect(byEmail.body.data[0].name).toBe('Bob Reyes');

    const staff = await get('/users?role=staff').expect(200);
    expect(staff.body.meta.total).toBe(2);
  });

  it('treats search wildcards literally', async () => {
    const admin = await createTestUser({ role: 'admin' });
    const { body } = await api(admin.authorization).get('/users?search=%25').expect(200);
    expect(body.data).toHaveLength(0);
  });

  it('validates the query string', async () => {
    const admin = await createTestUser({ role: 'admin' });
    const { body } = await api(admin.authorization).get('/users?pageSize=5000').expect(400);
    expect(body.error.code).toBe('validation_error');
  });

  it('is closed to viewers', async () => {
    const viewer = await createTestUser();
    await api(viewer.authorization).get('/users').expect(403);
  });
});

describe('updating and deleting users', () => {
  it('ends the sessions of a user whose role changes', async () => {
    const admin = await createTestUser({ role: 'admin' });
    const user = await createTestUser({ role: 'manager' });
    const session = await browser();
    await session.post('/auth/login', { email: user.email, password: PASSWORD }).expect(200);

    const { body } = await api(admin.authorization)
      .patch(`/users/${user.id}`, { role: 'viewer' })
      .expect(200);
    expect(body.role).toBe('viewer');

    const refresh = await session.post('/auth/refresh').expect(401);
    expect(cookieFrom(refresh, SECURITY.cookies.refreshToken)).toBeUndefined();
  });

  it('stops admins locking themselves out', async () => {
    const admin = await createTestUser({ role: 'admin' });
    const { patch, delete: remove } = api(admin.authorization);

    for (const change of [{ role: 'viewer' }, { isActive: false }]) {
      const { body } = await patch(`/users/${admin.id}`, change).expect(400);
      expect(body.error.code).toBe('cannot_modify_self');
    }
    await remove(`/users/${admin.id}`).expect(400);
    // Harmless changes to their own record are fine.
    await patch(`/users/${admin.id}`, { name: 'Renamed' }).expect(200);
  });

  it('deletes a user, along with their sessions', async () => {
    const admin = await createTestUser({ role: 'admin' });
    const manager = await createTestUser({ role: 'manager' });
    const user = await createTestUser();
    const session = await browser();
    await session.post('/auth/login', { email: user.email, password: PASSWORD }).expect(200);

    // Managers can edit users but not delete them.
    await api(manager.authorization).delete(`/users/${user.id}`).expect(403);
    await api(admin.authorization).delete(`/users/${user.id}`).expect(204);

    await api(admin.authorization).get(`/users/${user.id}`).expect(404);
    const { rows } = await pool.query('SELECT 1 FROM refresh_tokens WHERE user_id = $1', [user.id]);
    expect(rows).toHaveLength(0);
  });

  it('answers 404 for a missing user and 400 for a malformed id', async () => {
    const admin = await createTestUser({ role: 'admin' });
    const { get, patch } = api(admin.authorization);

    const missing = await get(`/users/${randomUUID()}`).expect(404);
    expect(missing.body.error.code).toBe('user_not_found');
    await patch(`/users/${randomUUID()}`, { name: 'Nobody' }).expect(404);

    const malformed = await get('/users/42').expect(400);
    expect(malformed.body.error.code).toBe('validation_error');
    await patch(`/users/${admin.id}`, {}).expect(400);
  });
});

describe('own profile', () => {
  it('lets a user edit their name and phone, but not their role', async () => {
    const viewer = await createTestUser();

    const { body } = await api(viewer.authorization)
      .patch('/auth/me', { name: 'New Name', phone: '+63 917 555 0404', role: 'admin' })
      .expect(200);
    expect(body).toMatchObject({ name: 'New Name', phone: '+63 917 555 0404', role: 'viewer' });
  });
});
