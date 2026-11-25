import { describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, mockFetch } from '@/test/fetch-mock';
import { buildUser } from '@/test/fixtures';
import { createApiClient } from './api';
import { createAuthStore } from './auth';

const BASE = '/api/v1';
const csrfRoute = { [`GET ${BASE}/auth/csrf-token`]: jsonResponse({ csrfToken: 'csrf-1' }) };
const tokens = { accessToken: 'token-1', expiresIn: 900 };

function createStore() {
  return createAuthStore(createApiClient(BASE));
}

describe('restore', () => {
  it('signs the visitor in when the refresh cookie is still good', async () => {
    const user = buildUser();
    const server = mockFetch({
      ...csrfRoute,
      [`POST ${BASE}/auth/refresh`]: jsonResponse(tokens),
      [`GET ${BASE}/auth/me`]: jsonResponse(user),
    });
    const store = createStore();
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.getState().status).toBe('unknown');
    await expect(store.restore()).resolves.toEqual(user);

    expect(store.getState()).toEqual({ status: 'authenticated', user });
    expect(listener).toHaveBeenCalled();
    expect(server.calls(`GET ${BASE}/auth/me`)[0]?.headers.get('authorization')).toBe(
      'Bearer token-1',
    );
  });

  it('runs once, however many route guards ask', async () => {
    const server = mockFetch({
      ...csrfRoute,
      [`POST ${BASE}/auth/refresh`]: jsonResponse(tokens),
      [`GET ${BASE}/auth/me`]: jsonResponse(buildUser()),
    });
    const store = createStore();

    await Promise.all([store.restore(), store.restore()]);
    await store.restore();

    expect(server.calls(`POST ${BASE}/auth/refresh`)).toHaveLength(1);
  });

  it('leaves the visitor signed out when there is no session', async () => {
    mockFetch({
      ...csrfRoute,
      [`POST ${BASE}/auth/refresh`]: errorResponse(401, 'no_session', 'Not signed in'),
    });
    const store = createStore();

    await expect(store.restore()).resolves.toBeNull();
    expect(store.getState()).toEqual({ status: 'unauthenticated', user: null });
  });

  it('leaves the visitor signed out when the API cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const store = createStore();

    await expect(store.restore()).resolves.toBeNull();
    expect(store.getState().status).toBe('unauthenticated');
  });
});

describe('signIn and signOut', () => {
  it('stores the token, loads the user and answers permission checks', async () => {
    mockFetch({ [`GET ${BASE}/auth/me`]: jsonResponse(buildUser({ role: 'staff' })) });
    const store = createStore();

    expect(store.can('files:read')).toBe(false);
    await store.signIn(tokens);

    expect(store.getState().status).toBe('authenticated');
    expect(store.can('files:write')).toBe(true);
    expect(store.can('users:write')).toBe(false);
  });

  it('ends the session locally even if the server could not be told', async () => {
    const server = mockFetch({
      ...csrfRoute,
      [`GET ${BASE}/auth/me`]: jsonResponse(buildUser()),
      [`POST ${BASE}/auth/logout`]: errorResponse(500, 'internal_error', 'Something broke'),
    });
    const store = createStore();
    await store.signIn(tokens);

    await store.signOut();

    expect(store.getState()).toEqual({ status: 'unauthenticated', user: null });
    const [logout] = server.calls(`POST ${BASE}/auth/logout`);
    expect(logout?.headers.has('authorization')).toBe(false);
    expect(logout?.headers.get('x-csrf-token')).toBe('csrf-1');
  });

  it('signs out when the API client reports that the session has expired', async () => {
    mockFetch({
      ...csrfRoute,
      [`GET ${BASE}/auth/me`]: jsonResponse(buildUser()),
      [`GET ${BASE}/users`]: errorResponse(401, 'token_expired', 'Access token expired'),
      [`POST ${BASE}/auth/refresh`]: errorResponse(401, 'no_session', 'Not signed in'),
    });
    const client = createApiClient(BASE);
    const store = createAuthStore(client);
    await store.signIn(tokens);

    await expect(client.get('/users')).rejects.toMatchObject({ status: 401 });

    expect(store.getState().status).toBe('unauthenticated');
  });
});
