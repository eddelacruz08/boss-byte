import type { Role, User } from '@bossbyte/shared';

/**
 * A user as the API returns one. Override whatever the test is about.
 *
 * @example
 *   authStore.setUser(buildUser({ role: 'viewer' }));
 */
export function buildUser(overrides: Partial<User> = {}): User {
  const role: Role = overrides.role ?? 'admin';
  return {
    id: '0193a5f0-0000-7000-8000-000000000001',
    email: `${role}@bossbyte.local`,
    name: 'Ada Lovelace',
    role,
    phone: null,
    isActive: true,
    totpEnabled: false,
    passkeyCount: 0,
    lastLoginAt: null,
    createdAt: '2026-01-05T08:00:00.000Z',
    updatedAt: '2026-01-05T08:00:00.000Z',
    ...overrides,
  };
}
