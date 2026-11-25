/**
 * Security settings shared by the API (which enforces them) and the dashboard
 * (which mirrors them in form validation and UI hints).
 */
export const SECURITY = {
  password: {
    minLength: 12,
    maxLength: 128,
    bcryptRounds: 12,
  },
  tokens: {
    /** Access tokens are short-lived and only ever held in memory by the dashboard. */
    accessTtlSeconds: 15 * 60,
    /** Refresh tokens are rotated on every use. */
    refreshTtlSeconds: 7 * 24 * 60 * 60,
    /** Lifetime of the intermediate token issued between password and second factor. */
    mfaChallengeTtlSeconds: 5 * 60,
  },
  lockout: {
    maxFailedAttempts: 5,
    windowSeconds: 15 * 60,
  },
  totp: {
    digits: 6,
    periodSeconds: 30,
    algorithm: 'SHA1',
    /** Number of periods either side of "now" that are still accepted. */
    window: 1,
  },
  webauthn: {
    challengeTtlSeconds: 5 * 60,
  },
  rateLimit: {
    global: { windowMs: 60_000, limit: 300 },
    auth: { windowMs: 15 * 60_000, limit: 20 },
  },
  uploads: {
    maxFileSizeBytes: 10 * 1024 * 1024,
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  },
  cookies: {
    refreshToken: 'bb_refresh',
    csrfToken: 'bb_csrf',
  },
  headers: {
    csrfToken: 'x-csrf-token',
  },
} as const;
