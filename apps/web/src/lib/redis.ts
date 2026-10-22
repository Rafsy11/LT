import Redis from 'ioredis';
import { ActivityFeedItem } from '@repo/shared';

export const ISP_LIVE_REPORTS_CHANNEL = 'isp_live_reports';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

class RedisManager {
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private isAvailable = false;

  constructor() {
    this.initClients();
  }

  private initClients() {
    try {
      this.publisher = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null, // Non-blocking in dev if Redis is not running
        enableOfflineQueue: false,
      });

      this.subscriber = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
        enableOfflineQueue: false,
      });

      this.publisher.on('error', () => {
        this.isAvailable = false;
      });

      this.subscriber.on('error', () => {
        this.isAvailable = false;
      });

      this.publisher.connect().then(() => {
        this.isAvailable = true;
      }).catch(() => {
        this.isAvailable = false;
      });

      this.subscriber.connect().catch(() => {
        this.isAvailable = false;
      });
    } catch {
      this.isAvailable = false;
    }
  }

  public async publishLiveReport(item: ActivityFeedItem): Promise<void> {
    if (this.publisher && this.isAvailable) {
      try {
        await this.publisher.publish(ISP_LIVE_REPORTS_CHANNEL, JSON.stringify(item));
      } catch (err) {
        console.warn('[Redis] Failed to publish live report:', (err as Error).message);
      }
    }
  }

  public subscribeToReports(onMessage: (item: ActivityFeedItem) => void): () => void {
    if (!this.subscriber || !this.isAvailable) {
      return () => {};
    }

    const handler = (channel: string, message: string) => {
      if (channel === ISP_LIVE_REPORTS_CHANNEL) {
        try {
          const parsed = JSON.parse(message) as ActivityFeedItem;
          onMessage(parsed);
        } catch (err) {
          console.error('[Redis] Failed to parse message from stream:', err);
        }
      }
    };

    this.subscriber.subscribe(ISP_LIVE_REPORTS_CHANNEL).catch(() => {});
    this.subscriber.on('message', handler);

    return () => {
      this.subscriber?.unsubscribe(ISP_LIVE_REPORTS_CHANNEL).catch(() => {});
      this.subscriber?.off('message', handler);
    };
  }

  // In-memory fallback sets when Redis daemon is unavailable
  private inMemoryRevokedSessions = new Set<string>();
  private inMemoryActionTokens = new Set<string>();
  private inMemoryRotatedTokens = new Set<string>();

  public async blacklistSession(sessionId: string, ttlSeconds = 604800): Promise<void> {
    this.inMemoryRevokedSessions.add(sessionId);
    if (this.publisher && this.isAvailable) {
      try {
        await this.publisher.set(`revoked_session:${sessionId}`, '1', 'EX', ttlSeconds);
      } catch (err) {
        console.warn('[Redis] Failed to blacklist session in Redis:', (err as Error).message);
      }
    }
  }

  public async isSessionBlacklisted(sessionId: string): Promise<boolean> {
    if (this.inMemoryRevokedSessions.has(sessionId)) {
      return true;
    }
    if (this.publisher && this.isAvailable) {
      try {
        const val = await this.publisher.get(`revoked_session:${sessionId}`);
        return val === '1';
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Sliding window rate limiter using Redis sorted sets.
   * Each request is scored by its timestamp; expired entries are pruned per call.
   */
  public async checkSlidingWindowRate(
    key: string,
    windowMs: number,
    maxRequests: number
  ): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }> {
    if (!this.publisher || !this.isAvailable) {
      throw new Error('Redis unavailable for rate limiting');
    }

    const redisKey = `rate_limit:${key}`;
    const now = Date.now();
    const windowStart = now - windowMs;
    const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;

    const pipeline = this.publisher.pipeline();
    // Remove entries outside the current window
    pipeline.zremrangebyscore(redisKey, '-inf', windowStart);
    // Count remaining entries in window
    pipeline.zcard(redisKey);
    // Add current request
    pipeline.zadd(redisKey, now, member);
    // Set TTL to auto-expire the sorted set
    pipeline.pexpire(redisKey, windowMs);

    const results = await pipeline.exec();
    if (!results) {
      throw new Error('Redis pipeline returned null');
    }

    const currentCount = (results[1]?.[1] as number) ?? 0;

    if (currentCount >= maxRequests) {
      // Over limit — remove the entry we just speculatively added
      await this.publisher.zrem(redisKey, member).catch(() => {});
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: windowMs,
      };
    }

    return {
      allowed: true,
      remaining: maxRequests - currentCount - 1,
      retryAfterMs: 0,
    };
  }

  /**
   * Marks an AI action token JTI as consumed (single-use replay prevention).
   * Uses SETNX to atomically claim the token, with TTL matching token validity.
   * Falls back to in-memory set when Redis is offline.
   */
  public async markActionTokenUsed(jti: string, ttlSeconds = 300): Promise<boolean> {
    if (this.inMemoryActionTokens.has(jti)) {
      return false; // Replay detected
    }

    if (!this.publisher || !this.isAvailable) {
      this.inMemoryActionTokens.add(jti);
      return true; // First use in fallback
    }

    try {
      const result = await this.publisher.set(
        `action_token_used:${jti}`,
        '1',
        'EX',
        ttlSeconds,
        'NX'
      );
      if (result === 'OK') {
        this.inMemoryActionTokens.add(jti);
        return true;
      }
      return false; // Already claimed in Redis
    } catch {
      this.inMemoryActionTokens.add(jti);
      return true;
    }
  }

  /**
   * Checks if an AI action token JTI has already been consumed.
   */
  public async isActionTokenUsed(jti: string): Promise<boolean> {
    if (this.inMemoryActionTokens.has(jti)) {
      return true;
    }
    if (!this.publisher || !this.isAvailable) {
      return false;
    }
    try {
      const val = await this.publisher.get(`action_token_used:${jti}`);
      return val === '1';
    } catch {
      return false;
    }
  }

  /**
   * Token Reuse Detection for Refresh Token Rotation.
   * Stores the latest refresh token fingerprint per session. If a previously-rotated
   * token is reused, all sessions for the user must be revoked.
   */
  public async markRefreshTokenRotated(sessionId: string, tokenIdentifier: string, ttlSeconds = 604800): Promise<void> {
    const key = `${sessionId}:${tokenIdentifier.slice(0, 32)}`;
    this.inMemoryRotatedTokens.add(key);

    if (!this.publisher || !this.isAvailable) return;
    try {
      await this.publisher.set(
        `rotated_refresh:${key}`,
        '1',
        'EX',
        ttlSeconds
      );
    } catch {
      // Degrades gracefully to in-memory set
    }
  }

  public async isRefreshTokenRotated(sessionId: string, tokenIdentifier: string): Promise<boolean> {
    const key = `${sessionId}:${tokenIdentifier.slice(0, 32)}`;
    if (this.inMemoryRotatedTokens.has(key)) {
      return true;
    }
    if (!this.publisher || !this.isAvailable) return false;
    try {
      const val = await this.publisher.get(`rotated_refresh:${key}`);
      return val === '1';
    } catch {
      return false;
    }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var redisManagerGlobal: RedisManager | undefined;
}

export const redisManager = globalThis.redisManagerGlobal || new RedisManager();

if (process.env.NODE_ENV !== 'production') {
  globalThis.redisManagerGlobal = redisManager;
}
