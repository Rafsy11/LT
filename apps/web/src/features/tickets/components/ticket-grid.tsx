import React from 'react';
import type { TicketItem } from '../hooks/use-tickets';
import { TicketCard } from './ticket-card';

export interface TicketGridProps {
  loading: boolean;
  tickets: TicketItem[];
  onSelectTicket: (ticket: TicketItem) => void;
  getDbmBadge: (att: number | undefined) => { label: string; cls: string };
}

export function TicketGrid({ loading, tickets, onSelectTicket, getDbmBadge }: TicketGridProps) {
  if (loading) {
    return (
      <div style={{ padding: '36px', textAlign: 'center', color: '#64748b' }}>
        Memuat daftar work order...
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div
        style={{
          padding: '48px',
          textAlign: 'center',
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #dce7f0',
        }}
      >
        <p style={{ fontWeight: 600, color: '#0f172a' }}>
          Tidak ada tiket yang cocok dengan filter pencarian.
        </p>
        <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
          Coba ubah kata kunci atau pilih tab status yang lain.
        </p>
      </div>
    );
  }

  return (
    <div className="tickets-cards-grid">
      {tickets.map((ticket) => (
        <TicketCard
          key={ticket.ticketNumber}
          ticket={ticket}
          onSelect={onSelectTicket}
          getDbmBadge={getDbmBadge}
        />
      ))}
    </div>
  );
}
