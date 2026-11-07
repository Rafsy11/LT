import React from 'react';
import type { TicketItem } from '../hooks/use-tickets';
import { TicketCard } from './ticket-card';
import { Skeleton } from '@/components/ui/Skeleton';

export interface TicketGridProps {
  loading: boolean;
  tickets: TicketItem[];
  onSelectTicket: (ticket: TicketItem) => void;
  getDbmBadge: (att: number | undefined) => { label: string; cls: string };
}

export function TicketGrid({ loading, tickets, onSelectTicket, getDbmBadge }: TicketGridProps) {
  if (loading) {
    return (
      <section className="tickets-cards-grid" aria-label="Memuat Kartu Tiket" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <article key={i} className="ticket-card skeleton-card" style={{ padding: '16px', minHeight: '140px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <Skeleton width={100} height={20} borderRadius={10} />
              <Skeleton width={70} height={20} borderRadius={10} />
            </div>
            <Skeleton width="80%" height={17} style={{ marginBottom: '6px' }} />
            <Skeleton width="50%" height={13} style={{ marginBottom: '12px' }} />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '10px',
                borderTop: '1px solid rgba(148, 163, 184, 0.15)',
              }}
            >
              <Skeleton width={90} height={13} />
              <Skeleton width={80} height={13} />
            </div>
          </article>
        ))}
      </section>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="empty-state-card">
        <p style={{ fontWeight: 600, color: 'inherit' }}>
          Tidak ada tiket yang cocok dengan filter pencarian.
        </p>
        <p style={{ fontSize: '12px', color: 'inherit', opacity: 0.75, marginTop: '4px' }}>
          Coba ubah kata kunci atau pilih tab status yang lain.
        </p>
      </div>
    );
  }

  return (
    <section className="tickets-cards-grid" aria-label="Daftar Kartu Tiket">
      {tickets.map((ticket) => (
        <TicketCard
          key={ticket.ticketNumber}
          ticket={ticket}
          onSelect={onSelectTicket}
          getDbmBadge={getDbmBadge}
        />
      ))}
    </section>
  );
}
