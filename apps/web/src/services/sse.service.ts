import { ActivityFeedItem } from '@isp/shared';

type ClientListener = (data: ActivityFeedItem) => void;

class SseBroadcaster {
  private listeners: Set<ClientListener> = new Set();

  public subscribe(listener: ClientListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public broadcast(item: ActivityFeedItem): void {
    for (const listener of this.listeners) {
      try {
        listener(item);
      } catch (err) {
        console.error('Error broadcasting to SSE client:', err);
      }
    }
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
