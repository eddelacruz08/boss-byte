import { SECURITY, type AuthTokens } from '@bossbyte/shared';

export interface ApiErrorDetail {
  path: string;
  message: string;
}

/**
 * Every failed request rejects with one of these, whatever went wrong: an
 * error response from the API, a response that is not JSON, or no response at
 * all (`status` 0, `code` "network_error").
 *
 * @example
 *   try {
 *     await api.post('/users', input);
 *   } catch (error) {
 *     if (isApiError(error, 'email_taken')) setError('email', { message: error.message });
 *   }
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Per-field problems, present on `validation_error` responses. */
  readonly details: ApiErrorDetail[];
  /** Quote this when reporting a problem; the API logs carry the same id. */
  readonly requestId: string | undefined;

  constructor(init: {
    status: number;
    code: string;
    message: string;
    details?: ApiErrorDetail[];
    requestId?: string;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.details = init.details ?? [];
    this.requestId = init.requestId;
  }
}

/** Narrows to `ApiError`, optionally to one with a specific `code`. */
export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

/**
 * A message that is safe to show to the user for anything a request can throw.
 *
 * @example
 *   onError: (error) => toast({ title: errorMessage(error), tone: 'danger' })
 */
export function errorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  return error instanceof ApiError ? error.message : fallback;
}

type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  /** Appended to the URL; `null`, `undefined` and empty strings are left out. */
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  /**
   * Never send the access token. For the endpoints that work on cookies alone
   * (sign-in, refresh, sign-out), which are CSRF-protected instead.
   */
  anonymous?: boolean;
}

export interface DownloadedFile {
  blob: Blob;
  /** From the `Content-Disposition` header, when the server names the file. */
  fileName: string | null;
}

export interface ApiClient {
  get<T>(path: string, options?: RequestOptions): Promise<T>;
  post<T = void>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  patch<T>(path: string, body: unknown, options?: RequestOptions): Promise<T>;
  delete<T = void>(path: string, options?: RequestOptions): Promise<T>;
  /** Sends `multipart/form-data`; the browser sets the boundary header itself. */
  upload<T>(path: string, form: FormData, options?: RequestOptions): Promise<T>;
  /** Fetches a binary response. Needed for downloads behind the Bearer header. */
  download(path: string, options?: RequestOptions): Promise<DownloadedFile>;
  /** The access token lives in memory only, so it is gone after a reload. */
  setAccessToken(token: string | null): void;
  /**
   * Exchanges the refresh cookie for a new access token. Concurrent calls
   * share one request. Resolves to `false` when there is no session to renew.
   */
  refreshSession(): Promise<boolean>;
  /** Registers what to do when the session ends and cannot be renewed. */
  onSessionExpired(handler: () => void): void;
}

interface Payload {
  json?: unknown;
  form?: FormData;
}

interface Attempt {
  refreshed: boolean;
  csrfRetried: boolean;
}

const FIRST_ATTEMPT: Attempt = { refreshed: false, csrfRetried: false };

function buildUrl(baseUrl: string, path: string, query: RequestOptions['query']): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== null && value !== undefined && value !== '') params.set(key, String(value));
  }
  const queryString = params.toString();
  return `${baseUrl}${path}${queryString ? `?${queryString}` : ''}`;
}

async function toApiError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null);
  const error =
    typeof body === 'object' && body !== null && 'error' in body
      ? (body.error as Partial<{
          code: string;
          message: string;
          details: ApiErrorDetail[];
          requestId: string;
        }>)
      : {};

  return new ApiError({
    status: response.status,
    code: error.code ?? `http_${response.status}`,
    message: error.message ?? `The request failed (${response.status}).`,
    details: error.details,
    requestId: error.requestId,
  });
}

function fileNameFrom(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition)?.[1];
  if (encoded) return decodeURIComponent(encoded);
  return /filename="?([^";]+)"?/i.exec(contentDisposition)?.[1] ?? null;
}

