import type { Role } from '@bossbyte/shared';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { encryptedText } from './encryption';

/**
 * Drizzle table definitions. These describe the schema for the query builder
 * and for types — they do not create it. The schema itself is owned by the
 * hand-written SQL files in apps/api/migrations; keep the two in step.
 */

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    /** Null for accounts that only sign in through Firebase or a passkey. */
    passwordHash: text('password_hash'),
    role: text('role').$type<Role>().notNull().default('viewer'),
    /** AES-256-GCM encrypted. Look up by `phoneBidx`, never by this column. */
    phone: encryptedText('users.phone')('phone'),
    phoneBidx: text('phone_bidx'),
    /** AES-256-GCM encrypted TOTP shared secret (base32 once decrypted). */
    totpSecret: encryptedText('users.totp_secret')('totp_secret'),
    totpEnabled: boolean('totp_enabled').notNull().default(false),
    firebaseUid: text('firebase_uid').unique(),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamptz('last_login_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (table) => [index('users_phone_bidx_idx').on(table.phoneBidx)],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** All tokens descended from one login share a family, so they can be revoked together. */
    familyId: uuid('family_id').notNull(),
    /** SHA-256 of the token. The token itself is never stored. */
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamptz('expires_at').notNull(),
    revokedAt: timestamptz('revoked_at'),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('refresh_tokens_user_id_idx').on(table.userId),
    index('refresh_tokens_family_id_idx').on(table.familyId),
  ],
);

export const passkeys = pgTable(
  'passkeys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** WebAuthn credential id, base64url. */
    credentialId: text('credential_id').notNull().unique(),
    /** COSE public key, base64url. */
    publicKey: text('public_key').notNull(),
    counter: bigint('counter', { mode: 'number' }).notNull().default(0),
    deviceType: text('device_type').notNull(),
    backedUp: boolean('backed_up').notNull().default(false),
    transports: jsonb('transports').$type<string[]>().notNull().default([]),
    name: text('name').notNull(),
    lastUsedAt: timestamptz('last_used_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [index('passkeys_user_id_idx').on(table.userId)],
);

export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Object key inside the storage bucket. */
    storageKey: text('storage_key').notNull().unique(),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    width: integer('width'),
    height: integer('height'),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [index('files_uploaded_by_idx').on(table.uploadedBy)],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    ipAddress: text('ip_address'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_user_id_idx').on(table.userId),
    index('audit_logs_created_at_idx').on(table.createdAt),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type PasskeyRow = typeof passkeys.$inferSelect;
export type FileRow = typeof files.$inferSelect;
