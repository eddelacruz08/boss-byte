#!/usr/bin/env node
/**
 * Fails when a dependency that ships to production uses a licence that is not
 * on the allow-list below.
 *
 *   npm run licenses                   check production dependencies
 *   npm run licenses -- --summary      ...and print how many packages use each licence
 *   npm run licenses -- --include-dev  also check devDependencies (never shipped)
 *
 * How it works:
 *   - package-lock.json says which packages are production dependencies
 *     (license-checker's own `production` filter does not understand npm
 *     workspaces), across every platform, not only the one you are on;
 *   - license-checker reads the licence of every installed package, falling
 *     back to its LICENSE file when package.json does not say;
 *   - packages that are not installed here (binaries for other operating
 *     systems) are judged by the licence recorded in the lockfile.
 *
 * To accept a new licence, add it to ALLOWED. To accept one package despite
 * its licence, add it to EXCEPTIONS with the reason — and get that reviewed.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { init } from 'license-checker-rseidelsohn';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Permissive licences: no obligations beyond attribution and keeping notices. */
const ALLOWED = new Set([
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC-BY-4.0',
  'CC0-1.0',
  'ISC',
  'MIT',
  'MIT-0',
  'Python-2.0',
  'Unlicense',
  'Zlib',
]);

/**
 * Also fine for devDependencies, which are build and test tools that are never
 * distributed (only checked with --include-dev).
 */
const ALLOWED_FOR_DEV = new Set([...ALLOWED, 'CC-BY-3.0', 'MPL-2.0']);

/** Non-SPDX spellings found in old package.json files. */
const ALIASES = new Map([['MIT/X11', 'MIT']]);

/**
 * Packages accepted despite their licence. An exception only applies while the
 * package still reports exactly the licence written here, so a licence change
 * upstream is flagged again.
 */
const EXCEPTIONS = [
  {
    name: /^@img\/sharp-libvips-/,
    license: 'LGPL-3.0-or-later',
    reason:
      'Prebuilt libvips binaries that sharp loads as a separate shared library. They are used ' +
      'unmodified and can be replaced by the user, which is what the LGPL asks for.',
  },
  {
    name: /^@img\/sharp-win32-/,
    license: 'Apache-2.0 AND LGPL-3.0-or-later',
    reason: 'sharp for Windows bundles the LGPL libvips DLLs next to its own Apache-2.0 code.',
  },
  {
    name: '@img/sharp-wasm32',
    license: 'Apache-2.0 AND LGPL-3.0-or-later AND MIT',
    reason: 'sharp for WebAssembly links libvips; unmodified and not used in server builds.',
  },
  {
    name: /^(react-leaflet|@react-leaflet\/core)$/,
    license: 'Hippocratic-2.1',
    reason:
      'Required by the project specification (React Leaflet maps). The Hippocratic licence is ' +
      'not OSI-approved: it forbids use that violates human-rights law. NEEDS LEGAL REVIEW ' +
      'before a commercial release; the alternative is using Leaflet (BSD-2-Clause) directly.',
  },
  {
    name: 'buffers',
    license: 'UNKNOWN',
    reason:
      'buffers@0.1.1 (exceljs → unzipper → binary → buffers) was published without any licence ' +
      'metadata. Its only dependant, `binary`, is MIT and by the same author. NEEDS REVIEW.',
  },
];

const args = new Set(process.argv.slice(2));
const includeDev = args.has('--include-dev');
const showSummary = args.has('--summary');

// ─── Which packages to check ─────────────────────────────────────────────────

/** Every third-party package in the lockfile that ships to production. */
function readLockfile() {
  const lockPath = join(root, 'package-lock.json');
  if (!existsSync(lockPath)) {
    console.error('package-lock.json not found. Run `npm install` first.');
    process.exit(1);
  }
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  if (!lock.packages) {
    console.error(
      'package-lock.json has no "packages" map (lockfileVersion 2 or newer is needed).',
    );
    process.exit(1);
  }

  const packages = new Map();
  for (const [path, entry] of Object.entries(lock.packages)) {
    const marker = path.lastIndexOf('node_modules/');
    // Skips the root project, the workspaces themselves and their symlinks.
    if (marker === -1 || entry.link) continue;
    if (entry.dev && !includeDev) continue;

    const name = entry.name ?? path.slice(marker + 'node_modules/'.length);
    packages.set(`${name}@${entry.version}`, {
      name,
      version: entry.version,
      lockLicense: entry.license,
      dev: Boolean(entry.dev),
    });
  }
  return packages;
}

/** Licences of the installed packages, keyed by `name@version`. */
function scanInstalled() {
  return new Promise((resolve, reject) => {
    init({ start: root }, (error, found) => (error ? reject(error) : resolve(found)));
  });
}

