import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { TEST_DATABASE_URL, TEST_REDIS_URL } from './defaults';

/**
 * Runs before every test file, and before any application module is imported,
 * so the environment is in place by the time src/config/env.ts validates it.
 *
 * Nothing here points at a real secret: the JWT key pair and encryption keys
 * are generated fresh for each run. Values already present in the environment
 * win, which is how CI and the integration tests supply their own.
 */

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  APP_URL: 'http://localhost:5173',
  // Unit tests never connect; only the integration tests use these.
  DATABASE_URL: TEST_DATABASE_URL,
  REDIS_URL: TEST_REDIS_URL,
  JWT_PRIVATE_KEY: Buffer.from(privateKey).toString('base64'),
  JWT_PUBLIC_KEY: Buffer.from(publicKey).toString('base64'),
  CSRF_SECRET: randomBytes(32).toString('hex'),
  DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  BLIND_INDEX_KEY: randomBytes(32).toString('base64'),
};

for (const [name, value] of Object.entries(defaults)) {
  process.env[name] ||= value;
}
