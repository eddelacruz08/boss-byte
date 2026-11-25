import { createServer, type Server } from 'node:http';
import type { Queue } from 'bull';
import { env } from './config/env';
import { pool } from './db/client';
import { processEmail } from './jobs/processors/email';
import { processReport } from './jobs/processors/report';
import { closeQueues, emailQueue, reportQueue } from './jobs/queues';
import { logger } from './lib/logger';
import { redis } from './lib/redis';
import { onShutdown } from './lib/shutdown';

/**
 * The background worker: a separate process from the API, so a burst of slow
 * jobs can never starve HTTP requests, and each can be scaled on its own.
 *
 *   npm run dev:worker      (development)
 *   node dist/worker.js     (production)
 */

function watch(queue: Queue): void {
  queue.on('failed', (job, error) => {
    logger.error(
      { err: error, queue: queue.name, jobId: job.id, attempt: job.attemptsMade },
      'Job failed',
    );
  });
  queue.on('stalled', (job) => {
    logger.warn({ queue: queue.name, jobId: job.id }, 'Job stalled and will be retried');
  });
}

// `process` resolves only when the queue closes; failures surface through the events above.
const emails = emailQueue();
watch(emails);
void emails.process(env.WORKER_CONCURRENCY, processEmail);

// Reports hold a whole document in memory, so they run one at a time.
const reports = reportQueue();
watch(reports);
void reports.process(1, processReport);

/**
 * Platforms built around HTTP services (Cloud Run, for one) only keep a
 * container alive if it listens on a port. Setting WORKER_HEALTH_PORT makes
 * the worker answer GET /health; without it no port is opened.
 */
let healthServer: Server | undefined;
if (env.WORKER_HEALTH_PORT) {
  healthServer = createServer((req, res) => {
    const healthy = req.method === 'GET' && req.url === '/health';
    res.writeHead(healthy ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(healthy ? { status: 'ok' } : { error: 'not_found' }));
  }).listen(env.WORKER_HEALTH_PORT);
}

logger.info(
  { concurrency: env.WORKER_CONCURRENCY, healthPort: env.WORKER_HEALTH_PORT ?? null },
  'Worker started',
);

onShutdown('Worker', async () => {
  healthServer?.close();
  // Waits for the jobs being processed right now; queued jobs stay in Redis.
  await closeQueues();
  if (redis.status !== 'wait') await redis.quit();
  await pool.end();
});
