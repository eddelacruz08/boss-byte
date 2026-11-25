# syntax=docker/dockerfile:1

# BossByte API image. One image, three commands:
#   node dist/server.js    the HTTP API (default)
#   node dist/worker.js    the Bull queue worker
#   node dist/migrate.js   applies pending SQL migrations, then exits
#
# Build from the repository root:
#   docker build -f docker/api.Dockerfile -t bossbyte-api .

FROM node:26-slim AS base
# Match the version in package.json "packageManager": it is the one that
# understands the `allowScripts` install-script policy in the root manifest.
ARG NPM_VERSION=11.20.0
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    TURBO_TELEMETRY_DISABLED=1
RUN npm install --global npm@${NPM_VERSION}
WORKDIR /app

# ─── Cut the monorepo down to the API and the workspaces it depends on ────────
FROM base AS pruner
COPY . .
RUN npx --yes "turbo@$(node -p "require('./package.json').devDependencies.turbo")" \
      prune @bossbyte/api --docker

# ─── Install everything and bundle ────────────────────────────────────────────
FROM base AS builder
# Manifests and lockfile first, so this layer is reused until dependencies change.
COPY --from=pruner /app/out/json/ ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY --from=pruner /app/out/full/ ./
COPY tsconfig.base.json ./
RUN npx turbo run build --filter=@bossbyte/api

# ─── Production dependencies only ─────────────────────────────────────────────
FROM base AS deps
COPY --from=pruner /app/out/json/ ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# ─── Runtime ──────────────────────────────────────────────────────────────────
FROM node:26-slim AS runner
ENV NODE_ENV=production \
    PORT=4000
WORKDIR /app

# The bundle inlines @bossbyte/shared; every other dependency is loaded from
# node_modules at runtime.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/apps/api ./apps/api
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/migrations ./apps/api/migrations

# The image is read-only to the process: files are owned by root, run as `node`.
USER node
WORKDIR /app/apps/api
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "dist/server.js"]