/**
 * Builds a client for the BossByte API. The app uses the shared `api` instance
 * below; create your own only for tests or a second backend.
 *
 * It takes care of the three things every call needs:
 *
 * - **Access token** — sent as a Bearer header once `setAccessToken` was called.
 * - **CSRF** — state-changing requests without a Bearer header carry the
 *   `x-csrf-token` header; the token is fetched on first use and once more if
 *   the API rejects it.
 * - **Expiry** — a 401 on an authenticated request triggers one shared refresh
 *   and one retry. If the refresh fails, the `onSessionExpired` handler runs.
 *
 * @example
 *   const users = await api.get<UserList>('/users', { query: { page: 1, search: 'ada' } });
 *   const created = await api.post<User>('/users', input);
 *   const { blob } = await api.download('/reports/users.pdf');
 */
export function createApiClient(baseUrl: string): ApiClient {
  let accessToken: string | null = null;
  let csrfToken: Promise<string> | null = null;
  let refreshing: Promise<boolean> | null = null;
  let sessionExpiredHandler: (() => void) | null = null;

  function getCsrfToken(): Promise<string> {
    csrfToken ??= fetch(`${baseUrl}/auth/csrf-token`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw await toApiError(response);
        return ((await response.json()) as { csrfToken: string }).csrfToken;
      })
      .catch((error: unknown) => {
        csrfToken = null;
        throw error;
      });
    return csrfToken;
  }

  async function send(
    method: string,
    path: string,
    payload: Payload,
    options: RequestOptions,
    attempt: Attempt,
  ): Promise<Response> {
    const headers = new Headers();
    const bearer = options.anonymous ? null : accessToken;

    try {
      if (bearer) headers.set('authorization', `Bearer ${bearer}`);
      else if (method !== 'GET') headers.set(SECURITY.headers.csrfToken, await getCsrfToken());
      if (payload.json !== undefined) headers.set('content-type', 'application/json');

      const response = await fetch(buildUrl(baseUrl, path, options.query), {
        method,
        headers,
        body: payload.form ?? (payload.json === undefined ? null : JSON.stringify(payload.json)),
        credentials: 'include',
        signal: options.signal ?? null,
      });
      if (response.ok) return response;

      const error = await toApiError(response);

      if (error.status === 401 && bearer && !attempt.refreshed) {
        // A request that was in flight alongside this one may already have renewed the token.
        const renewed = accessToken !== null && accessToken !== bearer;
        if (renewed || (await refreshSession())) {
          return await send(method, path, payload, options, { ...attempt, refreshed: true });
        }
        sessionExpiredHandler?.();
      }

      if (error.code === 'invalid_csrf_token' && !attempt.csrfRetried) {
        csrfToken = null;
        return await send(method, path, payload, options, { ...attempt, csrfRetried: true });
      }

      throw error;
    } catch (error) {
      // `fetch` rejects with a TypeError when no response arrived at all.
      if (!(error instanceof TypeError)) throw error;
      throw new ApiError({
        status: 0,
        code: 'network_error',
        message: 'Could not reach the server. Check your connection and try again.',
      });
    }
  }

  async function json<T>(
    method: string,
    path: string,
    payload: Payload,
    options: RequestOptions = {},
  ): Promise<T> {
    const response = await send(method, path, payload, options, FIRST_ATTEMPT);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  function refreshSession(): Promise<boolean> {
    refreshing ??= json<AuthTokens>('POST', '/auth/refresh', {}, { anonymous: true })
      .then((tokens) => {
        accessToken = tokens.accessToken;
        return true;
      })
      .catch((error: unknown) => {
        // Only a refusal ends the session; an outage must not sign anyone out.
        if (!isApiError(error) || (error.status !== 401 && error.status !== 403)) throw error;
        accessToken = null;
        return false;
      })
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  }

  return {
    get: (path, options) => json('GET', path, {}, options),
    post: (path, body, options) => json('POST', path, { json: body }, options),
    patch: (path, body, options) => json('PATCH', path, { json: body }, options),
    delete: (path, options) => json('DELETE', path, {}, options),
    upload: (path, form, options) => json('POST', path, { form }, options),
    async download(path, options = {}) {
      const response = await send('GET', path, {}, options, FIRST_ATTEMPT);
      return {
        blob: await response.blob(),
        fileName: fileNameFrom(response.headers.get('content-disposition')),
      };
    },
    setAccessToken(token) {
      accessToken = token;
    },
    refreshSession,
    onSessionExpired(handler) {
      sessionExpiredHandler = handler;
    },
  };
}

/** The app-wide client. Same-origin by default; see `.env.example`. */
export const api = createApiClient(import.meta.env.VITE_API_URL ?? '/api/v1');
