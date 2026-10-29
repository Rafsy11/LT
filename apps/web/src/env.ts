import { z } from 'zod';

const isProduction = process.env.NODE_ENV === 'production';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: isProduction
    ? z.string().min(1, 'DATABASE_URL is required in production')
    : z.string().default('postgresql://fiberops:fiberops_secure_pass@localhost:5432/fiberops_db?schema=public'),

  // Redis
  REDIS_URL: isProduction
    ? z.string().min(1, 'REDIS_URL is required in production')
    : z.string().default('redis://localhost:6379'),

  // MinIO Object Storage
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_USE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((val) => val === 'true'),
  MINIO_ACCESS_KEY: isProduction
    ? z.string().min(1, 'MINIO_ACCESS_KEY is required in production')
    : z.string().default('fiberops_minio_admin'),
  MINIO_SECRET_KEY: isProduction
    ? z.string().min(1, 'MINIO_SECRET_KEY is required in production')
    : z.string().default('fiberops_minio_secret_pass'),
  MINIO_BUCKET: z.string().default('fiberops-proofs'),

  // Ollama
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('qwen2.5:7b'),

  // Security & Authentication
  JWT_SECRET: isProduction
    ? z.string().min(32, 'JWT_SECRET must be at least 32 characters in production')
    : z.string().default('fiberops_on_premise_super_secure_jwt_secret_key_32chars'),
  HMAC_ACTION_SECRET: z.string().default('fiberops_action_secret_token_default_32_chars'),
  SESSION_EXPIRY_SECONDS: z.coerce.number().default(28800),

  // Mobile App Gate
  MIN_MOBILE_APP_VERSION: z.string().default('1.0.0'),

  // Public Web URL
  NEXT_PUBLIC_APP_URL: z.string().default('http://localhost:3000'),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    throw new Error('Environment validation failed.');
  }

  return result.data;
}

export const env = parseEnv();

