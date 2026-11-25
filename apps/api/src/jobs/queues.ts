import Queue from 'bull';
import { env } from '../config/env';
import { logger } from '../lib/logger';

/**
 * Bull queues. The API process only ever *adds* jobs; the worker process
 * (src/worker.ts) is the only place they are processed.
 *
 * To add a queue: declare its payload type and accessor here, write a
 * processor in jobs/processors/, and register it in src/worker.ts.
 */

export interface EmailJob {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface ReportJob {
  type: 'users-export';
  format: 'xlsx' | 'csv';
  requestedBy: string;
}

export interface ReportJobResult {
  storageKey: string;
  fileName: string;
  rowCount: number;
}

const DEFAULT_JOB_OPTIONS: Queue.JobOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2_000 },
  // Keep a short history for inspection without letting Redis grow unbounded.
  removeOnComplete: 200,
  removeOnFail: 1_000,
};

const queues = new Map<string, Queue.Queue>();

/** Queues open Redis connections, so they are created on first use rather than at import. */
function getQueue<T>(name: string): Queue.Queue<T> {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, env.REDIS_URL, { defaultJobOptions: DEFAULT_JOB_OPTIONS });
    queue.on('error', (error) => logger.error({ err: error, queue: name }, 'Queue error'));
    queues.set(name, queue);
  }
  return queue as Queue.Queue<T>;
}

export const emailQueue = () => getQueue<EmailJob>('email');
export const reportQueue = () => getQueue<ReportJob>('reports');

/**
 * Queues an email. Sending mail is never worth failing a request over, so a
 * Redis outage here is logged rather than thrown.
 */
export async function enqueueEmail(job: EmailJob): Promise<void> {
  try {
    await emailQueue().add(job);
  } catch (error) {
    logger.error({ err: error, to: job.to, subject: job.subject }, 'Failed to queue email');
  }
}

export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((queue) => queue.close()));
  queues.clear();
}
