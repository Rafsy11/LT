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
        <div className="panel-heading">
          <div className="panel-heading-left">
            <h2>
              Aktivitas terbaru{' '}
              <span className="live-feed-badge">
                <span className="status-dot green" />
                LIVE
              </span>
            </h2>
          </div>
          <Link href="/monitoring" className="link-arrow">
            <span>Lihat semua</span>
            <span className="arrow-sym">→</span>
          </Link>
        </div>

        <div className="feed-stream">
          {feedItems.slice(0, 4).map((item) => (
            <div className="feed-stream-item" key={item.id}>
              <div className={`feed-stream-icon ${item.type}`}>
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
              <div className="feed-stream-body">
                <div className="feed-stream-top-row">
                  <b className="feed-stream-title">{item.title}</b>
                  <span className="feed-stream-time">{item.timeAgo}</span>
                </div>
                <p className="feed-stream-subtitle">{item.clusterLine}</p>
                <p className="feed-stream-subtitle muted-line">{item.customerLine}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

