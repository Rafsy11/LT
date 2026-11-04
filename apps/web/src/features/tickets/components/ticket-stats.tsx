import React from 'react';
import { Icon } from '@/components/ui/Icon';

export interface TicketStatsProps {
  totalWorkOrder: number;
  waitingCount: number;
  inProgressCount: number;
  completedCount?: number;
}

export function TicketStats({ totalWorkOrder, waitingCount, inProgressCount, completedCount }: TicketStatsProps) {
  return (
    <section
      className="tickets-stats-grid"
      aria-label="Statistik Penugasan Tiket"
    >
      <article className="stat-card">
        <span className="stat-card-ribbon blue">SEMUA WO</span>
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round blue">
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
        <span className="stat-card-ribbon amber">PENDING</span>
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round amber">
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
        <span className="stat-card-ribbon green">PROGRES</span>
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round green">
              <Icon name="wrench" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Dalam Pengerjaan</span>
              <div className="stat-card-value" style={{ color: '#166534' }}>
                {inProgressCount}
              </div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">Sedang dikerjakan di lapangan</span>
          </div>
        </div>
      </article>

      <article className="stat-card">
        <span className="stat-card-ribbon cyan">RESOLVED</span>
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round cyan">
              <Icon name="check" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Selesai Ditangani</span>
              <div className="stat-card-value" style={{ color: '#0e7490' }}>
                {completedCount ?? Math.max(0, totalWorkOrder - waitingCount - inProgressCount)}
              </div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">Pekerjaan lapangan selesai</span>
          </div>
        </div>
      </article>
    </section>
  );
}
