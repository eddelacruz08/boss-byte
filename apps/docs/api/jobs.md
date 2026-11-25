# Background jobs

Slow or retryable work runs outside the request, on Bull queues backed by Redis. There are two
processes:

- The **API** only adds jobs.
- The **worker** (`apps/api/src/worker.ts`) is the only place jobs are processed.

They are the same codebase and the same Docker image with a different start command. A burst of
slow jobs cannot starve HTTP requests, and you scale each on its own.

```bash
npm run dev              # starts both, with everything else
npm run dev:worker -w @bossbyte/api
node dist/worker.js      # production
```

## Queues in the starter

| Queue     | Payload                                                   | Processor                   | Concurrency              |
| --------- | --------------------------------------------------------- | --------------------------- | ------------------------ |
| `email`   | `EmailJob { to, subject, text, html? }`                   | `jobs/processors/email.ts`  | `WORKER_CONCURRENCY` (5) |
| `reports` | `ReportJob { type: 'users-export', format, requestedBy }` | `jobs/processors/report.ts` | 1                        |

Every job gets these defaults (`DEFAULT_JOB_OPTIONS` in `src/jobs/queues.ts`):

- 5 attempts, with exponential backoff starting at 2 seconds
- the last 200 completed and 1,000 failed jobs are kept in Redis for inspection

A processor signals failure by throwing. Bull retries it until the attempts run out, then marks
the job failed and the worker logs `Job failed` with the queue, job id and attempt.

## Sending email

Email always goes through the queue, never straight from a request:

```ts
import { enqueueEmail } from '../../jobs/queues';

await enqueueEmail({
  to: user.email,
  subject: 'Welcome to BossByte',
  text: `Hi ${user.name}, your account is ready.`,
  html: `<p>Hi ${escapeHtml(user.name)}, your account is ready.</p>`,
});
```

`enqueueEmail` does not throw. If Redis is down it logs the failure and returns, because a
welcome email is never worth failing a registration over. Use `escapeHtml` from `lib/mailer.ts`
for anything user-supplied that goes into `html`.

The worker delivers through Nodemailer using the `SMTP_*` settings. In development that is
Mailpit: open http://localhost:8025 to read what was sent.

## The export job, end to end

The users export shows the full pattern for a job with a result.

1. `POST /api/v1/reports/exports` with `{ "format": "xlsx" }` adds a job and answers at once:

   ```json
   { "id": "17", "status": "queued", "fileName": null, "url": null }
   ```

2. The worker builds the file, stores it in object storage under `exports/<uuid>/<fileName>`,
   and emails the requester a link that works for 24 hours.

3. The client polls `GET /api/v1/reports/exports/17`. The status moves through `queued`,
   `active` and `completed` (or `failed`). When it is complete the response carries a signed
   `url` valid for 5 minutes:

   ```json
   {
     "id": "17",
     "status": "completed",
     "fileName": "users-2026-11-23.xlsx",
     "url": "https://…"
   }
   ```

Only the user who requested an export can read its status. Anyone else gets
`404 export_not_found`.

Exported files accumulate under the `exports/` prefix. Add a lifecycle rule to the bucket to
expire them.

## Add a job

Say you want to resize images after upload.

**1. Declare the payload and the queue** in `src/jobs/queues.ts`:

```ts
export interface ThumbnailJob {
  fileId: string;
}

export const thumbnailQueue = () => getQueue<ThumbnailJob>('thumbnails');
```

Queues are created on first use, so importing this file opens no connection.

**2. Write the processor** in `src/jobs/processors/thumbnail.ts`:

```ts
import type { Job } from 'bull';
import { logger } from '../../lib/logger';
import type { ThumbnailJob } from '../queues';

/** Throwing makes Bull retry with exponential backoff. */
export async function processThumbnail(job: Job<ThumbnailJob>): Promise<void> {
  const { fileId } = job.data;
  // …do the work…
  await job.progress(50);
  logger.info({ jobId: job.id, fileId }, 'Thumbnail created');
}
```

**3. Register it** in `src/worker.ts`:

```ts
const thumbnails = thumbnailQueue();
watch(thumbnails);
void thumbnails.process(2, processThumbnail);
```

The number is how many jobs of this kind one worker process runs at a time.

**4. Add jobs** from a service:

```ts
await thumbnailQueue().add({ fileId: file.id });
```

Pass Bull options as the second argument to override the defaults for one job:

```ts
await thumbnailQueue().add({ fileId: file.id }, { delay: 60_000, attempts: 1 });
```

### Writing a good processor

- **Make it idempotent.** A job can run more than once: after a failure, or when a worker dies
  mid-job and Bull marks it stalled. Running it twice must be harmless.
- **Keep the payload small.** Put ids in the job and load the data in the processor. Payloads
  live in Redis.
- **Return something useful.** The return value is stored as the job's result;
  `GET /reports/exports/:id` reads `storageKey` and `fileName` from it.
- **Let it throw.** Do not catch errors just to log them, or Bull will think the job succeeded.

## Testing a job

In an integration test, process the queue in the test itself and wait for the job:

```ts
import { processReport } from '../../src/jobs/processors/report';
import { closeQueues, reportQueue } from '../../src/jobs/queues';

void reportQueue().process(1, processReport);
try {
  const { body } = await request(app)
    .post('/api/v1/reports/exports')
    .set('Authorization', manager.authorization)
    .send({ format: 'csv' })
    .expect(202);

  const job = await reportQueue().getJob(body.id);
  await job!.finished();
  // …assert on storage.objects and the job status endpoint…
} finally {
  await closeQueues();
}
```

See [Testing](/testing).

## Running the worker in production

- Run at least one worker, or queued email and exports never go out.
- The worker opens no port by default. Set `WORKER_HEALTH_PORT` and it serves `GET /health`
  there, for platforms that need a listening port or a probe (Cloud Run, Kubernetes).
- On `SIGTERM` it finishes the jobs in progress, then exits. Jobs still queued stay in Redis for
  the next worker. Give it time: the PM2 config allows 30 seconds.
- Redis must not evict keys. The local Compose file sets `maxmemory-policy noeviction`; do the
  same on a managed instance, or jobs can vanish under memory pressure.
- Redis is also the cache and the rate-limit store. A separate instance for queues is worth
  considering once volume grows.
