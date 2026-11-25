import type { Job } from 'bull';
import { logger } from '../../lib/logger';
import { sendMail } from '../../lib/mailer';
import type { EmailJob } from '../queues';

/** Delivers one queued email. Throwing makes Bull retry with exponential backoff. */
export async function processEmail(job: Job<EmailJob>): Promise<{ messageId: string }> {
  const messageId = await sendMail(job.data);
  logger.info({ jobId: job.id, messageId, subject: job.data.subject }, 'Email sent');
  return { messageId };
}
