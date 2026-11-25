import type { Request } from 'express';
import type { z } from 'zod';

/**
 * Parse a part of the request with a Zod schema. A failed parse throws a
 * `ZodError`, which the error handler turns into a 400 with field-level
 * details — so handlers can use the returned, fully-typed value directly.
 */
export function parseBody<T extends z.ZodType>(schema: T, req: Request): z.output<T> {
  return schema.parse(req.body ?? {});
}

export function parseQuery<T extends z.ZodType>(schema: T, req: Request): z.output<T> {
  return schema.parse(req.query);
}

export function parseParams<T extends z.ZodType>(schema: T, req: Request): z.output<T> {
  return schema.parse(req.params);
}
