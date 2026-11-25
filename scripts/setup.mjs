#!/usr/bin/env node
/**
 * First-run setup for local development. Safe to run as often as you like:
 * it only creates what is missing and never overwrites a secret that exists.
 *
 *   npm run setup
 *
 * What it does:
 *   1. checks the Node.js version
 *   2. creates apps/api/.env and apps/core/.env from their .env.example files
 *   3. generates the RS256 key pair that signs JWTs (apps/api/keys/)
 *   4. fills in the secrets left empty in apps/api/.env:
 *      CSRF_SECRET, DATA_ENCRYPTION_KEY and BLIND_INDEX_KEY
 *   5. points apps/api/.env at any host ports moved in the root .env
 *
 * Options:
 *   --force                    regenerate the JWT key pair and CSRF_SECRET
 *                              (signs every user out)
 *   --rotate-encryption-key    generate a new DATA_ENCRYPTION_KEY and retire
 *                              the current one into DATA_ENCRYPTION_PREVIOUS_KEYS
 *   --help                     show this text
 *
 * Uses Node.js built-ins only, so it runs before `npm install`.
 */

import { generateKeyPairSync, randomBytes } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_NODE_MAJOR = 26;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = join(root, 'apps/api');
const apiEnvPath = join(apiDir, '.env');
const apiEnvExamplePath = join(apiDir, '.env.example');
const keysDir = join(apiDir, 'keys');
const privateKeyPath = join(keysDir, 'jwt-private.pem');
const publicKeyPath = join(keysDir, 'jwt-public.pem');

const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const rotateEncryptionKey = args.has('--rotate-encryption-key');

const rel = (path) => relative(root, path);
const done = (message) => console.log(`  ✔ ${message}`);
const skipped = (message) => console.log(`  • ${message}`);
const warn = (message) => console.warn(`  ! ${message}`);

// ─── .env helpers ────────────────────────────────────────────────────────────

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const assignment = (key) => new RegExp(`^${escapeRegExp(key)}=(.*)$`, 'm');

/** Reads `KEY=value` from .env text. Returns '' when the key is absent or empty. */
function readEnvValue(text, key) {
  const match = assignment(key).exec(text);
  if (!match) return '';
  const value = match[1].trim();
  const quoted = /^(["'])(.*)\1$/.exec(value);
  return quoted ? quoted[2] : value;
}

/** Sets `KEY=value`, replacing the existing line in place or appending a new one. */
function writeEnvValue(text, key, value) {
  if (assignment(key).test(text)) return text.replace(assignment(key), () => `${key}=${value}`);
  return `${text.replace(/\n*$/, '\n')}${key}=${value}\n`;
}

// ─── Steps ───────────────────────────────────────────────────────────────────

function checkNodeVersion() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < REQUIRED_NODE_MAJOR) {
    console.error(
      `BossByte needs Node.js ${REQUIRED_NODE_MAJOR} or newer; this is ${process.version}.\n` +
        'Run `nvm install` (the version is pinned in .nvmrc) and try again.',
    );
    process.exit(1);
  }
  done(`Node.js ${process.version}`);
}

function copyEnvFile(directory) {
  const target = join(root, directory, '.env');
  const example = join(root, directory, '.env.example');
  if (existsSync(target)) return skipped(`${rel(target)} already exists`);
  if (!existsSync(example)) return skipped(`${rel(example)} not found — skipped`);
  copyFileSync(example, target);
  chmodSync(target, 0o600);
  done(`created ${rel(target)}`);
}

function generateJwtKeys() {
  const havePrivate = existsSync(privateKeyPath);
  const havePublic = existsSync(publicKeyPath);

  if (havePrivate && havePublic && !force) return skipped('JWT key pair already exists');
  if (havePrivate !== havePublic && !force) {
    return warn(
      `only one of the JWT keys exists in ${rel(keysDir)}/. ` +
        'Restore the other half, or run `npm run setup -- --force` to replace both.',
    );
  }
  if (havePrivate && force)
    warn('replacing the JWT key pair: every issued access token is now invalid');

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  mkdirSync(keysDir, { recursive: true, mode: 0o700 });
  writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
  writeFileSync(publicKeyPath, publicKey, { mode: 0o644 });
  // `mode` is ignored when a file already existed, so set it explicitly too.
  chmodSync(privateKeyPath, 0o600);
  done(`generated RS256 key pair in ${rel(keysDir)}/`);
}

function fillSecrets(text) {
  const secrets = {
    CSRF_SECRET: { generate: () => randomBytes(48).toString('base64url'), replaceable: true },
    DATA_ENCRYPTION_KEY: { generate: () => randomBytes(32).toString('base64') },
    BLIND_INDEX_KEY: { generate: () => randomBytes(32).toString('base64') },
  };

  for (const [key, { generate, replaceable }] of Object.entries(secrets)) {
    const exists = readEnvValue(text, key) !== '';
    if (exists && !(force && replaceable)) {
      skipped(`${key} already set`);
      continue;
    }
    text = writeEnvValue(text, key, generate());
    done(`${exists ? 'regenerated' : 'generated'} ${key}`);
  }
  return text;
}

