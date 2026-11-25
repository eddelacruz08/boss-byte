import { describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, mockFetch, type RecordedRequest } from '@/test/fetch-mock';
import { ApiError, createApiClient, errorMessage, isApiError } from './api';

const BASE = '/api/v1';
const csrfRoute = { [`GET ${BASE}/auth/csrf-token`]: jsonResponse({ csrfToken: 'csrf-1' }) };

/** Answers 401 until the request carries the renewed access token. */
function requireFreshToken(request: RecordedRequest): Response {
  return request.headers.get('authorization') === 'Bearer fresh'
    ? jsonResponse({ ok: true })
    : errorResponse(401, 'token_expired', 'Access token expired');
}

describe('access token', () => {
  it('sends the token as a Bearer header, without a CSRF token', async () => {
    const server = mockFetch({ [`POST ${BASE}/users`]: jsonResponse({ id: 'u1' }, 201) });
    const client = createApiClient(BASE);
    client.setAccessToken('token-1');

    await expect(client.post('/users', { name: 'Ada' })).resolves.toEqual({ id: 'u1' });

    expect(server.requests).toHaveLength(1);
    const [request] = server.requests;
    expect(request?.headers.get('authorization')).toBe('Bearer token-1');
    expect(request?.headers.has('x-csrf-token')).toBe(false);
    expect(request?.headers.get('content-type')).toBe('application/json');
    expect(request?.body).toEqual({ name: 'Ada' });
  });

  it('leaves the token off anonymous requests', async () => {
    const server = mockFetch({
      ...csrfRoute,
      [`POST ${BASE}/auth/login`]: jsonResponse({ mfaRequired: false, accessToken: 'a' }),
    });
    const client = createApiClient(BASE);
    client.setAccessToken('token-1');

    await client.post('/auth/login', { email: 'a@b.co' }, { anonymous: true });

    const [login] = server.calls(`POST ${BASE}/auth/login`);
    expect(login?.headers.has('authorization')).toBe(false);
    expect(login?.headers.get('x-csrf-token')).toBe('csrf-1');
  });

  it('sends cookies with every request', async () => {
    mockFetch({ [`GET ${BASE}/auth/me`]: jsonResponse({ id: 'u1' }) });
    await createApiClient(BASE).get('/auth/me');

    expect(fetch).toHaveBeenCalledWith(
      `${BASE}/auth/me`,
      expect.objectContaining({ credentials: 'include' }),
    );
  });
});

describe('CSRF', () => {
  it('fetches the token once and reuses it for later requests', async () => {
    const server = mockFetch({
      ...csrfRoute,
      [`POST ${BASE}/auth/logout`]: new Response(null, { status: 204 }),
    });
    const client = createApiClient(BASE);

    await client.post('/auth/logout');
    await client.post('/auth/logout');

    expect(server.calls(`GET ${BASE}/auth/csrf-token`)).toHaveLength(1);
    const headers = server
      .calls(`POST ${BASE}/auth/logout`)
      .map((request) => request.headers.get('x-csrf-token'));
    expect(headers).toEqual(['csrf-1', 'csrf-1']);
  });

  it('does not ask for a token to make a GET request', async () => {
    const server = mockFetch({ [`GET ${BASE}/health`]: jsonResponse({ status: 'ok' }) });
    await createApiClient(BASE).get('/health');

    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]?.headers.has('x-csrf-token')).toBe(false);
  });

  it('fetches a new token and retries once when the API rejects the cached one', async () => {
    const server = mockFetch({
      [`GET ${BASE}/auth/csrf-token`]: [
        jsonResponse({ csrfToken: 'stale' }),
        jsonResponse({ csrfToken: 'current' }),
      ],
      [`POST ${BASE}/auth/login`]: (request) =>
        request.headers.get('x-csrf-token') === 'current'
          ? jsonResponse({ mfaRequired: false, accessToken: 'a' })
          : errorResponse(403, 'invalid_csrf_token', 'Invalid CSRF token'),
    });

    const outcome = await createApiClient(BASE).post('/auth/login', {}, { anonymous: true });

    expect(outcome).toEqual({ mfaRequired: false, accessToken: 'a' });
    expect(server.calls(`GET ${BASE}/auth/csrf-token`)).toHaveLength(2);
    expect(server.calls(`POST ${BASE}/auth/login`)).toHaveLength(2);
  });

  it('gives up after one retry', async () => {
    const server = mockFetch({
      ...csrfRoute,
      [`POST ${BASE}/auth/login`]: errorResponse(403, 'invalid_csrf_token', 'Invalid CSRF token'),
    });

    await expect(
      createApiClient(BASE).post('/auth/login', {}, { anonymous: true }),
    ).rejects.toMatchObject({ status: 403, code: 'invalid_csrf_token' });
    expect(server.calls(`POST ${BASE}/auth/login`)).toHaveLength(2);
  });
});

