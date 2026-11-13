import { isDatabaseAvailable, isPrismaConnectionError, markDatabaseUnavailable } from '@repo/database';
import { ERROR_CODES } from '@repo/shared';

export class ServiceUnavailableError extends Error {
  public readonly statusCode = 503;
  public readonly code = ERROR_CODES.SERVICE_UNAVAILABLE;

  constructor(
    message = 'Koneksi ke database PostgreSQL terputus. Pastikan container database aktif dan konfigurasi DATABASE_URL benar.',
  ) {
    super(message);
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Checks whether strict live-data enforcement is active (default true at runtime).
 * Disabled only during Next.js production build phase or explicit test overrides (`STRICT_LIVE_DATA=false`).
 */
export function isStrictLiveMode(): boolean {
  if (
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.npm_lifecycle_event === 'build'
  ) {
    return false;
  }
  if (process.env.STRICT_LIVE_DATA === 'false') {
    return false;
  }
  if (process.env.STRICT_LIVE_DATA === 'true') {
    return true;
  }
  return true;
}

/**
 * Probes database reachability and throws ServiceUnavailableError in strict mode when unreachable.
 * Returns whether callers may execute Prisma queries.
 */
export async function requireLiveDatabase(contextMessage?: string): Promise<boolean> {
  const available = await isDatabaseAvailable();
  if (available) {
    return true;
  }
  if (isStrictLiveMode()) {
    throw new ServiceUnavailableError(contextMessage);
  }
  return false;
}

/**
 * Marks DB cache unhealthy and rethrows a clean 503 ServiceUnavailableError in strict mode.
 */
export function rethrowIfStrictDatabaseError(err: unknown, contextMessage?: string): void {
  if (err instanceof ServiceUnavailableError) {
    throw err;
  }
  markDatabaseUnavailable(err);
  if (isStrictLiveMode() && isPrismaConnectionError(err)) {
    throw new ServiceUnavailableError(contextMessage);
  }
}

