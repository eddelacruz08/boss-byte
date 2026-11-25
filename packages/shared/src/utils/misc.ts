import type { PaginationMeta } from '../schemas/common';

/** Throws when `condition` is falsy, and narrows its type when it is not. */
export function invariant(condition: unknown, message = 'Invariant failed'): asserts condition {
  if (!condition) throw new Error(message);
}

/** Exhaustiveness check for `switch` statements over a union. */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}

export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function round(value: number, fractionDigits = 0): number {
  const factor = 10 ** fractionDigits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function buildPaginationMeta(total: number, page: number, pageSize: number): PaginationMeta {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function paginationOffset(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}

/** A success-or-failure value for code that prefers not to throw. */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
