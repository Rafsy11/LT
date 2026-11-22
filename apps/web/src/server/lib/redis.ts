import crypto from 'node:crypto';
import Redis from 'ioredis';
import { ActivityFeedItem } from '@repo/shared';
import { env } from '@/env';

export const ISP_LIVE_REPORTS_CHANNEL = 'isp_live_reports';

const redisUrl = env.REDIS_URL;

const REDIS_CONNECT_TIMEOUT_MS = 1_500;
const REDIS_COMMAND_TIMEOUT_MS = 2_000;
const REDIS_RECONNECT_COOLDOWN_MS = 15_000;

class RedisManager {
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private isAvailable = false;
  private isConnecting = false;
  private lastReconnectAttemptAt = 0;

  constructor() {
    this.initClients();
  }

  private initClients() {
    try {
      this.publisher = new Redis(redisUrl, {
        lazyConnect: true,
        connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
        commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null, // Non-blocking in dev if Redis is not running
        enableOfflineQueue: false,
      });

      this.subscriber = new Redis(redisUrl, {
        lazyConnect: true,
        connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
        commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
        enableOfflineQueue: false,
      });

      this.publisher.on('ready', () => {
        this.isAvailable = true;
      });

      this.publisher.on('error', () => {
        this.isAvailable = false;
      });

      this.publisher.on('close', () => {
        this.isAvailable = false;
      });

      this.subscriber.on('error', () => {
        this.isAvailable = false;
      });

      this.lastReconnectAttemptAt = Date.now();
      this.isConnecting = true;
      this.publisher
        .connect()
        .then(() => {
          this.isAvailable = true;
        })
        .catch(() => {
          this.isAvailable = false;
        })
        .finally(() => {
          this.isConnecting = false;
        });

      this.subscriber.connect().catch(() => {
        this.isAvailable = false;
      });
    } catch {
      this.isAvailable = false;
    }
  }

