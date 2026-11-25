import { randomUUID } from 'node:crypto';
import type { Job } from 'bull';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { escapeHtml } from '../../lib/mailer';
import { getStorage } from '../../lib/storage';
import { buildUsersExport } from '../../modules/reports/reports.service';
import { findUserById } from '../../modules/users/users.service';
import { enqueueEmail, type ReportJob, type ReportJobResult } from '../queues';

const DOWNLOAD_LINK_TTL_SECONDS = 24 * 60 * 60;

/**
 * Builds an export, puts it in object storage and emails the requester a
 * download link. The return value is kept by Bull, which is how the API
 * answers GET /reports/exports/:id.
 *
 * Exports accumulate under the `exports/` prefix; add a lifecycle rule on the
 * bucket to expire them.
 */
export async function processReport(job: Job<ReportJob>): Promise<ReportJobResult> {
  const { format, requestedBy } = job.data;

  const document = await buildUsersExport(format);
  await job.progress(50);

  // The key is random, so it cannot be guessed from the file name.
  const storageKey = `exports/${randomUUID()}/${document.fileName}`;
  const storage = getStorage();
  await storage.put(storageKey, document.buffer, document.mimeType);
  await job.progress(90);

  const requester = await findUserById(requestedBy);
  if (requester) {
    const url = await storage.signedUrl(storageKey, {
      expiresIn: DOWNLOAD_LINK_TTL_SECONDS,
      downloadName: document.fileName,
    });
    await enqueueEmail({
      to: requester.email,
      subject: `${env.APP_NAME}: your export is ready`,
      text:
        `Hi ${requester.name},\n\n` +
        `Your export "${document.fileName}" (${document.rowCount} rows) is ready:\n${url}\n\n` +
        'The link works for 24 hours.',
      html:
        `<p>Hi ${escapeHtml(requester.name)},</p>` +
        `<p>Your export <strong>${escapeHtml(document.fileName)}</strong> ` +
        `(${document.rowCount} rows) is ready.</p>` +
        `<p><a href="${escapeHtml(url)}">Download it</a> — the link works for 24 hours.</p>`,
    });
  }

  logger.info({ jobId: job.id, storageKey, rows: document.rowCount }, 'Export built');
  return { storageKey, fileName: document.fileName, rowCount: document.rowCount };
}