describe('expired access token', () => {
  it('refreshes the session and retries the request with the new token', async () => {
    const server = mockFetch({
      ...csrfRoute,
      [`GET ${BASE}/users`]: requireFreshToken,
      [`POST ${BASE}/auth/refresh`]: jsonResponse({ accessToken: 'fresh', expiresIn: 900 }),
    });
    const client = createApiClient(BASE);
    client.setAccessToken('stale');

    await expect(client.get('/users')).resolves.toEqual({ ok: true });

    const tokens = server
      .calls(`GET ${BASE}/users`)
      .map((request) => request.headers.get('authorization'));
    expect(tokens).toEqual(['Bearer stale', 'Bearer fresh']);

    const [refresh] = server.calls(`POST ${BASE}/auth/refresh`);
    expect(refresh?.headers.has('authorization')).toBe(false);
    expect(refresh?.headers.get('x-csrf-token')).toBe('csrf-1');
  });

  it('shares one refresh between requests that fail at the same time', async () => {
    const server = mockFetch({
      ...csrfRoute,
      [`GET ${BASE}/users`]: requireFreshToken,
      [`GET ${BASE}/files`]: requireFreshToken,
      [`GET ${BASE}/reports/stats`]: requireFreshToken,
      [`POST ${BASE}/auth/refresh`]: jsonResponse({ accessToken: 'fresh', expiresIn: 900 }),
    });
    const client = createApiClient(BASE);
    client.setAccessToken('stale');

    const results = await Promise.all([
      client.get('/users'),
      client.get('/files'),
      client.get('/reports/stats'),
    ]);

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(server.calls(`POST ${BASE}/auth/refresh`)).toHaveLength(1);
  });

  it('reports the session as expired when it cannot be renewed', async () => {
    const server = mockFetch({
      ...csrfRoute,
      [`GET ${BASE}/users`]: errorResponse(401, 'token_expired', 'Access token expired'),
      [`POST ${BASE}/auth/refresh`]: errorResponse(401, 'no_session', 'Not signed in'),
    });
    const client = createApiClient(BASE);
    const onExpired = vi.fn();
    client.onSessionExpired(onExpired);
    client.setAccessToken('stale');

    await expect(client.get('/users')).rejects.toMatchObject({
      status: 401,
      code: 'token_expired',
    });
    expect(onExpired).toHaveBeenCalledOnce();
    expect(server.calls(`GET ${BASE}/users`)).toHaveLength(1);
  });

  it('retries only once, so a request that keeps failing cannot loop', async () => {
    const server = mockFetch({
      ...csrfRoute,
      [`GET ${BASE}/users`]: errorResponse(401, 'token_expired', 'Access token expired'),
      [`POST ${BASE}/auth/refresh`]: jsonResponse({ accessToken: 'fresh', expiresIn: 900 }),
    });
    const client = createApiClient(BASE);
    client.setAccessToken('stale');

    await expect(client.get('/users')).rejects.toMatchObject({ status: 401 });
    expect(server.calls(`GET ${BASE}/users`)).toHaveLength(2);
    expect(server.calls(`POST ${BASE}/auth/refresh`)).toHaveLength(1);
  });

  it('does not treat a failed sign-in as an expired session', async () => {
    const server = mockFetch({
      ...csrfRoute,
      [`POST ${BASE}/auth/login`]: errorResponse(401, 'invalid_credentials', 'Invalid login'),
    });
    const client = createApiClient(BASE);
    const onExpired = vi.fn();
    client.onSessionExpired(onExpired);

    await expect(client.post('/auth/login', {}, { anonymous: true })).rejects.toMatchObject({
      code: 'invalid_credentials',
    });
    expect(onExpired).not.toHaveBeenCalled();
    expect(server.calls(`POST ${BASE}/auth/refresh`)).toHaveLength(0);
  });
});

