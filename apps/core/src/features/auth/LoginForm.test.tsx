import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authStore } from '@/lib/auth';
import { axe } from '@/test/axe';
import { errorResponse, jsonResponse, mockFetch } from '@/test/fetch-mock';
import { buildUser } from '@/test/fixtures';
import { renderWithQuery } from '@/test/render';
import { LoginForm } from './LoginForm';

const BASE = '/api/v1';
const PASSWORD = 'BossByte-Dev-2026';
const tokens = { accessToken: 'token-1', expiresIn: 900 };
const baseRoutes = {
  [`GET ${BASE}/auth/csrf-token`]: jsonResponse({ csrfToken: 'csrf-1' }),
  [`GET ${BASE}/auth/me`]: jsonResponse(buildUser()),
};

async function fillCredentials(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  return user;
}

beforeEach(() => authStore.clear());

describe('LoginForm', () => {
  it('explains what is wrong with the form without calling the API', async () => {
    const server = mockFetch({});
    renderWithQuery(<LoginForm onSignedIn={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const email = await screen.findByLabelText('Email');
    expect(email).toBeInvalid();
    expect(email).toHaveAccessibleDescription('Enter a valid email address');
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Password is required');
    expect(server.requests).toHaveLength(0);
  });

  it('signs in with a password and reports back once the user is loaded', async () => {
    const server = mockFetch({
      ...baseRoutes,
      [`POST ${BASE}/auth/login`]: jsonResponse({ mfaRequired: false, ...tokens }),
    });
    const onSignedIn = vi.fn();
    renderWithQuery(<LoginForm onSignedIn={onSignedIn} />);

    await fillCredentials('  Admin@BossByte.local ', PASSWORD);

    await waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce());
    const [login] = server.calls(`POST ${BASE}/auth/login`);
    expect(login?.body).toEqual({ email: 'admin@bossbyte.local', password: PASSWORD });
    expect(login?.headers.get('x-csrf-token')).toBe('csrf-1');
    expect(authStore.getState().status).toBe('authenticated');
  });

  it('shows the reason the API gives when sign-in is refused', async () => {
    mockFetch({
      ...baseRoutes,
      [`POST ${BASE}/auth/login`]: errorResponse(
        401,
        'invalid_credentials',
        'Invalid email or password',
      ),
    });
    const onSignedIn = vi.fn();
    renderWithQuery(<LoginForm onSignedIn={onSignedIn} />);

    await fillCredentials('admin@bossbyte.local', 'not-the-password');

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('asks for an authentication code when the account has two-factor enabled', async () => {
    const server = mockFetch({
      ...baseRoutes,
      [`POST ${BASE}/auth/login`]: jsonResponse({ mfaRequired: true, mfaToken: 'mfa-token' }),
      [`POST ${BASE}/auth/mfa/verify`]: jsonResponse(tokens),
    });
    const onSignedIn = vi.fn();
    renderWithQuery(<LoginForm onSignedIn={onSignedIn} />);

    const user = await fillCredentials('admin@bossbyte.local', PASSWORD);

    const code = await screen.findByLabelText('Authentication code');
    expect(code).toHaveFocus();
    expect(onSignedIn).not.toHaveBeenCalled();

    await user.type(code, '12');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('Enter the 6-digit code')).toBeInTheDocument();
    expect(server.calls(`POST ${BASE}/auth/mfa/verify`)).toHaveLength(0);

    await user.type(code, '3456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce());
    expect(server.calls(`POST ${BASE}/auth/mfa/verify`)[0]?.body).toEqual({
      mfaToken: 'mfa-token',
      code: '123456',
    });
  });

  it('lets the user go back from the code step', async () => {
    mockFetch({
      ...baseRoutes,
      [`POST ${BASE}/auth/login`]: jsonResponse({ mfaRequired: true, mfaToken: 'mfa-token' }),
    });
    renderWithQuery(<LoginForm onSignedIn={vi.fn()} />);

    const user = await fillCredentials('admin@bossbyte.local', PASSWORD);
    await user.click(await screen.findByRole('button', { name: 'Back to sign in' }));

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.queryByLabelText('Authentication code')).not.toBeInTheDocument();
  });

  it('has no accessibility violations on either step, including with errors shown', async () => {
    mockFetch({
      ...baseRoutes,
      [`POST ${BASE}/auth/login`]: jsonResponse({ mfaRequired: true, mfaToken: 'mfa-token' }),
    });
    const { container } = renderWithQuery(<LoginForm onSignedIn={vi.fn()} />);
    expect(await axe(container)).toHaveNoViolations();

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Password is required');
    expect(await axe(container)).toHaveNoViolations();

    await fillCredentials('admin@bossbyte.local', PASSWORD);
    await screen.findByLabelText('Authentication code');
    expect(await axe(container)).toHaveNoViolations();
  });
});
