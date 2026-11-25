import { z } from 'zod';
import { idSchema, paginatedSchema } from './common';

export const fileSchema = z.object({
  id: idSchema,
  originalName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  /** Present for images: pixel dimensions after processing. */
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  uploadedBy: idSchema,
  createdAt: z.iso.datetime(),
});

export const fileUrlSchema = z.object({
  url: z.url(),
  /** Seconds until the signed URL stops working. */
  expiresIn: z.number().int().positive(),
});

export const fileListSchema = paginatedSchema(fileSchema);

export type StoredFile = z.infer<typeof fileSchema>;
export type FileUrl = z.infer<typeof fileUrlSchema>;
export type FileList = z.infer<typeof fileListSchema>;
