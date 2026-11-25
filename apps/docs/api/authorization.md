# Authorization

Access control is role-based. A user has exactly one role, a role holds a fixed set of
permissions, and routes ask for permissions — never for roles.

The whole model is one file, `packages/shared/src/constants/permissions.ts`, shared by the API
(which enforces it) and the dashboard (which hides what a user cannot reach).

## Roles and permissions

Roles, from most to least access: `admin`, `manager`, `staff`, `viewer`. New accounts get
`viewer` (`DEFAULT_ROLE`).

| Permission        | admin | manager | staff | viewer |
| ----------------- | :---: | :-----: | :---: | :----: |
| `users:read`      |   ✓   |    ✓    |   ✓   |        |
| `users:write`     |   ✓   |    ✓    |       |        |
| `users:delete`    |   ✓   |         |       |        |
| `files:read`      |   ✓   |    ✓    |   ✓   |   ✓    |
| `files:write`     |   ✓   |    ✓    |   ✓   |        |
| `files:delete`    |   ✓   |    ✓    |       |        |
| `reports:read`    |   ✓   |    ✓    |   ✓   |   ✓    |
| `reports:export`  |   ✓   |    ✓    |       |        |
| `valuation:run`   |   ✓   |    ✓    |   ✓   |        |
| `settings:manage` |   ✓   |         |       |        |

`admin` is defined as every permission, so a permission you add is granted to admins
automatically. `settings:manage` is defined but no route in the starter uses it; it is there for
your first admin-only feature.

## Which routes need what

| Routes                                                                                    | Permission       |
| ----------------------------------------------------------------------------------------- | ---------------- |
| `GET /users`, `GET /users/:id`                                                            | `users:read`     |
| `POST /users`, `PATCH /users/:id`                                                         | `users:write`    |
| `DELETE /users/:id`                                                                       | `users:delete`   |
| `GET /files`, `GET /files/:id/url`                                                        | `files:read`     |
| `POST /files`                                                                             | `files:write`    |
| `DELETE /files/:id`                                                                       | `files:delete`   |
| `GET /reports/stats`                                                                      | `reports:read`   |
| `GET /reports/*.xlsx\|csv\|pdf\|zip`, `POST /reports/exports`, `GET /reports/exports/:id` | `reports:export` |
| `POST /reports/users/import/preview`                                                      | `users:write`    |
| `POST /valuation/*`                                                                       | `valuation:run`  |
| `/auth/me`, password, TOTP and passkey routes                                             | Signed in only   |

## Enforcing a permission in the API

```ts
import { authenticate, authorize } from '../../middleware/authenticate';

usersRouter.use(authenticate);

usersRouter.get('/', authorize('users:read'), handler);
usersRouter.delete('/:id', authorize('users:delete'), handler);
```

`authorize` takes one or more permissions and requires all of them. A caller without them gets:

```json
{
  "error": {
    "code": "forbidden",
    "message": "You do not have permission to do that",
    "requestId": "…"
  }
}
```

The argument is typed as `Permission`, so a typo is a compile error.

For rules that depend on the data rather than the role, check in the handler or service. The
users module does this to stop people locking themselves out:

- You cannot change your own role or deactivate yourself: `400 cannot_modify_self`.
- You cannot delete yourself: `400 cannot_modify_self`.

Changing someone's role or deactivating them revokes all their refresh tokens, so the change
holds once their current access token (at most 15 minutes) runs out.

## Checking permissions in code

`@bossbyte/shared` exports the same helpers for both sides:

```ts
import {
  hasAnyPermission,
  hasEveryPermission,
  hasPermission,
  permissionsForRole,
} from '@bossbyte/shared';

hasPermission('staff', 'files:write'); // true
hasEveryPermission('staff', ['files:write', 'files:delete']); // false
hasAnyPermission('staff', ['files:write', 'files:delete']); // true
permissionsForRole('viewer'); // ['files:read', 'reports:read']
```

In the dashboard, use the auth store instead of passing roles around:

```tsx
import { RequirePermission } from '@/components/RequirePermission';
import { useAuth } from '@/lib/auth';

const { can } = useAuth();

<>{can('users:write') && <Button onClick={openCreate}>New user</Button>}</>;

<RequirePermission permission="users:read" pageTitle="Users">
  <UsersTable />
</RequirePermission>;
```

Hiding a button is a courtesy, not a control. The API check is the one that counts. See
[Sessions and permissions](/frontend/auth).

## Add a permission

1. Add it to `PERMISSIONS`, named `resource:action`.
2. Add it to the roles that should hold it in `ROLE_PERMISSIONS`.
3. Use it: `authorize('notes:write')` in the API, `can('notes:write')` in the dashboard.

No migration is needed. Permissions are derived from the role at request time and are not stored.

## Add or change a role

1. Add the role to `ROLES` and `ROLE_LABELS` in `packages/shared/src/constants/roles.ts`.
2. Give it permissions in `ROLE_PERMISSIONS`. TypeScript reports an error until you do.
3. Write a migration that updates the `CHECK (role IN (…))` constraint on `users.role`. The
   database rejects a role it does not know. See [Database](/api/database#add-a-migration).

## Audit trail

Sensitive actions are recorded in the `audit_logs` table through `audit()` in `src/lib/audit.ts`:

```ts
await audit({ action: 'user.created', metadata: { targetId: user.id, role: user.role }, req });
```

Passing `req` records the acting user and their IP address. `audit` never throws; a failure to
write the log is logged and the request carries on. The actions the starter records are listed in
[Security](/api/security#audit-log).
