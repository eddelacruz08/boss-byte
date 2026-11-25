import { createApp } from './app';
import { env } from './config/env';
import { getJwtKeys } from './config/keys';
import { pool } from './db/client';
import { closeQueues } from './jobs/queues';
import { logger } from './lib/logger';
import { redis } from './lib/redis';
import { onShutdown } from './lib/shutdown';

// Fail at startup, not on the first sign-in, if the signing keys are missing.
getJwtKeys();

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT} (docs at /api/docs)`);
});

server.on('error', (error) => {
  logger.fatal({ err: error }, 'API failed to start');
  process.exit(1);
});

onShutdown('API', async () => {
  // Stop accepting connections and let requests in flight finish first.
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeIdleConnections();
  });
  await closeQueues();
  if (redis.status !== 'wait') await redis.quit();
  await pool.end();
});
