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

  public async blacklistSession(sessionId: string, ttlSeconds = 604800): Promise<void> {
    if (this.publisher && this.isAvailable) {
      try {
        await this.publisher.set(`revoked_session:${sessionId}`, '1', 'EX', ttlSeconds);
      } catch (err) {
        console.warn('[Redis] Failed to blacklist session in Redis:', (err as Error).message);
      }
    }
  }

  public async isSessionBlacklisted(sessionId: string): Promise<boolean> {
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
}

declare global {
  // eslint-disable-next-line no-var
  var redisManagerGlobal: RedisManager | undefined;
}

export const redisManager = globalThis.redisManagerGlobal || new RedisManager();

if (process.env.NODE_ENV !== 'production') {
  globalThis.redisManagerGlobal = redisManager;
}
