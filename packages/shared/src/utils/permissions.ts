import { ROLE_PERMISSIONS, type Permission } from '../constants/permissions';
import type { Role } from '../constants/roles';

export function permissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function hasEveryPermission(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.every((permission) => hasPermission(role, permission));
}

export function hasAnyPermission(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => hasPermission(role, permission));
}
