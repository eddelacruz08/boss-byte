export interface ErrorDetail {
  path: string;
  message: string;
}

/**
 * An error that is safe to show to the client. Anything thrown that is not an
 * `AppError` is reported as a generic 500 by the error handler.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (
  message = 'Bad request',
  code = 'bad_request',
  details?: ErrorDetail[],
) => new AppError(400, code, message, details);

export const unauthorized = (message = 'Authentication required', code = 'unauthorized') =>
  new AppError(401, code, message);

export const forbidden = (message = 'You do not have permission to do that', code = 'forbidden') =>
  new AppError(403, code, message);

export const notFound = (message = 'Resource not found', code = 'not_found') =>
  new AppError(404, code, message);

export const conflict = (message = 'Resource already exists', code = 'conflict') =>
  new AppError(409, code, message);

export const tooManyRequests = (message = 'Too many requests', code = 'too_many_requests') =>
  new AppError(429, code, message);

export const notImplemented = (message = 'Not available', code = 'not_implemented') =>
  new AppError(501, code, message);