  private triggerBackgroundReconnect(): void {
    if (this.isAvailable || this.isConnecting || !this.publisher) return;
    const now = Date.now();
    if (now - this.lastReconnectAttemptAt < REDIS_RECONNECT_COOLDOWN_MS) return;

    this.lastReconnectAttemptAt = now;
    this.isConnecting = true;
    this.publisher
      .connect()
      .then(() => {
        this.isAvailable = true;
      })
      .catch(() => {
        this.isAvailable = false;
      })
      .finally(() => {
        this.isConnecting = false;
      });
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
  private inMemoryRevokedJwts = new Set<string>();
  private inMemoryActionTokens = new Set<string>();
  private inMemoryRotatedTokens = new Set<string>();
  private inMemoryKeyValue = new Map<string, { value: string; expiresAt: number }>();

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

  public async unblacklistSession(sessionId: string): Promise<void> {
    this.inMemoryRevokedSessions.delete(sessionId);
    if (this.publisher && this.isAvailable) {
      try {
        await this.publisher.del(`revoked_session:${sessionId}`);
      } catch (err) {
        console.warn('[Redis] Failed to unblacklist session in Redis:', (err as Error).message);
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

  public async revokeJwt(jti: string, ttlSeconds = 28800): Promise<void> {
    if (!jti) return;
    this.inMemoryRevokedJwts.add(jti);
    if (this.publisher && this.isAvailable) {
      try {
        await this.publisher.set(`revoked_jwt:${jti}`, '1', 'EX', Math.max(1, ttlSeconds));
      } catch (err) {
        console.warn('[Redis] Failed to revoke JWT in Redis:', (err as Error).message);
      }
    }
  }

  public async isJwtRevoked(jti: string): Promise<boolean> {
    if (!jti) return false;
    if (this.inMemoryRevokedJwts.has(jti)) {
      return true;
    }
    if (this.publisher && this.isAvailable) {
      try {
        const val = await this.publisher.get(`revoked_jwt:${jti}`);
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
    maxRequests: number,
  ): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }> {
    if (!this.publisher || !this.isAvailable) {
      this.triggerBackgroundReconnect();
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
      // Over limit: remove the entry we just speculatively added
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
        'NX',
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
  public async markRefreshTokenRotated(
    sessionId: string,
    tokenIdentifier: string,
    ttlSeconds = 604800,
  ): Promise<void> {
    const key = `${sessionId}:${tokenIdentifier}`;
    this.inMemoryRotatedTokens.add(key);

    if (!this.publisher || !this.isAvailable) return;
    try {
      await this.publisher.set(`rotated_refresh:${key}`, '1', 'EX', ttlSeconds);
    } catch {
      // Degrades gracefully to in-memory set
    }
  }

  public async isRefreshTokenRotated(sessionId: string, tokenIdentifier: string): Promise<boolean> {
    const key = `${sessionId}:${tokenIdentifier}`;
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

  public async setPersistentKey(key: string, value: string): Promise<void> {
    this.inMemoryKeyValue.set(key, {
      value,
      expiresAt: Number.MAX_SAFE_INTEGER,
    });
    if (!this.publisher || !this.isAvailable) return;
    try {
      await this.publisher.set(key, value);
    } catch {
      // Fallback to in-memory map
    }
  }

  public async ping(): Promise<boolean> {
    if (!this.publisher || !this.isAvailable) {
      this.triggerBackgroundReconnect();
      return false;
    }
    try {
      const res = await this.publisher.ping();
      return res === 'PONG';
    } catch {
      this.isAvailable = false;
      return false;
    }
  }

  public async setKeyWithTtl(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.inMemoryKeyValue.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    if (!this.publisher || !this.isAvailable) {
      this.triggerBackgroundReconnect();
      return;
    }
    try {
      await this.publisher.set(key, value, 'EX', ttlSeconds);
    } catch {
      // Fallback to in-memory map
    }
  }

  public async getKey(key: string): Promise<string | null> {
    if (this.publisher && this.isAvailable) {
      try {
        const val = await this.publisher.get(key);
        if (val !== null) return val;
      } catch {
        // Fallback to in-memory map
      }
    } else {
      this.triggerBackgroundReconnect();
    }
    const entry = this.inMemoryKeyValue.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.inMemoryKeyValue.delete(key);
      return null;
    }
    return entry.value;
  }

  public async deleteKey(key: string): Promise<void> {
    this.inMemoryKeyValue.delete(key);
    if (!this.publisher || !this.isAvailable) return;
    try {
      await this.publisher.del(key);
    } catch {
      // Ignore delete error in fallback
    }
  }

  /**
   * Atomically verifies and consumes an OTP challenge record in Redis via Lua EVAL,
   * or synchronously (zero-await) on the in-memory fallback Map when Redis is offline.
   */
  public async consumeOtpChallengeAtomic(
    key: string,
    opts: {
      expectedHash: string;
      expectedUserId?: string;
      maxAttempts: number;
      nowMs: number;
    },
  ): Promise<{
    status: 'OK' | 'NOT_FOUND' | 'EXPIRED' | 'MAX_ATTEMPTS' | 'USER_MISMATCH' | 'INVALID';
    record?: string;
    remainingAttempts?: number;
  }> {
    if (this.publisher && this.isAvailable) {
      const luaScript = `
        local raw = redis.call('GET', KEYS[1])
        if not raw then
          return {'NOT_FOUND'}
        end
        local rec = cjson.decode(raw)
        local nowMs = tonumber(ARGV[4])
        if nowMs > tonumber(rec.expiresAt) then
          redis.call('DEL', KEYS[1])
          return {'EXPIRED'}
        end
        if ARGV[2] ~= '' and rec.userId ~= ARGV[2] then
          return {'USER_MISMATCH'}
        end
        local maxAtt = tonumber(ARGV[3])
        local curAtt = tonumber(rec.attempts) or 0
        if curAtt >= maxAtt then
          redis.call('DEL', KEYS[1])
          return {'MAX_ATTEMPTS'}
        end
        if rec.otpHash == ARGV[1] then
          redis.call('DEL', KEYS[1])
          return {'OK', raw}
        end
        curAtt = curAtt + 1
        rec.attempts = curAtt
        local rem = maxAtt - curAtt
        if rem <= 0 then
          redis.call('DEL', KEYS[1])
          return {'MAX_ATTEMPTS'}
        end
        local ttl = math.max(1, math.ceil((tonumber(rec.expiresAt) - nowMs) / 1000))
        redis.call('SET', KEYS[1], cjson.encode(rec), 'EX', ttl)
        return {'INVALID', tostring(rem)}
      `;
      try {
        const res = (await this.publisher.eval(
          luaScript,
          1,
          key,
          opts.expectedHash,
          opts.expectedUserId ?? '',
          String(opts.maxAttempts),
          String(opts.nowMs),
        )) as [string, string?];

        const status = res?.[0];
        if (status === 'OK') {
          this.inMemoryKeyValue.delete(key);
          return { status: 'OK', record: res[1] };
        }
        if (status === 'EXPIRED' || status === 'MAX_ATTEMPTS') {
          this.inMemoryKeyValue.delete(key);
          return { status };
        }
        if (status === 'USER_MISMATCH') {
          return { status: 'USER_MISMATCH' };
        }
        if (status === 'INVALID') {
          return { status: 'INVALID', remainingAttempts: Number(res[1] ?? 0) };
        }
        // If NOT_FOUND in Redis, also check in-memory fallback below in case created before reconnect
        if (status === 'NOT_FOUND' && !this.inMemoryKeyValue.has(key)) {
          return { status: 'NOT_FOUND' };
        }
      } catch {
        // Fall through to synchronous in-memory atomic path
      }
    }

    // Synchronous zero-await atomic verification on in-memory Map
    const entry = this.inMemoryKeyValue.get(key);
    if (!entry) {
      return { status: 'NOT_FOUND' };
    }
    if (opts.nowMs > entry.expiresAt) {
      this.inMemoryKeyValue.delete(key);
      return { status: 'EXPIRED' };
    }

    const record = JSON.parse(entry.value) as {
      userId: string;
      otpHash: string;
      attempts: number;
      expiresAt: number;
    };

    if (opts.nowMs > record.expiresAt) {
      this.inMemoryKeyValue.delete(key);
      return { status: 'EXPIRED' };
    }

    if (opts.expectedUserId && record.userId !== opts.expectedUserId) {
      return { status: 'USER_MISMATCH' };
    }

    if (record.attempts >= opts.maxAttempts) {
      this.inMemoryKeyValue.delete(key);
      return { status: 'MAX_ATTEMPTS' };
    }

    const expectedBuf = Buffer.from(record.otpHash, 'hex');
    const candidateBuf = Buffer.from(opts.expectedHash, 'hex');
    const isMatch =
      expectedBuf.length === candidateBuf.length &&
      crypto.timingSafeEqual(expectedBuf, candidateBuf);

    if (isMatch) {
      this.inMemoryKeyValue.delete(key);
      return { status: 'OK', record: entry.value };
    }

    record.attempts += 1;
    const remainingAttempts = opts.maxAttempts - record.attempts;
    if (remainingAttempts <= 0) {
      this.inMemoryKeyValue.delete(key);
      return { status: 'MAX_ATTEMPTS' };
    }

    entry.value = JSON.stringify(record);
    this.inMemoryKeyValue.set(key, entry);
    return { status: 'INVALID', remainingAttempts };
  }

  public async close(): Promise<void> {
    try {
      if (this.publisher) {
        this.publisher.disconnect();
      }
      if (this.subscriber) {
        this.subscriber.disconnect();
      }
    } catch {
      // Ignore disconnect errors on shutdown
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
