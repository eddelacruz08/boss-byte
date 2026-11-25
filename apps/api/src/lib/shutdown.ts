import { logger } from './logger';

const FORCE_EXIT_AFTER_MS = 25_000;

/**
 * Runs `cleanup` once on SIGTERM or SIGINT, then exits. Whatever stops the
 * process sends the signal and then waits before killing it, so in-flight
 * work gets a chance to finish. How long it waits varies: 30 seconds by
 * default on Kubernetes, 10 on Docker and Cloud Run. docker-compose.yml and
 * ecosystem.config.cjs both allow 30.
 */
export function onShutdown(name: string, cleanup: () => Promise<void>): void {
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, `${name} shutting down`);

    // If cleanup hangs, exit anyway rather than wait to be killed.
    setTimeout(() => {
      logger.error(`${name} did not shut down in time; forcing exit`);
      process.exit(1);
    }, FORCE_EXIT_AFTER_MS).unref();

    cleanup().then(
      () => process.exit(0),
      (error: unknown) => {
        logger.error({ err: error }, `${name} failed to shut down cleanly`);
        process.exit(1);
      },
    );
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
