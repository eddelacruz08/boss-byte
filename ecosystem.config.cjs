/**
 * PM2 process file: runs BossByte on a single host as three processes.
 *
 *   npm ci && npm run build        build apps/api/dist and apps/core/dist
 *   npm run db:migrate             apply pending migrations
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 save && pm2 startup        restart everything after a reboot
 *
 *   pm2 reload ecosystem.config.cjs --env production   zero-downtime deploy
 *   pm2 logs | pm2 monit | pm2 status
 *
 * PM2 itself is AGPL-3.0 licensed, so it is deliberately not a dependency of
 * this repository. Install it on the host instead: `npm install --global pm2`.
 *
 * The API and worker read their settings from apps/api/.env (and from the
 * real environment, which wins). Put a reverse proxy in front that sends
 * /api/ to the API port and everything else to the dashboard port, so that
 * both share one origin — see the deployment guide.
 */

const path = require('node:path');

const root = __dirname;
const apiDir = path.join(root, 'apps/api');
const logDir = process.env.PM2_LOG_DIR || path.join(root, 'logs');

/** Settings shared by the two Node.js processes. */
const node = {
  cwd: apiDir,
  // Give in-flight requests and running jobs time to finish on restart. Longer
  // than the 25 seconds after which the process gives up and exits by itself
  // (apps/api/src/lib/shutdown.ts), so PM2 never has to kill it.
  kill_timeout: 30_000,
  // Back off instead of restart-looping when something is persistently broken.
  exp_backoff_restart_delay: 200,
  max_restarts: 20,
  min_uptime: '10s',
  merge_logs: true,
  time: true,
  env: { NODE_ENV: 'development' },
  env_production: { NODE_ENV: 'production' },
};

/** Settings for PM2's built-in static file server. */
const dashboard = {
  PM2_SERVE_PATH: path.join(root, 'apps/core/dist'),
  PM2_SERVE_PORT: process.env.DASHBOARD_PORT || 5173,
  // Single-page app: unknown paths fall back to index.html.
  PM2_SERVE_SPA: 'true',
  PM2_SERVE_HOMEPAGE: '/index.html',
};

module.exports = {
  apps: [
    {
      ...node,
      name: 'bossbyte-api',
      script: 'dist/server.js',
      // Cluster mode: PM2 load-balances one port across the instances.
      exec_mode: 'cluster',
      instances: process.env.API_INSTANCES || 2,
      max_memory_restart: '512M',
      out_file: path.join(logDir, 'api.out.log'),
      error_file: path.join(logDir, 'api.error.log'),
    },
    {
      ...node,
      name: 'bossbyte-worker',
      script: 'dist/worker.js',
      // One forked process: queue concurrency is set in code, not by adding instances.
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '768M',
      out_file: path.join(logDir, 'worker.out.log'),
      error_file: path.join(logDir, 'worker.error.log'),
    },
    {
      name: 'bossbyte-dashboard',
      // PM2's built-in static file server.
      script: 'serve',
      cwd: root,
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '256M',
      merge_logs: true,
      time: true,
      out_file: path.join(logDir, 'dashboard.out.log'),
      error_file: path.join(logDir, 'dashboard.error.log'),
      env: dashboard,
      // The same settings; without this block PM2 warns that `--env production` is undefined here.
      env_production: dashboard,
    },
  ],
};
