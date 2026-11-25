# syntax=docker/dockerfile:1
# check=skip=SecretsUsedInArgOrEnv

# BossByte dashboard image: the Vite build served as static files by Nginx,
# which also proxies /api/ to the API so the browser only ever talks to one origin.
#
# Build from the repository root:
#   docker build -f docker/core.Dockerfile -t bossbyte-core .
#
# Runtime settings (see docker/nginx/default.conf.template):
#   PORT                      port Nginx listens on (default 8080)
#   API_UPSTREAM              where /api/ is proxied to, e.g. http://api:4000
#   CONTENT_SECURITY_POLICY   overrides the default Content-Security-Policy

FROM node:26-slim AS base
ARG NPM_VERSION=11.20.0
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    TURBO_TELEMETRY_DISABLED=1
RUN npm install --global npm@${NPM_VERSION}
WORKDIR /app

# ─── Cut the monorepo down to the dashboard and the workspaces it depends on ──
FROM base AS pruner
COPY . .
RUN npx --yes "turbo@$(node -p "require('./package.json').devDependencies.turbo")" \
      prune @bossbyte/core --docker

# ─── Install and build ────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=pruner /app/out/json/ ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY --from=pruner /app/out/full/ ./
COPY tsconfig.base.json ./

# Vite inlines VITE_* variables at build time, so they are build arguments
# rather than runtime environment. None of them may hold a secret: everything
# here ends up in the JavaScript sent to the browser.
# (That is why the build check for "secrets in ARG" is skipped at the top of
# this file: a Firebase web API key is a public identifier, not a credential.)
ARG VITE_API_URL=/api/v1
ARG VITE_FIREBASE_API_KEY=
ARG VITE_FIREBASE_AUTH_DOMAIN=
ARG VITE_FIREBASE_PROJECT_ID=
ARG VITE_FIREBASE_APP_ID=
ENV VITE_API_URL=${VITE_API_URL} \
    VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY} \
    VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN} \
    VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID} \
    VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID}
RUN npx turbo run build --filter=@bossbyte/core

# ─── Runtime ──────────────────────────────────────────────────────────────────
FROM nginx:1.31-alpine AS runner

# NGINX_ENTRYPOINT_LOCAL_RESOLVERS makes the image's entrypoint export the
# container's DNS servers as NGINX_LOCAL_RESOLVERS, which the template needs to
# resolve API_UPSTREAM at request time.
ENV PORT=8080 \
    API_UPSTREAM=http://api:4000 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    CONTENT_SECURITY_POLICY="default-src 'self'; script-src 'self' https://apis.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: http://localhost:*; font-src 'self' data:; connect-src 'self' https: http://localhost:*; frame-src 'self' https://*.firebaseapp.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"

COPY docker/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
# Rendered with envsubst into /etc/nginx/conf.d/default.conf when the container starts.
COPY docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/apps/core/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1
