import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  const envCandidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(__dirname, '../../../.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../.env'),
  ];
  for (const candidate of envCandidates) {
    if (fs.existsSync(candidate) && typeof process.loadEnvFile === 'function') {
      try {
        process.loadEnvFile(candidate);
        if (process.env.DATABASE_URL) break;
      } catch {}
    }
  }
}

const DB_TCP_PROBE_TIMEOUT_MS = 250;
const DB_CACHE_TTL_ONLINE_MS = 5_000;
const DB_CACHE_TTL_OFFLINE_MS = 15_000;
const DEFAULT_POSTGRES_PORT = 5432;

const PRISMA_CONN_ERROR_CODES = new Set([
  'P1001',
  'P1002',
  'P1003',
  'P1008',
  'P1017',
  'ECONNREFUSED',
  'ETIMEDOUT',
]);

interface DbHealthCache {
  available: boolean;
  checkedAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var prismaHealthCache: DbHealthCache | undefined;
  // eslint-disable-next-line no-var
  var prismaProbeInFlight: Promise<boolean> | undefined;
}

export const prisma =
  globalThis.prismaGlobal ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}

function parseDatabaseEndpoint(): { host: string; port: number } | null {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) return null;

  try {
    const parsed = new URL(rawUrl);
    if (!parsed.hostname) return null;
    const port = parsed.port ? parseInt(parsed.port, 10) : DEFAULT_POSTGRES_PORT;
    if (Number.isNaN(port) || port <= 0) return null;
    return { host: parsed.hostname, port };
  } catch {
    return null;
  }
}

function probeTcpEndpoint(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const socket = net.createConnection({ host, port });

    const finish = (reachable: boolean) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      resolve(reachable);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

/**
 * Checks whether the configured error represents a database connectivity or socket failure.
 */
export function isPrismaConnectionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const record = err as { code?: unknown; message?: unknown };
  if (typeof record.code === 'string' && PRISMA_CONN_ERROR_CODES.has(record.code)) {
    return true;
  }
  if (typeof record.message === 'string') {
    return /can't reach database server|econnrefused|etimedout|connection refused|connection timed out|server closed the connection/i.test(
      record.message,
    );
  }
  return false;
}

/**
 * Fast TCP reachability circuit breaker that prevents Prisma engine 4s+ connection retry stalls
 * when PostgreSQL is stopped during UI-only local development or transient outages.
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  const now = Date.now();
  const cached = globalThis.prismaHealthCache;
  if (cached) {
    const ttl = cached.available ? DB_CACHE_TTL_ONLINE_MS : DB_CACHE_TTL_OFFLINE_MS;
    if (now - cached.checkedAt < ttl) {
      return cached.available;
    }
  }

  if (globalThis.prismaProbeInFlight) {
    return globalThis.prismaProbeInFlight;
  }

  const probe = (async () => {
    const endpoint = parseDatabaseEndpoint();
    if (!endpoint) {
      globalThis.prismaHealthCache = { available: false, checkedAt: Date.now() };
      return false;
    }

    const reachable = await probeTcpEndpoint(
      endpoint.host,
      endpoint.port,
      DB_TCP_PROBE_TIMEOUT_MS,
    );
    globalThis.prismaHealthCache = { available: reachable, checkedAt: Date.now() };
    return reachable;
  })().finally(() => {
    globalThis.prismaProbeInFlight = undefined;
  });

  globalThis.prismaProbeInFlight = probe;
  return probe;
}

/**
 * Trips the database health cache immediately if a Prisma query fails due to connectivity.
 */
export function markDatabaseUnavailable(err?: unknown): void {
  if (err === undefined || isPrismaConnectionError(err)) {
    globalThis.prismaHealthCache = { available: false, checkedAt: Date.now() };
  }
}

/**
 * Clears the cached reachability state so the next check forces a fresh TCP probe.
 */
export function resetDatabaseHealthCache(): void {
  globalThis.prismaHealthCache = undefined;
}

export * from './importers/palembang-datek';
export * from '@prisma/client';
