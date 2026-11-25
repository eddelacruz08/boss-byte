import { hasPermission, type AuthTokens, type Permission, type User } from '@bossbyte/shared';
import { useMemo, useSyncExternalStore } from 'react';
import { api, type ApiClient } from './api';

export interface AuthState {
  /** `unknown` until the first attempt to restore the session has finished. */
  status: 'unknown' | 'authenticated' | 'unauthenticated';
  user: User | null;
}

export interface AuthStore {
  getState(): AuthState;
  subscribe(listener: () => void): () => void;
  /**
   * Restores the session from the refresh cookie. Runs once; later calls
   * return the same result. Route guards await it before deciding.
   */
  restore(): Promise<User | null>;
  /** Completes a sign-in: stores the access token and loads the user. */
  signIn(tokens: AuthTokens): Promise<User>;
  /** Ends the session on the server and locally. */
  signOut(): Promise<void>;
  /** Forgets the session locally, for when the server has already ended it. */
  clear(): void;
  /** Reloads the user after something about them changed, e.g. two-factor was enabled. */
  refreshUser(): Promise<User>;
  setUser(user: User): void;
  can(permission: Permission): boolean;
}

const SIGNED_OUT: AuthState = { status: 'unauthenticated', user: null };

/**
 * Session state kept outside React, so route guards (`beforeLoad`) and the API
 * client can use it as well as components. Components read it with `useAuth`.
 */
export function createAuthStore(client: ApiClient): AuthStore {
  let state: AuthState = { status: 'unknown', user: null };
  let restoring: Promise<User | null> | null = null;
  const listeners = new Set<() => void>();

  function setState(next: AuthState) {
    state = next;
    for (const listener of listeners) listener();
  }

  function clear() {
    client.setAccessToken(null);
    setState(SIGNED_OUT);
  }

  async function refreshUser(): Promise<User> {
    const user = await client.get<User>('/auth/me');
    setState({ status: 'authenticated', user });
    return user;
  }

  client.onSessionExpired(clear);

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    restore() {
      if (state.status !== 'unknown') return Promise.resolve(state.user);
      restoring ??= client
        .refreshSession()
        .then((renewed) => (renewed ? refreshUser() : null))
        // An unreachable API leaves the visitor on the sign-in page, which reports it.
        .catch(() => null)
        .then((user) => {
          if (!user) clear();
          return user;
        });
      return restoring;
    },
    async signIn(tokens) {
      client.setAccessToken(tokens.accessToken);
      return refreshUser();
    },
    async signOut() {
      // The local session ends even if the server could not be told.
      await client.post('/auth/logout', undefined, { anonymous: true }).catch(() => undefined);
      clear();
    },
    clear,
    refreshUser,
    setUser(user) {
      setState({ status: 'authenticated', user });
    },
    can: (permission) => state.user !== null && hasPermission(state.user.role, permission),
  };
}

export const authStore = createAuthStore(api);

/**
 * The current session, for components.
 *
 * @example
 *   const { user, can, signOut } = useAuth();
 *   if (can('users:write')) return <Button onClick={invite}>Invite</Button>;
 */
export function useAuth() {
  const state = useSyncExternalStore(authStore.subscribe, authStore.getState);

  return useMemo(
    () => ({
      ...state,
      can: authStore.can,
      signIn: authStore.signIn,
      signOut: authStore.signOut,
      clear: authStore.clear,
      refreshUser: authStore.refreshUser,
      setUser: authStore.setUser,
    }),
    [state],
  );
}

/**
 * The signed-in user, for components that only render behind the route guard.
 *
 * @example
 *   const user = useCurrentUser();
 *   return <Avatar name={user.name} />;
 */
export function useCurrentUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useCurrentUser was rendered outside an authenticated route');
  return user;
}
