import { z } from 'zod';
import { emailSchema } from './auth';
import { nameSchema, roleSchema } from './user';

/** The figures behind the dashboard's overview page. */
export const dashboardStatsSchema = z.object({
  totals: z.object({
    users: z.number().int(),
    activeUsers: z.number().int(),
    files: z.number().int(),
    storageBytes: z.number().int(),
  }),
  usersByRole: z.array(z.object({ role: roleSchema, count: z.number().int() })),
  /** Oldest first; `month` is "YYYY-MM". Months without sign-ups are included with a zero. */
  signupsByMonth: z.array(z.object({ month: z.string(), count: z.number().int() })),
  recentActivity: z.array(
    z.object({
      id: z.uuid(),
      action: z.string(),
      userName: z.string().nullable(),
      createdAt: z.iso.datetime(),
    }),
  ),
});

export const exportFormatSchema = z.enum(['xlsx', 'csv']);

/** Asks the background worker to build an export and email a link when it is ready. */
export const exportRequestSchema = z.object({ format: exportFormatSchema.default('xlsx') });

export const exportJobSchema = z.object({
  id: z.string(),
  status: z.enum(['queued', 'active', 'completed', 'failed']),
  fileName: z.string().nullable(),
  /** Signed download URL, present once the job has completed. */
  url: z.url().nullable(),
});

/** One row of a user import file. */
export const userImportRowSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  role: roleSchema.default('viewer'),
});

/** The outcome of validating an import file, before anything is written. */
export const userImportPreviewSchema = z.object({
  total: z.number().int(),
  valid: z.array(userImportRowSchema.extend({ row: z.number().int() })),
  invalid: z.array(z.object({ row: z.number().int(), errors: z.array(z.string()) })),
});

export type DashboardStats = z.infer<typeof dashboardStatsSchema>;
export type ExportFormat = z.infer<typeof exportFormatSchema>;
export type ExportRequest = z.infer<typeof exportRequestSchema>;
export type ExportJob = z.infer<typeof exportJobSchema>;
export type UserImportRow = z.infer<typeof userImportRowSchema>;
export type UserImportPreview = z.infer<typeof userImportPreviewSchema>;
