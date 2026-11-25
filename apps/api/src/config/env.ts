import { existsSync } from 'node:fs';
import { z } from 'zod';

// Local development reads apps/api/.env; hosted environments inject real
// environment variables, which always win over the file.
if (process.env.NODE_ENV !== 'test' && existsSync('.env')) {
  process.loadEnvFile('.env');
}

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

/** An empty value in .env means "not set", not 0. */
const optionalPositiveInt = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.coerce.number().int().positive().optional(),
);

const csv = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

const base64Key = (name: string) =>
  z.string().refine((value) => Buffer.from(value, 'base64').length === 32, {
    message: `${name} must be a base64-encoded 32-byte key (run "npm run setup" to generate one)`,
  });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  APP_NAME: z.string().default('BossByte'),
  APP_URL: z.url().default('http://localhost:5173'),
  CORS_ORIGINS: csv,
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  DATABASE_SSL: z.stringbool().default(false),

  REDIS_URL: z.string().min(1),

  JWT_PRIVATE_KEY_PATH: z.string().default('./keys/jwt-private.pem'),
  JWT_PUBLIC_KEY_PATH: z.string().default('./keys/jwt-public.pem'),
  JWT_PRIVATE_KEY: optionalString,
  JWT_PUBLIC_KEY: optionalString,
  JWT_ISSUER: z.string().default('bossbyte-api'),
  JWT_AUDIENCE: z.string().default('bossbyte'),

  CSRF_SECRET: z.string().min(32, 'CSRF_SECRET must be at least 32 characters'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  RATE_LIMIT_GLOBAL_MAX: optionalPositiveInt,
  RATE_LIMIT_AUTH_MAX: optionalPositiveInt,

  DATA_ENCRYPTION_KEY: base64Key('DATA_ENCRYPTION_KEY'),
  DATA_ENCRYPTION_PREVIOUS_KEYS: csv,
  BLIND_INDEX_KEY: base64Key('BLIND_INDEX_KEY'),

  WEBAUTHN_RP_ID: z.string().default('localhost'),
  WEBAUTHN_RP_NAME: z.string().default('BossByte'),

  STORAGE_DRIVER: z.enum(['s3', 'gcs']).default('s3'),
  S3_ENDPOINT: optionalString,
  S3_PUBLIC_ENDPOINT: optionalString,
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('bossbyte'),
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  S3_FORCE_PATH_STYLE: z.stringbool().default(false),
  GCS_BUCKET: optionalString,
  GCS_PROJECT_ID: optionalString,

  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: z.stringbool().default(false),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  MAIL_FROM: z.string().default('BossByte <no-reply@bossbyte.local>'),

  FIREBASE_PROJECT_ID: optionalString,
  FIREBASE_CLIENT_EMAIL: optionalString,
  FIREBASE_PRIVATE_KEY: optionalString,

  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  WORKER_HEALTH_PORT: optionalPositiveInt,
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (parsed.success) return parsed.data;

  const problems = parsed.error.issues
    .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  // The logger depends on this module, so report directly.
  console.error(`Invalid environment configuration:\n${problems}`);
  process.exit(1);
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
