import type { CreateUserInput } from '@bossbyte/shared';
import request, { type Response } from 'supertest';
import { createApp } from '../../src/app';
import type { SignedUrlOptions, StorageDriver } from '../../src/lib/storage';
import { signAccessToken } from '../../src/modules/auth/tokens';
import { createUser } from '../../src/modules/users/users.service';

export const app = createApp();

/** Satisfies the password policy. */
export const PASSWORD = 'Correct-Horse-42-Battery';

let sequence = 0;

/**
 * Inserts a user and returns it with a ready-made `Authorization` header, for
 * tests that are about something other than signing in.
 */
export async function createTestUser(overrides: Partial<CreateUserInput> = {}) {
  sequence += 1;
  const user = await createUser({
    email: `user${sequence}@example.com`,
    name: `Test User ${sequence}`,
    role: 'viewer',
    password: PASSWORD,
    ...overrides,
  });
  const { accessToken } = signAccessToken({ userId: user.id, role: user.role });
  return { ...user, authorization: `Bearer ${accessToken}` };
}

/**
 * Behaves like the dashboard in a browser: keeps cookies between requests and
 * echoes the CSRF token it was given on every POST.
 */
export async function browser() {
  const agent = request.agent(app);
  const { body } = await agent.get('/api/v1/auth/csrf-token').expect(200);
  const csrfToken = (body as { csrfToken: string }).csrfToken;

  return {
    agent,
    post: (path: string, payload?: object) =>
      agent.post(`/api/v1${path}`).set('x-csrf-token', csrfToken).send(payload),
  };
}

/** The value of a cookie set by a response, or `undefined` if it was not set (or was cleared). */
export function cookieFrom(response: Response, name: string): string | undefined {
  const header = response.headers['set-cookie'] as string[] | string | undefined;
  const cookies = Array.isArray(header) ? header : header ? [header] : [];
  const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return match?.slice(name.length + 1).split(';')[0] || undefined;
}

/** An object store that lives in memory, so tests need neither MinIO nor a network. */
export class MemoryStorage implements StorageDriver {
  readonly name = 'memory';
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body, contentType });
  }

  async get(key: string): Promise<Buffer> {
    const object = this.objects.get(key);
    if (!object) throw new Error(`No object at ${key}`);
    return object.body;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async signedUrl(key: string, { expiresIn }: SignedUrlOptions): Promise<string> {
    return `https://storage.test/${key}?expires=${expiresIn}`;
  }

  async ping(): Promise<void> {}

  clear(): void {
    this.objects.clear();
  }
}

export const storage = new MemoryStorage();
