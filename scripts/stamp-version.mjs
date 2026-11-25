#!/usr/bin/env node
/**
 * Sets one version across the monorepo: the root package.json, every
 * workspace package.json and package-lock.json. The release workflow runs it;
 * it does not commit, tag or publish anything.
 *
 *   node scripts/stamp-version.mjs 1.4.0        set an exact version
 *   node scripts/stamp-version.mjs minor        bump: major | minor | patch
 *   node scripts/stamp-version.mjs patch --dry-run    show what would change
 *
 * A bump drops any pre-release tag: `patch` turns 1.4.0-rc.1 into 1.4.1.
 * Under GitHub Actions the new version is exported as the step output `version`.
 *
 * Uses Node.js built-ins only.
 */

import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// https://semver.org — with numeric parts captured for bumping.
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const BUMPS = ['major', 'minor', 'patch'];

function fail(message) {
  console.error(`stamp-version: ${message}`);
  process.exit(1);
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

function resolveVersion(current, request) {
  if (BUMPS.includes(request)) {
    const match = SEMVER.exec(current);
    if (!match)
      fail(`the current version "${current}" is not valid semver, so it cannot be bumped`);
    const [major, minor, patch] = match.slice(1, 4).map(Number);
    if (request === 'major') return `${major + 1}.0.0`;
    if (request === 'minor') return `${major}.${minor + 1}.0`;
    return `${major}.${minor}.${patch + 1}`;
  }

  const version = request.replace(/^v/, '');
  if (!SEMVER.test(version)) {
    fail(
      `"${request}" is neither a semver version (1.4.0, 2.0.0-rc.1) nor one of ${BUMPS.join(', ')}`,
    );
  }
  return version;
}

/** Workspace directories, from the `workspaces` globs in the root package.json. */
function findWorkspaces(patterns) {
  const directories = [];
  for (const pattern of patterns) {
    if (pattern.endsWith('/*')) {
      const parent = pattern.slice(0, -2);
      if (!existsSync(join(root, parent))) continue;
      for (const entry of readdirSync(join(root, parent), { withFileTypes: true })) {
        if (entry.isDirectory()) directories.push(`${parent}/${entry.name}`);
      }
    } else if (pattern.includes('*')) {
      fail(`unsupported workspace pattern "${pattern}" (only "dir/*" and plain paths are handled)`);
    } else {
      directories.push(pattern);
    }
  }
  return directories
    .filter((directory) => existsSync(join(root, directory, 'package.json')))
    .sort();
}

/**
 * Rewrites only the top-level "version" line, so the rest of the file keeps
 * its formatting (JSON.stringify would undo Prettier's layout).
 */
function setPackageVersion(path, version) {
  const text = readFileSync(path, 'utf8');
  const line = /^( {2}"version":\s*)"[^"]*"/m;
  if (!line.test(text)) fail(`${path} has no top-level "version" field`);
  return text.replace(line, `$1"${version}"`);
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const positional = argv.filter((arg) => !arg.startsWith('--'));
const unknown = argv.filter((arg) => arg.startsWith('--') && arg !== '--dry-run');

if (unknown.length > 0) fail(`unknown option ${unknown.join(', ')}`);
if (positional.length !== 1) {
  fail('usage: node scripts/stamp-version.mjs <version | major | minor | patch> [--dry-run]');
}

const rootPackagePath = join(root, 'package.json');
const rootPackage = readJson(rootPackagePath);
const current = rootPackage.version;
const next = resolveVersion(current, positional[0]);
if (next === current) fail(`the version is already ${current}`);

const workspaces = findWorkspaces(rootPackage.workspaces ?? []);
const changes = [];

for (const directory of ['', ...workspaces]) {
  const path = join(root, directory, 'package.json');
  const label = join(directory, 'package.json');
  const { name, version: from } = readJson(path);
  changes.push({
    label,
    detail: `${name}  ${from} → ${next}`,
    path,
    text: setPackageVersion(path, next),
  });
}

// npm writes the lockfile with two-space JSON.stringify, so this round-trips exactly.
const lockPath = join(root, 'package-lock.json');
if (existsSync(lockPath)) {
  const lock = readJson(lockPath);
  lock.version = next;
  let entries = 0;
  for (const directory of ['', ...workspaces]) {
    const entry = lock.packages?.[directory];
    if (!entry) continue;
    entry.version = next;
    entries += 1;
  }
  changes.push({
    label: 'package-lock.json',
    detail: `${entries} workspace entries → ${next}`,
    path: lockPath,
    text: `${JSON.stringify(lock, null, 2)}\n`,
  });
} else {
  console.warn('stamp-version: package-lock.json not found, skipped');
}

console.log(`${dryRun ? 'Would stamp' : 'Stamping'} version ${current} → ${next}\n`);
for (const { label, detail, path, text } of changes) {
  console.log(`  ${label.padEnd(30)} ${detail}`);
  if (!dryRun) writeFileSync(path, text);
}
console.log(
  dryRun ? '\nDry run: no files were changed.' : `\nDone. ${changes.length} files updated.`,
);

if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${next}\n`);
