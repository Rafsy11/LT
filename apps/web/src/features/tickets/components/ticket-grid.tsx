import React from 'react';
import {
  STANDARD_ERROR_MESSAGES,
  STANDARD_ACTION_LABELS,
  STANDARD_EMPTY_STATES,
} from '@repo/shared';
import type { TicketItem } from '../hooks/use-tickets';
import { TicketCard } from './ticket-card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SafeErrorState } from '@/components/ui/SafeErrorState';
import { TicketCardSkeleton } from '@/components/ui/PageSkeleton';

export interface TicketGridProps {
  loading: boolean;
  loadError?: string | null;
  onRetry?: () => void;
  tickets: TicketItem[];
  onSelectTicket: (ticket: TicketItem) => void;
  getDbmBadge: (att: number | undefined) => { label: string; cls: string };
  hasActiveFilters?: boolean;
  onResetFilters?: () => void;
  canCreateTicket?: boolean;
  onCreateTicket?: () => void;
}

const TICKET_SKELETON_COUNT = 6;

export function TicketGrid({
  loading,
  loadError,
  onRetry,
  tickets,
  onSelectTicket,
  getDbmBadge,
  hasActiveFilters = false,
  onResetFilters,
  canCreateTicket = false,
  onCreateTicket,
}: TicketGridProps) {
  if (loading) {
    return (
      <section className="tickets-cards-grid" aria-label="Memuat Kartu Tiket" aria-busy="true">
        {Array.from({ length: TICKET_SKELETON_COUNT }).map((_, i) => (
          <TicketCardSkeleton key={i} />
        ))}
      </section>
    );
  }

  if (loadError && tickets.length === 0) {
    return (
      <SafeErrorState
        error={loadError}
        title="Gagal Memuat Data Tiket"
        description={STANDARD_ERROR_MESSAGES.DATA_LOAD_FAILED}
        onRetry={onRetry}
        retryLabel={STANDARD_ACTION_LABELS.RELOAD_DATA}
        variant="panel"
      />
    );
  }

  if (tickets.length === 0) {
    return (
      <EmptyState
        icon={hasActiveFilters ? 'search' : 'ticket'}
        title={
          hasActiveFilters
            ? STANDARD_EMPTY_STATES.TICKETS.FILTER_TITLE
            : STANDARD_EMPTY_STATES.TICKETS.EMPTY_TITLE
        }
        description={
          hasActiveFilters
            ? STANDARD_EMPTY_STATES.TICKETS.FILTER_DESC
            : STANDARD_EMPTY_STATES.TICKETS.EMPTY_DESC
        }
        actionLabel={
          hasActiveFilters
            ? STANDARD_ACTION_LABELS.RESET_FILTER
            : canCreateTicket && onCreateTicket
              ? STANDARD_ACTION_LABELS.CREATE_TICKET
              : undefined
        }
        actionIcon={hasActiveFilters ? 'refresh' : 'plus'}
        actionVariant={hasActiveFilters ? 'secondary' : 'primary'}
        onAction={hasActiveFilters ? onResetFilters : onCreateTicket}
      />
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