/**
 * Replacing DATA_ENCRYPTION_KEY outright would make every encrypted column
 * unreadable, so the only supported change is a rotation: the current key is
 * kept as a "previous" key, which the API can still decrypt with.
 */
function rotateDataEncryptionKey(text) {
  const current = readEnvValue(text, 'DATA_ENCRYPTION_KEY');
  if (!current) return text; // nothing to retire; fillSecrets() creates the first key

  const previous = readEnvValue(text, 'DATA_ENCRYPTION_PREVIOUS_KEYS')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);
  text = writeEnvValue(text, 'DATA_ENCRYPTION_PREVIOUS_KEYS', [current, ...previous].join(','));
  text = writeEnvValue(text, 'DATA_ENCRYPTION_KEY', randomBytes(32).toString('base64'));

  done('rotated DATA_ENCRYPTION_KEY (the old key moved to DATA_ENCRYPTION_PREVIOUS_KEYS)');
  warn(
    'existing rows are still encrypted with the old key. Re-encrypt them with\n' +
      '    npm run db:rotate-keys --workspace @bossbyte/api\n' +
      '    and only then remove the old key from DATA_ENCRYPTION_PREVIOUS_KEYS.',
  );
  return text;
}

/**
 * docker-compose.yml lets host ports be moved through a root .env (for when
 * 5432 or 9000 is already taken). Follow those moves here, but only for
 * settings still at their .env.example default — a customised value is yours.
 */
function syncServicePorts(text) {
  const composeEnvPath = join(root, '.env');
  if (!existsSync(composeEnvPath) || !existsSync(apiEnvExamplePath)) return text;
  const composeEnv = readFileSync(composeEnvPath, 'utf8');
  const example = readFileSync(apiEnvExamplePath, 'utf8');

  const services = [
    { portVar: 'POSTGRES_PORT', key: 'DATABASE_URL', defaultPort: '5432' },
    { portVar: 'REDIS_PORT', key: 'REDIS_URL', defaultPort: '6379' },
    { portVar: 'MINIO_PORT', key: 'S3_ENDPOINT', defaultPort: '9000' },
    { portVar: 'MAILPIT_SMTP_PORT', key: 'SMTP_PORT', defaultPort: '1025' },
  ];

  for (const { portVar, key, defaultPort } of services) {
    const port = readEnvValue(composeEnv, portVar);
    if (!/^\d+$/.test(port) || port === defaultPort) continue;

    const current = readEnvValue(text, key);
    if (current !== readEnvValue(example, key)) continue;

    const next =
      current === defaultPort
        ? port
        : current.replace(`localhost:${defaultPort}`, `localhost:${port}`);
    if (next === current) continue;
    text = writeEnvValue(text, key, next);
    done(`${key} now uses port ${port} (${portVar} in the root .env)`);
  }
  return text;
}

// ─── Run ─────────────────────────────────────────────────────────────────────

if (args.has('--help') || args.has('-h')) {
  // The usage text is the comment at the top of this file.
  const header = /\/\*\*\n([\s\S]*?)\n \*\//.exec(
    readFileSync(fileURLToPath(import.meta.url), 'utf8'),
  );
  console.log(header[1].replace(/^ \* ?/gm, ''));
  process.exit(0);
}

const unknown = [...args].filter((arg) => !['--force', '--rotate-encryption-key'].includes(arg));
if (unknown.length > 0) {
  console.error(
    `Unknown option: ${unknown.join(', ')}\nRun \`npm run setup -- --help\` for usage.`,
  );
  process.exit(1);
}

console.log('\nBossByte setup\n');
checkNodeVersion();
copyEnvFile('apps/api');
copyEnvFile('apps/core');
generateJwtKeys();

if (existsSync(apiEnvPath)) {
  const before = readFileSync(apiEnvPath, 'utf8');
  let after = before;
  if (rotateEncryptionKey) after = rotateDataEncryptionKey(after);
  after = fillSecrets(after);
  after = syncServicePorts(after);
  if (after !== before) {
    writeFileSync(apiEnvPath, after, { mode: 0o600 });
    chmodSync(apiEnvPath, 0o600);
  }
} else {
  warn(`${rel(apiEnvPath)} is missing, so no secrets were generated`);
}

console.log(`
Next steps:
  1. npm install          install dependencies (skip if already done)
  2. npm run docker:up    start PostgreSQL, Redis, MinIO, Mailpit and pgAdmin
  3. npm run db:migrate   create the database schema
  4. npm run db:seed      add the demo accounts
  5. npm run dev          API on http://localhost:4000, dashboard on http://localhost:5173

Keep apps/api/.env and apps/api/keys/ out of version control (they are git-ignored).
Losing DATA_ENCRYPTION_KEY means losing every encrypted column — back it up.
`);
