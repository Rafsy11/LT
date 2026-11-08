import React from 'react';
import type { TicketItem } from '../hooks/use-tickets';
import { TicketCard } from './ticket-card';
import { TicketCardSkeleton } from '@/components/ui/PageSkeleton';

export interface TicketGridProps {
  loading: boolean;
  tickets: TicketItem[];
  onSelectTicket: (ticket: TicketItem) => void;
  getDbmBadge: (att: number | undefined) => { label: string; cls: string };
}

const TICKET_SKELETON_COUNT = 6;

export function TicketGrid({ loading, tickets, onSelectTicket, getDbmBadge }: TicketGridProps) {
  if (loading) {
    return (
      <section className="tickets-cards-grid" aria-label="Memuat Kartu Tiket" aria-busy="true">
        {Array.from({ length: TICKET_SKELETON_COUNT }).map((_, i) => (
          <TicketCardSkeleton key={i} />
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
