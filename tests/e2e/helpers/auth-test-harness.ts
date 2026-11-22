import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import type { NextRequest } from 'next/server';

export const TEST_JWT_SECRET = 'fiberops-e2e-test-jwt-secret-9b4f2c8d1e7a6035428c9f1a0b3e7d52';
export const TEST_JWT_REFRESH_SECRET = 'fiberops-e2e-test-refresh-secret-7c3e9a1f5b2d8046139e0a2c4f6b8d10';
export const TEST_HMAC_ACTION_SECRET = 'fiberops-e2e-test-hmac-secret-4d8a2f6e0c9b13572468acef13572468';
export const TEST_TELEGRAM_WEBHOOK_SECRET = 'fiberops-e2e-test-tg-webhook-secret-8f1c3e5a7b9d024613579bdf';

export const OFFLINE_DATABASE_URL =
  'postgresql://offline:offline@127.0.0.1:59999/offline?schema=public';
export const OFFLINE_REDIS_URL = 'redis://127.0.0.1:59998';

const ENV_KEYS_TO_TRACK = [
  'NODE_ENV',
  'STRICT_LIVE_DATA',
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'HMAC_ACTION_SECRET',
  'TELEGRAM_WEBHOOK_SECRET',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_DEFAULT_CHAT_ID',
  'MINIO_ENDPOINT',
  'MINIO_PORT',
  'MINIO_BACKUP_BUCKET',
  'ENABLE_DEMO_SIMULATION',
] as const;

let savedOriginalEnv: Record<string, string | undefined> | null = null;

export function resolveRepoRoot(): string {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), '..'),
    path.resolve(process.cwd(), '../..'),
  ];
  for (const dir of candidates) {
    if (
      fs.existsSync(path.join(dir, 'package.json')) &&
      fs.existsSync(path.join(dir, 'apps', 'web', 'package.json'))
    ) {
      return dir;
    }
  }
  return path.resolve(process.cwd(), '../..');
}

export function configureOfflineTestEnv(overrides: Record<string, string | undefined> = {}): void {
  if (!savedOriginalEnv) {
    savedOriginalEnv = {};
    for (const key of ENV_KEYS_TO_TRACK) {
      savedOriginalEnv[key] = process.env[key];
    }
  }

  const defaults: Record<string, string> = {
    NODE_ENV: 'test',
    STRICT_LIVE_DATA: 'false',
    DATABASE_URL: OFFLINE_DATABASE_URL,
    REDIS_URL: OFFLINE_REDIS_URL,
    JWT_SECRET: TEST_JWT_SECRET,
    JWT_REFRESH_SECRET: TEST_JWT_REFRESH_SECRET,
    HMAC_ACTION_SECRET: TEST_HMAC_ACTION_SECRET,
    TELEGRAM_WEBHOOK_SECRET: TEST_TELEGRAM_WEBHOOK_SECRET,
    TELEGRAM_BOT_TOKEN: '000000000:AAFakeTestBotTokenForE2ESuite',
    MINIO_ENDPOINT: '127.0.0.1',
    MINIO_PORT: '59997',
  };

  for (const [k, v] of Object.entries(defaults)) {
    process.env[k] = v;
  }

  for (const [k, v] of Object.entries(overrides)) {
    if (!(k in savedOriginalEnv)) {
      savedOriginalEnv[k] = process.env[k];
    }
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }

  const g = globalThis as { prismaHealthCache?: unknown; prismaProbeInFlight?: unknown };
  g.prismaHealthCache = undefined;
  g.prismaProbeInFlight = undefined;
}

export function restoreTestEnv(): void {
  if (!savedOriginalEnv) return;
  for (const [key, val] of Object.entries(savedOriginalEnv)) {
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }
  savedOriginalEnv = null;
}

export function stubMethod<T extends object, K extends keyof T>(
  target: T,
  methodName: K,
  impl: T[K],
): () => void {
  const original = target[methodName];
  (target as Record<K, unknown>)[methodName] = impl;
  return () => {
    (target as Record<K, unknown>)[methodName] = original;
  };
}