describe('refreshSession', () => {
  it('resolves to false when there is no session to renew', async () => {
    mockFetch({
      ...csrfRoute,
      [`POST ${BASE}/auth/refresh`]: errorResponse(401, 'no_session', 'Not signed in'),
    });
    await expect(createApiClient(BASE).refreshSession()).resolves.toBe(false);
  });

  it('rejects when the API is failing, so an outage does not sign anyone out', async () => {
    mockFetch({
      ...csrfRoute,
      [`POST ${BASE}/auth/refresh`]: errorResponse(503, 'unavailable', 'Try again later'),
    });
    await expect(createApiClient(BASE).refreshSession()).rejects.toMatchObject({ status: 503 });
  });
});

describe('errors', () => {
  it('turns the error envelope into an ApiError', async () => {
    mockFetch({
      [`POST ${BASE}/users`]: errorResponse(400, 'validation_error', 'Check the form', {
        details: [{ path: 'email', message: 'Enter a valid email address' }],
      }),
    });
    const client = createApiClient(BASE);
    client.setAccessToken('token-1');

    const error: unknown = await client.post('/users', {}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'validation_error',
      message: 'Check the form',
      details: [{ path: 'email', message: 'Enter a valid email address' }],
      requestId: 'req-test',
    });
    expect(isApiError(error, 'validation_error')).toBe(true);
    expect(isApiError(error, 'email_taken')).toBe(false);
  });

  it('copes with an error response that is not JSON', async () => {
    mockFetch({ [`GET ${BASE}/users`]: new Response('<h1>Bad gateway</h1>', { status: 502 }) });

    await expect(createApiClient(BASE).get('/users')).rejects.toMatchObject({
      status: 502,
      code: 'http_502',
      message: 'The request failed (502).',
      details: [],
    });
  });

  it('reports an unreachable server as a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const error: unknown = await createApiClient(BASE)
      .get('/users')
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ status: 0, code: 'network_error' });
    expect(errorMessage(error)).toMatch(/could not reach the server/i);
  });

  it('falls back to a generic message for anything that is not an ApiError', () => {
    expect(errorMessage(new Error('boom'))).toBe('Something went wrong. Please try again.');
    expect(errorMessage(null, 'Could not save.')).toBe('Could not save.');
  });
});

describe('helpers', () => {
  it('builds the query string, leaving out empty values', async () => {
    const server = mockFetch({ [`GET ${BASE}/users`]: jsonResponse({ data: [] }) });

    await createApiClient(BASE).get('/users', {
      query: { page: 2, search: 'ada lovelace', role: null, sortBy: undefined, q: '' },
    });

    expect(server.requests[0]?.url).toBe(`${BASE}/users?page=2&search=ada+lovelace`);
  });

  it('resolves to undefined for a 204', async () => {
    mockFetch({ [`DELETE ${BASE}/users/u1`]: new Response(null, { status: 204 }) });
    const client = createApiClient(BASE);
    client.setAccessToken('token-1');

    await expect(client.delete('/users/u1')).resolves.toBeUndefined();
  });

  it('uploads a form without setting the content type itself', async () => {
    const server = mockFetch({ [`POST ${BASE}/files`]: jsonResponse({ id: 'f1' }, 201) });
    const client = createApiClient(BASE);
    client.setAccessToken('token-1');
    const form = new FormData();
    form.set('file', new File(['hello'], 'hello.csv', { type: 'text/csv' }));

    await client.upload('/files', form);

    // The browser has to write this header, because it carries the multipart boundary.
    expect(server.requests[0]?.headers.has('content-type')).toBe(false);
    expect(server.requests[0]?.body).toBe(form);
  });

  it('downloads a blob and reads the file name the server suggests', async () => {
    mockFetch({
      [`GET ${BASE}/reports/users.csv`]: () =>
        new Response('name,email\n', {
          headers: {
            'content-type': 'text/csv',
            'content-disposition': `attachment; filename="users.csv"; filename*=UTF-8''users%20export.csv`,
          },
        }),
    });
    const client = createApiClient(BASE);
    client.setAccessToken('token-1');

    const { blob, fileName } = await client.download('/reports/users.csv');

    expect(fileName).toBe('users export.csv');
    await expect(blob.text()).resolves.toBe('name,email\n');
  });
});
