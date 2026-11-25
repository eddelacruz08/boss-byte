import { roleSchema, sortOrderSchema } from '@bossbyte/shared';
import { z } from 'zod';

export const USERS_SEARCH_DEFAULTS = {
  page: 1,
  pageSize: 10,
  search: '',
  sortBy: 'createdAt',
  sortOrder: 'desc',
} as const;

/**
 * The users list keeps its state in the URL, so a filtered view can be
 * bookmarked and shared. A hand-edited value that fails validation falls back
 * to its default instead of breaking the page.
 */
export const usersSearchSchema = z.object({
  page: z.number().int().min(1).default(USERS_SEARCH_DEFAULTS.page).catch(1),
  pageSize: z.number().int().min(1).max(100).default(USERS_SEARCH_DEFAULTS.pageSize).catch(10),
  search: z.string().trim().max(120).default(USERS_SEARCH_DEFAULTS.search).catch(''),
  role: roleSchema.optional().catch(undefined),
  sortBy: z
    .enum(['name', 'email', 'createdAt'])
    .default(USERS_SEARCH_DEFAULTS.sortBy)
    .catch('createdAt'),
  sortOrder: sortOrderSchema.default(USERS_SEARCH_DEFAULTS.sortOrder).catch('desc'),
});

export type UsersSearch = z.infer<typeof usersSearchSchema>;
