import type { ApiError } from '@bossbyte/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { AppError, badRequest, notFound } from '../lib/errors';
import { logger } from '../lib/logger';
import { invalidCsrfTokenError } from './csrf';

export const notFoundHandler: RequestHandler = (req) => {
  throw notFound(`No route for ${req.method} ${req.path}`, 'route_not_found');
};

/** Translates anything a route can throw into an `AppError`, or `undefined` if it is unexpected. */
function toAppError(error: unknown): AppError | undefined {
  if (error instanceof AppError) return error;

  if (error instanceof ZodError) {
    return badRequest(
      'Validation failed',
      'validation_error',
      error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  if (error === invalidCsrfTokenError) {
    return new AppError(403, 'invalid_csrf_token', 'Invalid or missing CSRF token');
  }

  if (error instanceof MulterError) {
    return error.code === 'LIMIT_FILE_SIZE'
      ? new AppError(413, 'file_too_large', 'The file is too large')
      : badRequest(error.message, 'invalid_upload');
  }

  // Errors raised by express.json(): malformed or oversized bodies.
  if (typeof error === 'object' && error !== null && 'type' in error) {
    if (error.type === 'entity.parse.failed')
      return badRequest('Malformed JSON body', 'invalid_json');
    if (error.type === 'entity.too.large') {
      return new AppError(413, 'payload_too_large', 'Request body is too large');
    }
  }

  return undefined;
}

/**
 * The single place responses for failed requests are produced. Known errors
 * are reported as they are; anything else is logged in full and reported as
 * an opaque 500, so internals never leak to the client.
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const requestId = String(req.id);
  const appError = toAppError(error);

  if (!appError) {
    (req.log ?? logger).error({ err: error }, 'Unhandled error');
    res.status(500).json({
      error: { code: 'internal_error', message: 'Something went wrong', requestId },
    } satisfies ApiError);
    return;
  }

  res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details && { details: appError.details }),
      requestId,
    },
  } satisfies ApiError);
};
