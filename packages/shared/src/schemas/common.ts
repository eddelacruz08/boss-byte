import { z } from 'zod';

export const idSchema = z.uuid();

export const idParamSchema = z.object({ id: idSchema });

export const sortOrderSchema = z.enum(['asc', 'desc']);

/** Query-string pagination. Values arrive as strings, so they are coerced. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const paginationMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

/** Wraps an item schema in the standard `{ data, meta }` list envelope. */
export function paginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({ data: z.array(item), meta: paginationMetaSchema });
}

/** The shape of every error response the API returns. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    requestId: z.string().optional(),
  }),
});

export const messageSchema = z.object({ message: z.string() });

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;
export type Paginated<T> = { data: T[]; meta: PaginationMeta };
export type ApiError = z.infer<typeof apiErrorSchema>;
export type SortOrder = z.infer<typeof sortOrderSchema>;
