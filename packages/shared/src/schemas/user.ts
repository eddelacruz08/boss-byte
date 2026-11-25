import { z } from 'zod';
import { ROLES } from '../constants/roles';
import { emailSchema, passwordSchema } from './auth';
import { idSchema, paginatedSchema, paginationQuerySchema, sortOrderSchema } from './common';

export const roleSchema = z.enum(ROLES);

export const nameSchema = z.string().trim().min(1, 'Name is required').max(120);

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number');

/** A user as the API returns it. Secrets never leave the server. */
export const userSchema = z.object({
  id: idSchema,
  email: emailSchema,
  name: nameSchema,
  role: roleSchema,
  phone: z.string().nullable(),
  isActive: z.boolean(),
  totpEnabled: z.boolean(),
  passkeyCount: z.number().int().nonnegative(),
  lastLoginAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const createUserSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  password: passwordSchema,
  role: roleSchema.default('viewer'),
  phone: phoneSchema.nullish(),
});

export const updateUserSchema = z
  .object({
    name: nameSchema,
    role: roleSchema,
    phone: phoneSchema.nullable(),
    isActive: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export const updateProfileSchema = z.object({
  name: nameSchema,
  phone: phoneSchema.nullable(),
});

export const listUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  role: roleSchema.optional(),
  sortBy: z.enum(['name', 'email', 'createdAt']).default('createdAt'),
  sortOrder: sortOrderSchema.default('desc'),
});

export const userListSchema = paginatedSchema(userSchema);

export type User = z.infer<typeof userSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type UserList = z.infer<typeof userListSchema>;
