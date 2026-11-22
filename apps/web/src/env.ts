import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

let rootEnvLoaded = false;

/**
 * Loads environment variables from the monorepo root `.env` / `.env.local` once per process
 * if not already populated in `process.env` (e.g., when a contributor places `.env` at the repo root only).
 */
export function ensureRootEnvLoaded(force = false): void {
  if (rootEnvLoaded && !force) return;
  rootEnvLoaded = true;

  const candidates = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'apps', 'web', '.env.local'),
    path.resolve(process.cwd(), 'apps', 'web', '.env'),
    path.resolve(process.cwd(), '..', '.env.local'),
    path.resolve(process.cwd(), '..', '.env'),
    path.resolve(process.cwd(), '..', '..', '.env.local'),
    path.resolve(process.cwd(), '..', '..', '.env'),
  ];

  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf8');
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eqIndex = line.indexOf('=');
        if (eqIndex <= 0) continue;

        const key = line.slice(0, eqIndex).trim();
        const rawVal = line.slice(eqIndex + 1).trim();
        const unquoted = rawVal.replace(/^(['"])(.*)\1$/, '$2');

        if (process.env[key] === undefined || process.env[key] === '') {
          process.env[key] = unquoted;
        }
      }
    } catch {
      // Ignore fs errors in restricted runtimes
    }
  }
}

ensureRootEnvLoaded();

const isProductionRuntime =
  process.env.NODE_ENV === 'production' &&
  process.env.NEXT_PHASE !== 'phase-production-build' &&
  process.env.npm_lifecycle_event !== 'build';

const KNOWN_PLACEHOLDER_SECRETS = new Set([
  'fiberops_on_premise_super_secure_jwt_secret_key_32chars',
  'fiberops_action_secret_token_default_32_chars',
  'replace-with-a-secure-random-32-byte-hex-secret',
  'replace-with-telegram-bot-token-from-botfather',
]);

const PLACEHOLDER_SECRET_RE =
  /^(?:replace-with|changeme|placeholder|your-|example|default-secret)/i;

export function isNonPlaceholderSecret(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (KNOWN_PLACEHOLDER_SECRETS.has(trimmed.toLowerCase())) return false;
  if (PLACEHOLDER_SECRET_RE.test(trimmed)) return false;
  return true;
}

function emptyToUndefined(value: unknown): unknown {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }
  return value;
}

const globalForSecrets = globalThis as typeof globalThis & {
  __fiberopsDevJwtSecret?: string;
  __fiberopsDevHmacSecret?: string;
};

function getEphemeralDevSecret(kind: 'jwt' | 'hmac'): string {
  if (kind === 'jwt') {
    if (!globalForSecrets.__fiberopsDevJwtSecret) {
      globalForSecrets.__fiberopsDevJwtSecret = crypto.randomBytes(32).toString('hex');
    }
    return globalForSecrets.__fiberopsDevJwtSecret;
  }
  if (!globalForSecrets.__fiberopsDevHmacSecret) {
    globalForSecrets.__fiberopsDevHmacSecret = crypto.randomBytes(32).toString('hex');
  }
  return globalForSecrets.__fiberopsDevHmacSecret;
}

function requiredProdSecretSchema(name: string) {
  return z
    .string({ message: `${name} is required in production` })
    .min(32, `${name} must be at least 32 characters in production`)
    .refine(isNonPlaceholderSecret, `${name} must not use a known placeholder or default value`);
}

function optionalProdSecretSchema(name: string) {
  return z.preprocess(
    emptyToUndefined,
    z
      .string()
      .min(32, `${name} must be at least 32 characters when provided in production`)
      .refine(isNonPlaceholderSecret, `${name} must not use a known placeholder or default value`)
      .optional(),
  );
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: isProductionRuntime
    ? z.string().min(1, 'DATABASE_URL is required in production')
    : z
        .string()
        .default(
          'postgresql://fiberops:fiberops_secure_pass@localhost:5432/fiberops_db?schema=public',
        ),

  // Redis
  REDIS_URL: isProductionRuntime
    ? z.string().min(1, 'REDIS_URL is required in production')
    : z.string().default('redis://localhost:6379'),

  // MinIO Object Storage
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_USE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((val) => val === 'true'),
  MINIO_ACCESS_KEY: isProductionRuntime
    ? z.string().min(1, 'MINIO_ACCESS_KEY is required in production')
    : z.string().default('fiberops_minio_admin'),
  MINIO_SECRET_KEY: isProductionRuntime
    ? z.string().min(1, 'MINIO_SECRET_KEY is required in production')
    : z.string().default('fiberops_minio_secret_pass'),
  MINIO_BUCKET: z.string().default('fiberops-proofs'),
  MINIO_BACKUP_BUCKET: z.string().min(1).default('fiberops-backups'),
  MINIO_PUBLIC_URL: z.string().optional(),

  // Ollama
  OLLAMA_BASE_URL: z
    .string()
    .default('http://localhost:11434')
    .transform((val) => val.replace(/\/+$/, '').replace(/\/api$/, '')),
  OLLAMA_MODEL: z.string().default('qwen2.5:7b'),
  NGINX_HEALTH_URL: z.string().default('http://127.0.0.1/api/v1/health'),

  // Security & Authentication
  JWT_SECRET: isProductionRuntime
    ? requiredProdSecretSchema('JWT_SECRET')
    : z
        .preprocess(emptyToUndefined, z.string().min(1).optional())
        .transform((v) => v ?? getEphemeralDevSecret('jwt')),
  JWT_REFRESH_SECRET: isProductionRuntime
    ? optionalProdSecretSchema('JWT_REFRESH_SECRET')
    : z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  HMAC_ACTION_SECRET: isProductionRuntime
    ? requiredProdSecretSchema('HMAC_ACTION_SECRET')
    : z
        .preprocess(emptyToUndefined, z.string().min(1).optional())
        .transform((v) => v ?? getEphemeralDevSecret('hmac')),
  BACKUP_ENCRYPTION_KEY: isProductionRuntime
    ? optionalProdSecretSchema('BACKUP_ENCRYPTION_KEY')
    : z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  SESSION_EXPIRY_SECONDS: z.coerce.number().default(28800),

  // Telegram Bot 2FA OTP & Webhook
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().default('FiberOpsNOCBot'),
  TELEGRAM_WEBHOOK_SECRET: isProductionRuntime
    ? requiredProdSecretSchema('TELEGRAM_WEBHOOK_SECRET')
    : z.string().optional(),
  TELEGRAM_DEFAULT_CHAT_ID: z.string().optional(),

  // Mobile App Gate
  MIN_MOBILE_APP_VERSION: z.string().default('1.0.0'),

  // Public Web URL & Maps
  NEXT_PUBLIC_APP_URL: z.string().default('http://localhost:3000'),
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().optional(),

  // Strict live database/infrastructure enforcement (disables static mock fallbacks)
  STRICT_LIVE_DATA: z
    .enum(['true', 'false'])
    .default('true')
    .transform((val) => val === 'true'),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment variables:');
    console.error(z.flattenError(result.error).fieldErrors);
    throw new Error('Environment validation failed.');
  }

  return result.data;
}

export const env = parseEnv();
