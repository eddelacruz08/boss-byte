import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from './redirect';

describe('safeRedirectPath', () => {
  it.each(['/users', '/users?page=2&search=ada', '/settings#passkeys'])(
    'accepts the in-app path %s',
    (path) => {
      expect(safeRedirectPath(path)).toBe(path);
    },
  );

  it.each([
    ['nothing', undefined],
    ['an empty string', ''],
    ['an absolute URL', 'https://evil.test/login'],
    ['a protocol-relative URL', '//evil.test'],
    ['a backslash URL', '/\\evil.test'],
    ['a relative path', 'users'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['the sign-in page', '/login'],
    ['the sign-in page with a redirect of its own', '/login?redirect=%2Fusers'],
  ])('falls back to the dashboard for %s', (_name, value) => {
    expect(safeRedirectPath(value)).toBe('/');
  });

  it('uses the fallback it is given', () => {
    expect(safeRedirectPath('//evil.test', '/settings')).toBe('/settings');
  });
});
