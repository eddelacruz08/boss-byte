import { pino } from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  base: { service: 'bossbyte-api' },
  // Secrets must never reach the logs, whatever a caller happens to pass in.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-csrf-token"]',
      'res.headers["set-cookie"]',
      '*.password',
      '*.currentPassword',
      '*.newPassword',
      '*.accessToken',
      '*.refreshToken',
      '*.mfaToken',
      '*.idToken',
      '*.secret',
    ],
    censor: '[redacted]',
  },
  // Human-readable output for local development; plain JSON everywhere else.
  ...(env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' },
    },
  }),
});