export async function closeServerHandles(): Promise<void> {
  try {
    const { redisManager } = await import('@/server/lib/redis');
    await redisManager.close();
  } catch {
    // Ignore if redisManager was never initialized
  }

  try {
    const db = await import('@repo/database');
    if (typeof db.resetDatabaseHealthCache === 'function') {
      db.resetDatabaseHealthCache();
    }
    await db.prisma.$disconnect();
  } catch {
    // Ignore if prisma was never connected
  }

  const g = globalThis as {
    prismaHealthCache?: unknown;
    prismaProbeInFlight?: unknown;
  };
  g.prismaHealthCache = undefined;
  g.prismaProbeInFlight = undefined;
}

export async function mintTestJwt(
  claims: Record<string, unknown>,
  options: {
    secret?: string;
    subject?: string;
    expiresIn?: string;
    audience?: string;
    jti?: string;
  } = {},
): Promise<string> {
  const webRequire = createRequire(path.join(resolveRepoRoot(), 'apps', 'web', 'package.json'));
  const joseMod = (await import(
    pathToFileURL(webRequire.resolve('jose')).href
  )) as typeof import('jose');
  const secretBytes = new TextEncoder().encode(
    options.secret ?? process.env.JWT_SECRET ?? TEST_JWT_SECRET,
  );
  const jwt = new joseMod.SignJWT({
    jti: options.jti ?? crypto.randomUUID(),
    ...claims,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '1h');

  if (options.subject) {
    jwt.setSubject(options.subject);
  }
  if (options.audience) {
    jwt.setAudience(options.audience);
  }

  return await jwt.sign(secretBytes);
}

export function createNextRequest(
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
    jsonBody?: unknown;
    rawBody?: string;
  } = {},
): NextRequest {
  const webRequire = createRequire(path.join(resolveRepoRoot(), 'apps', 'web', 'package.json'));
  const nextServer = webRequire('next/server') as typeof import('next/server');
  const headers = new Headers(init.headers ?? {});
  let body: string | undefined = init.rawBody;

  if (init.jsonBody !== undefined) {
    body = JSON.stringify(init.jsonBody);
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
  }

  if (init.cookies && Object.keys(init.cookies).length > 0) {
    const cookieStr = Object.entries(init.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    const existingCookie = headers.get('cookie');
    headers.set('cookie', existingCookie ? `${existingCookie}; ${cookieStr}` : cookieStr);
  }

  const reqInit: RequestInit = {
    method: init.method ?? (body !== undefined ? 'POST' : 'GET'),
    headers,
    ...(body !== undefined ? { body } : {}),
  };

  return new nextServer.NextRequest(
    url,
    reqInit as ConstructorParameters<typeof NextRequest>[1],
  );
}

export async function runIsolatedTsxScript(
  scriptSource: string,
  envOverrides: Record<string, string | undefined> = {},
  timeoutMs = 10_000,
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  const repoRoot = resolveRepoRoot();
  const webDir = path.join(repoRoot, 'apps', 'web');
  const tsxCliPath = path.join(webDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const tsconfigPath = path.join(webDir, 'tsconfig.json');

  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const [k, v] of Object.entries(envOverrides)) {
    if (v === undefined) {
      delete childEnv[k];
    } else {
      childEnv[k] = v;
    }
  }

  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCliPath, '--tsconfig', tsconfigPath, '-'], {
      cwd: webDir,
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`Isolated tsx child timed out after ${timeoutMs}ms. stderr: ${stderr}`));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr });
    });

    child.stdin.write(scriptSource);
    child.stdin.end();
  });
}

export function createTelegramCaptureFetch(): {
  capturedMessages: Array<{ url: string; chatId: string | number; text: string; parseMode?: string }>;
  install: () => () => void;
} {
  const capturedMessages: Array<{
    url: string;
    chatId: string | number;
    text: string;
    parseMode?: string;
  }> = [];

  const install = (): (() => void) => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url.includes('api.telegram.org')) {
        if (url.includes('/sendMessage') && typeof init?.body === 'string') {
          try {
            const parsed = JSON.parse(init.body) as {
              chat_id: string | number;
              text: string;
              parse_mode?: string;
            };
            capturedMessages.push({
              url,
              chatId: parsed.chat_id,
              text: parsed.text,
              parseMode: parsed.parse_mode,
            });
          } catch {
            // ignore malformed JSON
          }
          return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ ok: true, result: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return originalFetch(input, init);
    };

    return () => {
      globalThis.fetch = originalFetch;
    };
  };

  return { capturedMessages, install };
}
