import { ROLE_LABELS, ROLES, type Role, type User } from '@bossbyte/shared';
import {
  Avatar,
  Badge,
  Button,
  cn,
  ConfirmDialog,
  DataTable,
  DropdownMenu,
  formatDate,
  formatRelativeTime,
  Pagination,
  Select,
  TextField,
  useToast,
  type DataTableColumn,
  type DropdownMenuItem,
} from '@bossbyte/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { QueryError } from '@/components/QueryError';
import { RequirePermission } from '@/components/RequirePermission';
import { useDeleteUser, usersQueryOptions, useUpdateUser } from '@/features/users/api';
import {
  USERS_SEARCH_DEFAULTS,
  usersSearchSchema,
  type UsersSearch,
} from '@/features/users/search';
import { UserFormModal } from '@/features/users/UserFormModal';
import { errorMessage } from '@/lib/api';
import { useAuth, useCurrentUser } from '@/lib/auth';
import { exportTableToPdf, exportTableToXlsx, type ExportColumn } from '@/lib/exports';
import { useDebouncedInput } from '@/lib/use-debounced-input';

export const Route = createFileRoute('/_authenticated/users')({
  validateSearch: usersSearchSchema,
  // Keeps the URL short: a param that is at its default is left out.
  search: { middlewares: [stripSearchParams(USERS_SEARCH_DEFAULTS)] },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => {
    if (context.auth.can('users:read')) {
      void context.queryClient.prefetchQuery(usersQueryOptions(deps));
    }
  },
  component: UsersPage,
});

type SortColumn = UsersSearch['sortBy'];

const ALL_ROLES = 'all';

const roleFilterOptions: { value: Role | typeof ALL_ROLES; label: string }[] = [
  { value: ALL_ROLES, label: 'All roles' },
  ...ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] })),
];

const EXPORT_COLUMNS: ExportColumn<User>[] = [
  { header: 'Name', value: (user) => user.name, width: 2 },
  { header: 'Email', value: (user) => user.email, width: 2.5 },
  { header: 'Role', value: (user) => ROLE_LABELS[user.role] },
  { header: 'Active', value: (user) => user.isActive },
  {
    header: 'Last sign-in',
    value: (user) => (user.lastLoginAt ? new Date(user.lastLoginAt) : null),
    width: 1.5,
  },
  { header: 'Joined', value: (user) => new Date(user.createdAt), width: 1.5 },
];

function SortHeader({
  label,
  column,
  search,
  onSort,
}: {
  label: string;
  column: SortColumn;
  search: UsersSearch;
  onSort: (column: SortColumn) => void;
}) {
  const active = search.sortBy === column;
  const ascending = search.sortOrder === 'asc';

  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={cn(
        'inline-flex items-center gap-1 rounded-sm font-semibold tracking-wide uppercase hover:text-slate-950',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        active && 'text-slate-950',
      )}
    >
      {label}
      <span aria-hidden="true">{active ? (ascending ? '↑' : '↓') : '↕'}</span>
      <span className="sr-only">
        {active ? `, sorted ${ascending ? 'ascending' : 'descending'}` : ', not sorted'}
      </span>
    </button>
  );
}

function UsersPage() {
  return (
    <RequirePermission permission="users:read" pageTitle="Users">
      <UsersList />
    </RequirePermission>
  );
}

