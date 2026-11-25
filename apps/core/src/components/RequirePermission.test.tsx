import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { authStore } from '@/lib/auth';
import { buildUser } from '@/test/fixtures';
import { RequirePermission } from './RequirePermission';

beforeEach(() => authStore.clear());

describe('RequirePermission', () => {
  it('renders its children for a role that holds the permission', () => {
    authStore.setUser(buildUser({ role: 'manager' }));
    render(
      <RequirePermission permission="users:write">
        <button type="button">New user</button>
      </RequirePermission>,
    );

    expect(screen.getByRole('button', { name: 'New user' })).toBeInTheDocument();
  });

  it('shows a notice, under the page heading, to a role without it', () => {
    authStore.setUser(buildUser({ role: 'viewer' }));
    render(
      <RequirePermission permission="users:read" pageTitle="Users">
        <p>Everyone in the workspace</p>
      </RequirePermission>,
    );

    expect(screen.queryByText('Everyone in the workspace')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Users' })).toBeInTheDocument();
    expect(screen.getByText('You do not have access to this')).toBeInTheDocument();
  });

  it('renders the fallback it is given, which may be nothing', () => {
    authStore.setUser(buildUser({ role: 'staff' }));
    const { container } = render(
      <RequirePermission permission="users:delete" fallback={null}>
        <button type="button">Delete</button>
      </RequirePermission>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('follows the session when the role changes', () => {
    authStore.setUser(buildUser({ role: 'viewer' }));
    render(
      <RequirePermission permission="valuation:run" fallback={<p>Not for you</p>}>
        <p>Run models</p>
      </RequirePermission>,
    );
    expect(screen.getByText('Not for you')).toBeInTheDocument();

    act(() => authStore.setUser(buildUser({ role: 'staff' })));
    expect(screen.getByText('Run models')).toBeInTheDocument();
  });
});
