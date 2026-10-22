import { redisManager } from '@/lib/redis';

/**
 * Configuration for a rate-limited endpoint.
 * windowMs: sliding window duration in milliseconds.
 * maxRequests: maximum allowed requests within the window.
 */
interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

/**
 * Rate limit result returned to callers.
 */
interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

const IN_MEMORY_WINDOW_SIZE = 500;

/**
 * In-memory sliding window store as fallback when Redis is unavailable.
 * Uses Map with LRU eviction when exceeding window size.
 */
const inMemoryStore = new Map<string, number[]>();

function evictOldEntries(): void {
  if (inMemoryStore.size > IN_MEMORY_WINDOW_SIZE) {
    const firstKey = inMemoryStore.keys().next().value;
    if (firstKey !== undefined) {
      inMemoryStore.delete(firstKey);
    }
  }
}

/**
 * In-memory sliding window rate limiter.
 * Tracks timestamps of requests per key and prunes expired entries.
 */
function checkInMemory(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const windowStart = now - config.windowMs;

  let timestamps = inMemoryStore.get(key);
  if (!timestamps) {
    timestamps = [];
    evictOldEntries();
  }

  // Prune entries outside the current window
  timestamps = timestamps.filter((ts) => ts > windowStart);

  if (timestamps.length >= config.maxRequests) {
    const oldestInWindow = timestamps[0] ?? now;
    const retryAfterMs = oldestInWindow + config.windowMs - now;
    inMemoryStore.set(key, timestamps);
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(retryAfterMs, 1000),
    };
  }

  timestamps.push(now);
  inMemoryStore.set(key, timestamps);

  return {
    allowed: true,
    remaining: config.maxRequests - timestamps.length,
    retryAfterMs: 0,
  };
}

/**
 * Redis-backed sliding window rate limiter using sorted sets.
 * Falls back to in-memory if Redis is unavailable.
 *
 * @param key - Unique identifier combining route + IP/userId.
 * @param config - Window duration and max request count.
 * @returns Rate limit check result with remaining quota and retry timing.
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  try {
    const result = await redisManager.checkSlidingWindowRate(key, config.windowMs, config.maxRequests);
    return result;
  } catch {
    return checkInMemory(key, config);
  }
}

/**
 * Pre-configured rate limit profiles for specific endpoints (Phase 6 Hardening).
 */
export const RATE_LIMIT_PROFILES = {
  /** POST /api/v1/auth/login: Maksimal 5 request per 15 menit per IP + username */
  AUTH_LOGIN: { windowMs: 15 * 60_000, maxRequests: 5 } as const,

  /** POST /api/v1/admin/ai/chat: Maksimal 10 request per menit per Admin user ID */
  AI_CHAT: { windowMs: 60_000, maxRequests: 10 } as const,

  /** POST /api/v1/tech/upload-url: Maksimal 20 request per menit per Teknisi user ID */
  TECH_UPLOAD: { windowMs: 60_000, maxRequests: 20 } as const,

  /** POST /api/v1/tech/tickets/[id]/submit: Maksimal 20 request per menit per Teknisi user ID */
  TECH_SUBMIT: { windowMs: 60_000, maxRequests: 20 } as const,
} as const;
