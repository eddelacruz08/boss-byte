import type { Request } from 'express';
import { db } from '../db/client';
import { auditLogs } from '../db/schema';
import { logger } from './logger';

export type AuditAction =
  | 'auth.register'
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.refresh_reuse_detected'
  | 'auth.password_changed'
  | 'auth.totp_enabled'
  | 'auth.totp_disabled'
  | 'auth.passkey_added'
  | 'auth.passkey_removed'
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'file.uploaded'
  | 'file.deleted'
  | 'report.exported';

interface AuditEntry {
  action: AuditAction;
  userId?: string | null;
  metadata?: Record<string, unknown>;
  req?: Request;
}

/**
 * Appends to the audit trail. Auditing must never break the request it
 * describes, so failures are logged and swallowed.
 */
export async function audit({ action, userId, metadata = {}, req }: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      action,
      userId: userId ?? req?.auth?.userId ?? null,
      metadata,
      ipAddress: req?.ip ?? null,
    });
  } catch (error) {
    logger.error({ err: error, action }, 'Failed to write audit log');
  }
}
