import { ActivityFeedItem } from '@repo/shared';
import { redisManager } from '../lib/redis';

type ClientListener = (data: ActivityFeedItem) => void;

class SseBroadcaster {
  private listeners: Set<ClientListener> = new Set();
  private recentBroadcastKeys: Set<string> = new Set();
  private redisSubscribed = false;

  private ensureRedisSubscription(): void {
    if (this.redisSubscribed) return;
    this.redisSubscribed = true;
    redisManager.subscribeToReports((item) => {
      this.broadcastLocal(item);
    });
  }

  private broadcastLocal(item: ActivityFeedItem): void {
    const dedupKey = `${item.id}:${item.timestamp}`;
    if (this.recentBroadcastKeys.has(dedupKey)) {
      return;
    }
    this.recentBroadcastKeys.add(dedupKey);
    if (this.recentBroadcastKeys.size > 200) {
      const firstKey = this.recentBroadcastKeys.values().next().value;
      if (firstKey) this.recentBroadcastKeys.delete(firstKey);
    }

    for (const listener of this.listeners) {
      try {
        listener(item);
      } catch (err) {
        console.error('Error broadcasting to SSE client:', err);
      }
    }
  }

  public subscribe(listener: ClientListener): () => void {
    this.ensureRedisSubscription();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public broadcast(item: ActivityFeedItem): void {
    this.broadcastLocal(item);
    void redisManager.publishLiveReport(item);
  }

  public getSubscriberCount(): number {
    return this.listeners.size;
  }
}

// Global singleton across hot reloads in Next.js
declare global {
  // eslint-disable-next-line no-var
  var sseBroadcasterGlobal: SseBroadcaster | undefined;
}

export const sseBroadcaster = global.sseBroadcasterGlobal || new SseBroadcaster();

if (process.env.NODE_ENV !== 'production') {
  global.sseBroadcasterGlobal = sseBroadcaster;
}
