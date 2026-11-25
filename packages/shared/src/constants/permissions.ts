import type { Role } from './roles';

/** Permissions follow a `resource:action` convention. */
export const PERMISSIONS = [
  'users:read',
  'users:write',
  'users:delete',
  'files:read',
  'files:write',
  'files:delete',
  'reports:read',
  'reports:export',
  'valuation:run',
  'settings:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * The single source of truth for what each role may do. The API enforces it in
 * the `authorize` middleware and the dashboard uses it to hide what a user
 * cannot reach.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: PERMISSIONS,
  manager: [
    'users:read',
    'users:write',
    'files:read',
    'files:write',
    'files:delete',
    'reports:read',
    'reports:export',
    'valuation:run',
  ],
  staff: ['users:read', 'files:read', 'files:write', 'reports:read', 'valuation:run'],
  viewer: ['files:read', 'reports:read'],
};
