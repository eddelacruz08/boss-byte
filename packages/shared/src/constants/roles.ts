/** Every role a user can hold, ordered from most to least privileged. */
export const ROLES = ['admin', 'manager', 'staff', 'viewer'] as const;

export type Role = (typeof ROLES)[number];

export const DEFAULT_ROLE: Role = 'viewer';

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  manager: 'Manager',
  staff: 'Staff',
  viewer: 'Viewer',
};
