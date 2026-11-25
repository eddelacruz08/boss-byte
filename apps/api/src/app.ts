import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router, type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { buildOpenApiDocument } from './docs/openapi';
import { logger } from './lib/logger';
import { csrfProtection, deviceSession } from './middleware/csrf';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { globalRateLimit } from './middleware/rate-limit';
import { authRouter } from './modules/auth/auth.routes';
import { filesRouter } from './modules/files/files.routes';
import { healthRouter } from './modules/health/health.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { usersRouter } from './modules/users/users.routes';
import { valuationRouter } from './modules/valuation/valuation.routes';

const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_REQUEST_ID = /^[\w.-]{1,64}$/;

/**
 * Builds the Express application without starting it, so tests can drive it
 * with Supertest and no port is ever opened.
 *
 * The order of middleware below is deliberate; each step relies on the ones
 * above it.
 */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  // Behind a proxy the client address is in X-Forwarded-For; rate limits and audit logs need it.
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(
    pinoHttp({
      logger,
      // Reuse the id set by a load balancer so one request can be traced end to end.
      genReqId: (req, res) => {
        const incoming = req.headers[REQUEST_ID_HEADER];
        const id =
          typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
        res.setHeader(REQUEST_ID_HEADER, id);
        return id;
      },
      customLogLevel: (_req, res, error) =>
        error || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
    }),
  );

  app.use(helmet());
  app.use(
    cors({
      origin: [new URL(env.APP_URL).origin, ...env.CORS_ORIGINS],
      // The refresh token travels in a cookie.
      credentials: true,
      exposedHeaders: [REQUEST_ID_HEADER, 'Content-Disposition', 'RateLimit', 'RateLimit-Policy'],
      maxAge: 600,
    }),
  );

  // Probes sit above the rate limiter and body parsers: they must stay cheap and always answer.
  app.use('/health', healthRouter);

  app.use(globalRateLimit);
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  const openApiDocument = buildOpenApiDocument();
  app.get('/api/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, { customSiteTitle: `${env.APP_NAME} API` }),
  );

  // Everything below can change state, so it sits behind CSRF protection.
  app.use(deviceSession);
  app.use(csrfProtection);

  const v1 = Router();
  v1.use('/auth', authRouter);
  v1.use('/users', usersRouter);
  v1.use('/files', filesRouter);
  v1.use('/reports', reportsRouter);
  v1.use('/valuation', valuationRouter);
  app.use('/api/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
