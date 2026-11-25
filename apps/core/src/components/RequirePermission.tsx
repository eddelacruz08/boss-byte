import type { Permission } from '@bossbyte/shared';
import { EmptyState } from '@bossbyte/ui';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { LockIcon } from './icons';
import { PageHeader } from './PageHeader';

export interface RequirePermissionProps {
  permission: Permission;
  children: ReactNode;
  /** Shown instead of `children`. Defaults to a "no access" notice; pass `null` to show nothing. */
  fallback?: ReactNode;
  /** Set when this guards a whole page, so the notice still gets the page's heading and title. */
  pageTitle?: string;
}

/**
 * Renders its children only for roles that hold the permission. This keeps
 * the UI honest; the API is what actually enforces access.
 *
 * @example
 *   <RequirePermission permission="users:write" fallback={null}>
 *     <Button onClick={openCreate}>New user</Button>
 *   </RequirePermission>
 */
export function RequirePermission({
  permission,
  children,
  fallback,
  pageTitle,
}: RequirePermissionProps) {
  const { can } = useAuth();
  if (can(permission)) return children;
  if (fallback !== undefined) return fallback;

  return (
    <>
      {pageTitle && <PageHeader title={pageTitle} />}
      <EmptyState
        icon={<LockIcon />}
        title="You do not have access to this"
        description="Your role does not include this area. Ask an administrator if you need it."
      />
    </>
  );
}
