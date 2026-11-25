import { vi } from 'vitest';

export interface RecordedRequest {
  method: string;
  /** Path and query string, e.g. "/api/v1/users?page=2". */
  url: string;
  headers: Headers;
  body: unknown;
}

type Responder = (request: RecordedRequest) => Response | Promise<Response>;

/** A JSON response, as the API sends them. */
export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

/** An error response in the API's envelope. */
export function errorResponse(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): Response {
  return jsonResponse({ error: { code, message, requestId: 'req-test', ...extra } }, status);
}

/**
 * Replaces `fetch` with a stub for the duration of a test, so nothing needs a
 * backend. Routes are keyed by "METHOD /path"; a route may be one response, a
 * function, or a list that is consumed one call at a time (the last entry
 * repeats). Unrouted requests fail the test.
 *
 * @example
 *   const server = mockFetch({
 *     'GET /api/v1/auth/csrf-token': () => jsonResponse({ csrfToken: 'csrf-1' }),
 *     'POST /api/v1/auth/login': [errorResponse(401, 'invalid_credentials', 'Nope')],
 *   });
 *   // ...
 *   expect(server.calls('POST /api/v1/auth/login')).toHaveLength(1);
 */
export function mockFetch(routes: Record<string, Responder | Response | Response[]>) {
  const requests: RecordedRequest[] = [];
  const served = new Map<string, number>();

  const keyOf = (request: RecordedRequest) => `${request.method} ${request.url.split('?')[0]}`;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const request: RecordedRequest = {
        method: init.method ?? 'GET',
        url: String(input),
        headers: new Headers(init.headers),
        body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : init.body,
      };
      requests.push(request);

      const key = keyOf(request);
      const route = routes[key];
      if (!route) throw new Error(`Unexpected request: ${key}`);

      if (typeof route === 'function') return route(request);
      if (route instanceof Response) return route.clone();

      const index = served.get(key) ?? 0;
      served.set(key, index + 1);
      const response = route[Math.min(index, route.length - 1)];
      if (!response) throw new Error(`No responses listed for ${key}`);
      return response.clone();
    }),
  );

  return {
    requests,
    /** The requests made to one route, in order. */
    calls: (key: string) => requests.filter((request) => keyOf(request) === key),
  };
}