// ─── Licence expressions ─────────────────────────────────────────────────────

/** `MIT*` means license-checker guessed from the LICENSE file; that is good enough. */
const normalise = (id) => {
  const cleaned = id.trim().replace(/\*$/, '');
  return ALIASES.get(cleaned) ?? cleaned;
};

/**
 * Evaluates an SPDX expression such as `(MIT OR GPL-3.0) AND Zlib`:
 * `OR` needs one side to be allowed, `AND` needs both.
 */
function isAllowed(expression, allowed = ALLOWED) {
  const tokens = expression.match(/\(|\)|[^\s()]+/g) ?? [];
  let position = 0;

  function parseOr() {
    let ok = parseAnd();
    while (tokens[position] === 'OR') {
      position += 1;
      ok = parseAnd() || ok;
    }
    return ok;
  }

  function parseAnd() {
    let ok = parseOperand();
    while (tokens[position] === 'AND') {
      position += 1;
      ok = parseOperand() && ok;
    }
    return ok;
  }

  function parseOperand() {
    if (tokens[position] === '(') {
      position += 1;
      const ok = parseOr();
      if (tokens[position] === ')') position += 1;
      return ok;
    }
    // A licence id is usually one word, but not always: "GPL-2.0 WITH
    // Classpath-exception-2.0", "SEE LICENSE IN LICENSE.md".
    const words = [];
    while (position < tokens.length && !['AND', 'OR', '(', ')'].includes(tokens[position])) {
      words.push(tokens[position]);
      position += 1;
    }
    return allowed.has(normalise(words.join(' ')));
  }

  const ok = parseOr();
  // Leftover tokens mean the expression did not parse; never guess in its favour.
  return ok && position === tokens.length;
}

/** license-checker returns a string, or an array for the legacy `licenses: []` field (a choice). */
const toExpression = (licenses) =>
  Array.isArray(licenses) ? licenses.join(' OR ') : (licenses ?? 'UNKNOWN');

function findException({ name, license }) {
  return EXCEPTIONS.find(
    (exception) =>
      (exception.name instanceof RegExp ? exception.name.test(name) : exception.name === name) &&
      exception.license === license,
  );
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const lockPackages = readLockfile();
const installed = await scanInstalled();

const violations = [];
const excepted = [];
const usedExceptions = new Set();
const counts = new Map();
let notInstalled = 0;

for (const [key, { name, version, lockLicense, dev }] of lockPackages) {
  const scanned = installed[key];
  if (!scanned) notInstalled += 1;
  const license = normalise(toExpression(scanned ? scanned.licenses : lockLicense));
  counts.set(license, (counts.get(license) ?? 0) + 1);

  if (isAllowed(license, dev ? ALLOWED_FOR_DEV : ALLOWED)) continue;

  const exception = findException({ name, license });
  if (exception) {
    usedExceptions.add(exception);
    excepted.push({ name, version, license, reason: exception.reason });
  } else {
    violations.push({ name, version, license, source: scanned ? 'installed' : 'lockfile' });
  }
}

const scope = includeDev ? 'dependencies (including dev)' : 'production dependencies';
console.log(
  `Checked ${lockPackages.size} ${scope}` +
    (notInstalled > 0
      ? ` (${notInstalled} not installed on this platform, read from the lockfile).`
      : '.'),
);

if (showSummary) {
  console.log('\nLicences in use:');
  for (const [license, count] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(5)}  ${license}`);
  }
}

if (excepted.length > 0) {
  console.log(`\nAccepted by exception (${excepted.length}):`);
  for (const exception of usedExceptions) {
    const members = excepted.filter((item) => item.reason === exception.reason);
    console.log(`  ${exception.license}`);
    for (const { name, version } of members) console.log(`    - ${name}@${version}`);
    console.log(`    ${exception.reason}`);
  }
}

for (const exception of EXCEPTIONS) {
  if (!usedExceptions.has(exception)) {
    console.warn(
      `\nWarning: the exception for ${exception.name} (${exception.license}) no longer matches ` +
        'any package. Remove it from scripts/check-licenses.mjs.',
    );
  }
}

if (violations.length > 0) {
  console.error(
    `\n✖ ${violations.length} package(s) use a licence that is not on the allow-list:\n`,
  );
  for (const { name, version, license, source } of violations) {
    console.error(
      `  ${name}@${version}  →  ${license}${source === 'lockfile' ? '  (from lockfile)' : ''}`,
    );
  }
  console.error(
    '\nReplace the dependency, or — after review — add the licence to ALLOWED or the package ' +
      'to EXCEPTIONS in scripts/check-licenses.mjs.',
  );
  process.exit(1);
}

console.log('\n✔ All licences are allowed.');
