/**
 * Where to send someone after sign-in. Only paths inside the app are accepted:
 * the value comes from the URL, so anything else could be a link crafted to
 * bounce a freshly signed-in user to another site.
 *
 * @example
 *   safeRedirectPath('/users?page=2')      // '/users?page=2'
 *   safeRedirectPath('https://evil.test')  // '/'
 *   safeRedirectPath('//evil.test')        // '/'
 */
export function safeRedirectPath(value: string | undefined, fallback = '/'): string {
  if (!value?.startsWith('/')) return fallback;
  // Browsers read "//host" and "/\host" as another origin.
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (value === '/login' || value.startsWith('/login?')) return fallback;
  return value;
}