function UsersList() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const me = useCurrentUser();
  const { can } = useAuth();
  const { toast } = useToast();

  const users = useQuery(usersQueryOptions(search));
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  // `user` outlives `open` so the dialogs keep their text while they animate out.
  const [form, setForm] = useState<{ open: boolean; user?: User }>({ open: false });
  const [removal, setRemoval] = useState<{ open: boolean; user?: User }>({ open: false });

  const rows = users.data?.data ?? [];
  const meta = users.data?.meta;
  const filtered = search.search !== '' || search.role !== undefined;

  function updateSearch(patch: Partial<UsersSearch>, { replace = false } = {}) {
    void navigate({ search: (previous) => ({ ...previous, ...patch }), replace });
  }

  const [searchText, setSearchText] = useDebouncedInput(search.search, (value) =>
    updateSearch({ search: value, page: 1 }, { replace: true }),
  );

  function sortBy(column: SortColumn) {
    const flip = search.sortBy === column && search.sortOrder === 'asc';
    updateSearch({ sortBy: column, sortOrder: flip ? 'desc' : 'asc', page: 1 });
  }

  function setActive(user: User, isActive: boolean) {
    updateUser.mutate(
      { id: user.id, input: { isActive } },
      {
        onSuccess: () =>
          toast({
            title: `${user.name} was ${isActive ? 'activated' : 'deactivated'}`,
            tone: 'success',
          }),
        onError: (error) => toast({ title: errorMessage(error), tone: 'danger' }),
      },
    );
  }

  function confirmRemoval() {
    const target = removal.user;
    if (!target) return;
    deleteUser.mutate(target.id, {
      onSuccess: () => {
        toast({ title: `${target.name} was deleted`, tone: 'info' });
        // Deleting the only row of the last page would leave an empty page behind.
        if (rows.length === 1 && search.page > 1) updateSearch({ page: search.page - 1 });
      },
      onError: (error) => toast({ title: errorMessage(error), tone: 'danger' }),
      onSettled: () => setRemoval((current) => ({ ...current, open: false })),
    });
  }

  const exportPage = useMutation({
    mutationFn: (format: 'pdf' | 'xlsx') => {
      const table = {
        title: 'Users',
        subtitle: `Page ${meta?.page ?? 1} of ${meta?.totalPages ?? 1} · exported ${formatDate(new Date())}`,
        columns: EXPORT_COLUMNS,
        rows,
      };
      return format === 'pdf'
        ? exportTableToPdf('users', table)
        : exportTableToXlsx('users', table);
    },
    onError: () => toast({ title: 'The export could not be created', tone: 'danger' }),
  });

  function rowActions(user: User): DropdownMenuItem[] {
    // The API refuses these on your own account, so they are not offered.
    const isSelf = user.id === me.id;
    const actions: DropdownMenuItem[] = [];
    if (can('users:write')) {
      actions.push(
        { label: 'Edit', onSelect: () => setForm({ open: true, user }) },
        {
          label: user.isActive ? 'Deactivate' : 'Activate',
          onSelect: () => setActive(user, !user.isActive),
          disabled: isSelf,
        },
      );
    }
    if (can('users:delete')) {
      actions.push({
        label: 'Delete',
        onSelect: () => setRemoval({ open: true, user }),
        danger: true,
        disabled: isSelf,
      });
    }
    return actions;
  }

  const sortHeader = (label: string, column: SortColumn) => (
    <SortHeader label={label} column={column} search={search} onSort={sortBy} />
  );

  const columns: DataTableColumn<User>[] = [
    {
      key: 'name',
      header: sortHeader('Name', 'name'),
      cell: (user) => (
        <span className="flex items-center gap-3">
          <Avatar name={user.name} size="sm" />
          <span className="font-medium text-slate-950">{user.name}</span>
          {user.id === me.id && <Badge tone="brand">You</Badge>}
        </span>
      ),
      className: 'whitespace-nowrap',
    },
    { key: 'email', header: sortHeader('Email', 'email'), cell: (user) => user.email },
    {
      key: 'role',
      header: 'Role',
      cell: (user) => <Badge tone="info">{ROLE_LABELS[user.role]}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (user) =>
        user.isActive ? <Badge tone="success">Active</Badge> : <Badge>Deactivated</Badge>,
    },
    {
      key: 'lastLoginAt',
      header: 'Last sign-in',
      cell: (user) => (user.lastLoginAt ? formatRelativeTime(user.lastLoginAt) : 'Never'),
      className: 'whitespace-nowrap',
    },
    {
      key: 'createdAt',
      header: sortHeader('Joined', 'createdAt'),
      cell: (user) => formatDate(user.createdAt),
      className: 'whitespace-nowrap',
    },
  ];
  if (can('users:write') || can('users:delete')) {
    columns.push({
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (user) => (
        <DropdownMenu
          className="h-8 px-2"
          label={<span className="sr-only">Actions for {user.name}</span>}
          items={rowActions(user)}
        />
      ),
    });
  }

  const firstRow = meta ? (meta.page - 1) * meta.pageSize + 1 : 0;

  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone with an account, and what they are allowed to do."
        actions={
          <>
            <Button
              variant="outline"
              disabled={rows.length === 0 || exportPage.isPending}
              loading={exportPage.isPending && exportPage.variables === 'pdf'}
              onClick={() => exportPage.mutate('pdf')}
            >
              Export PDF
            </Button>
            <Button
              variant="outline"
              disabled={rows.length === 0 || exportPage.isPending}
              loading={exportPage.isPending && exportPage.variables === 'xlsx'}
              onClick={() => exportPage.mutate('xlsx')}
            >
              Export Excel
            </Button>
            {can('users:write') && (
              <Button onClick={() => setForm({ open: true })}>New user</Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-4">
        <div className="w-full sm:w-72">
          <TextField
            label="Search"
            type="search"
            placeholder="Name or email"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>
        <Select
          className="w-full sm:w-48"
          label="Role"
          options={roleFilterOptions}
          value={search.role ?? ALL_ROLES}
          onChange={(value) =>
            updateSearch({ role: value === ALL_ROLES ? undefined : value, page: 1 })
          }
        />
      </div>

      {users.isError ? (
        <QueryError error={users.error} onRetry={() => void users.refetch()} />
      ) : (
        <>
          <DataTable
            caption="Users"
            columns={columns}
            rows={rows}
            rowKey={(user) => user.id}
            loading={users.isPending}
            emptyMessage={filtered ? 'No users match these filters.' : 'There are no users yet.'}
            className={cn(users.isPlaceholderData && 'opacity-60')}
          />
          {meta && meta.total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600" aria-live="polite">
                Showing {firstRow}–{firstRow + rows.length - 1} of {meta.total}
              </p>
              <Pagination
                page={meta.page}
                totalPages={meta.totalPages}
                onPageChange={(page) => updateSearch({ page })}
              />
            </div>
          )}
        </>
      )}

      <UserFormModal
        open={form.open}
        onClose={() => setForm((current) => ({ ...current, open: false }))}
        user={form.user}
      />
      <ConfirmDialog
        open={removal.open}
        onClose={() => setRemoval((current) => ({ ...current, open: false }))}
        onConfirm={confirmRemoval}
        title="Delete this user?"
        message={`${removal.user?.name ?? 'This user'} will lose access immediately. This cannot be undone.`}
        confirmLabel="Delete user"
        tone="danger"
        loading={deleteUser.isPending}
      />
    </>
  );
}
