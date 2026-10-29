import React from 'react';
import { Icon } from '@/components/ui/Icon';

export interface TicketStatsProps {
  totalWorkOrder: number;
  waitingCount: number;
  inProgressCount: number;
}

export function TicketStats({
  totalWorkOrder,
  waitingCount,
  inProgressCount,
}: TicketStatsProps) {
  return (
    <section
      className="tickets-stats-grid"
      aria-label="Statistik Penugasan Tiket"
      style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}
    >
      <article className="stat-card">
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round">
              <Icon name="ticket" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Total Work Order</span>
              <div className="stat-card-value">{totalWorkOrder}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">Seluruh tiket penugasan</span>
          </div>
        </div>
      </article>

      <article className="stat-card">
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round neutral">
              <Icon name="clock" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Menunggu Teknisi</span>
              <div className="stat-card-value">{waitingCount}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">Menunggu konfirmasi lapangan</span>
          </div>
        </div>
      </article>

      <article className="stat-card">
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round neutral">
              <Icon name="wrench" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Dalam Pengerjaan</span>
              <div className="stat-card-value" style={{ color: '#2563eb' }}>
                {inProgressCount}
              </div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">Pengerjaan fisik berlangsung</span>
          </div>
        </div>
      </article>
    </section>
  );
}

