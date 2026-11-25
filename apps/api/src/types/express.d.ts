import type { Role } from '@bossbyte/shared';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by the `authenticate` middleware once the access token has been verified. */
    auth?: { userId: string; role: Role };
  }
}
