import React from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import type { OverviewFeedItem } from '../hooks/use-overview';

export interface OverviewTelemetryFeedProps {
  feedItems: OverviewFeedItem[];
}

export function OverviewTelemetryFeed({ feedItems }: OverviewTelemetryFeedProps) {
  return (
    <section className="panel overview-feed-panel" aria-label="Feed Aktivitas Lapangan Real-time">
      <div className="panel-inner">
        <header className="panel-heading">
          <div className="panel-heading-left">
            <h2>
              Aktivitas terbaru{' '}
              <span className="live-feed-badge">
                <span className="status-dot green" aria-hidden="true" />
                LIVE
              </span>
            </h2>
          </div>
          <Link href="/monitoring" className="link-arrow">
            <span>Lihat semua</span>
            <span className="arrow-sym" aria-hidden="true">→</span>
          </Link>
        </header>

        <ol className="feed-stream" aria-label="Daftar aktivitas terkini">
          {feedItems.slice(0, 4).map((item) => (
            <li className="feed-stream-item" key={item.id}>
              <div className={`feed-stream-icon ${item.type}`} aria-hidden="true">
                <Icon
                  name={
                    item.type === 'critical'
                      ? 'activity'
                      : item.type === 'warning'
                        ? 'wrench'
                        : item.type === 'success'
                          ? 'check'
                          : 'fileText'
                  }
                  size={15}
                />
              </div>
              <article className="feed-stream-body">
                <div className="feed-stream-top-row">
                  <b className="feed-stream-title">{item.title}</b>
                  <time className="feed-stream-time">{item.timeAgo}</time>
                </div>
                <p className="feed-stream-subtitle">{item.clusterLine}</p>
                <p className="feed-stream-subtitle muted-line">{item.customerLine}</p>
              </article>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
