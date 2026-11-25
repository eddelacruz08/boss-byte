---
layout: home

hero:
  name: BossByte
  text: A full-stack TypeScript boilerplate
  tagline: Express 5 API, React 19 dashboard, shared schemas and UI components — in one Turborepo, running on Node.js 26.
  actions:
    - theme: brand
      text: Install it
      link: /guide/installation
    - theme: alt
      text: What's in the box
      link: /guide/introduction
    - theme: alt
      text: API overview
      link: /api/overview

features:
  - title: One schema, both sides
    details: Zod schemas in @bossbyte/shared validate requests in the API, type the dashboard's forms and generate the OpenAPI document.
    link: /packages/shared
  - title: Authentication, done
    details: RS256 access tokens, rotating refresh tokens with reuse detection, TOTP, passkeys and optional Google sign-in through Firebase.
    link: /api/authentication
  - title: Encrypted at rest
    details: AES-256-GCM column encryption with a keyring, blind indexes for exact-match lookups and a key rotation command.
    link: /api/encryption
  - title: Files, jobs and documents
    details: S3 or Google Cloud Storage uploads, Bull queues with a separate worker, and PDF, Excel, CSV, ZIP and QR code helpers.
    link: /api/documents
  - title: Reusable UI
    details: Accessible React components and hooks on Tailwind CSS 4 and Headless UI, each tested with vitest-axe.
    link: /packages/ui
  - title: Ready to ship
    details: Dockerfiles, a Compose stack, a PM2 ecosystem file, a Cloud Run workflow and CI with lint, tests, audit and licence checks.
    link: /deployment/docker
---
