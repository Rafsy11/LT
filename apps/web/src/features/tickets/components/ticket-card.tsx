import React from 'react';
import { Icon } from '@/components/ui/Icon';
import type { TicketItem } from '../hooks/use-tickets';

export interface TicketCardProps {
  ticket: TicketItem;
  onSelect: (ticket: TicketItem) => void;
  getDbmBadge: (att: number | undefined) => { label: string; cls: string };
}

export function TicketCard({ ticket, onSelect, getDbmBadge }: TicketCardProps) {
  const isCompleted = ticket.status === 'Selesai';
  const isInProgress = ticket.status === 'Dalam proses';
  const isPendingApproval = ticket.status === 'Menunggu verifikasi';
  const displayAttenuation = ticket.pendingSubmission?.attenuationDbm ?? ticket.currentAttenuation;
  const att = getDbmBadge(displayAttenuation);

  const splitter = ticket.pendingSubmission?.splitterCode || ticket.splitterCode || '-';
  const port = ticket.pendingSubmission?.portNumber ?? ticket.portNumber ?? '-';

  return (
    <article
      className="ticket-card"
      onClick={() => onSelect(ticket)}
      tabIndex={0}
      role="button"
      aria-label={`Lihat tiket ${ticket.ticketNumber} untuk ${ticket.customerName}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(ticket);
        }
      }}
    >
      {/* 1. Header: Ticket Number, Type Badge & Status */}
      <header className="ticket-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
          <span className="ticket-number-tag">{ticket.ticketNumber}</span>
          <span
            className={`badge ${
              ticket.ticketType.includes('Pasang') || ticket.ticketType === 'PSB'
                ? 'blue'
                : 'neutral'
            }`}
            style={{ fontSize: '10px', padding: '1px 6px' }}
          >
            {ticket.ticketType}
          </span>
        </div>
        <span
          className={`badge ${
            isCompleted
              ? 'green'
              : isPendingApproval
                ? 'orange'
                : isInProgress
                  ? 'blue'
                  : 'neutral'
          }`}
          style={{ fontSize: '10px', padding: '1px 6px', flexShrink: 0 }}
        >
          {ticket.status}
        </span>
      </header>

      {/* 2. Customer & Cluster Info */}
      <div className="ticket-card-body">
        <div className="ticket-customer-header">
          <h3 className="ticket-customer-name" title={ticket.customerName}>
            {ticket.customerName}
          </h3>
          <div className="ticket-meta-row">
            <code className="ticket-sia-badge">{ticket.siaNumber}</code>
            <span>·</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ticket.cluster}
            </span>
          </div>
        </div>

        {/* 3. High-Density Telemetry & Optical Specs Strip */}
        <div className="ticket-spec-compact-strip">
          <div className="ticket-spec-compact-col">
            <span className="ticket-spec-label">ODP & PORT</span>
            <span className="ticket-spec-value" title={`${splitter} · Port ${port}`}>
              {splitter} · {port !== '-' ? `Port ${port}` : '-'}
            </span>
          </div>
          <div className="ticket-spec-compact-col" style={{ alignItems: 'flex-end', textAlign: 'right' }}>
            <span className="ticket-spec-label">
              {isPendingApproval ? 'UKUR LAPANGAN' : 'REDAMAN OPTIK'}
            </span>
            <span className="ticket-spec-value">
              <span className={att.cls} style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px' }}>
                {att.label}
              </span>
            </span>
          </div>
        </div>

        {/* 4. Optional Context Banner */}
        {isPendingApproval && (
          <div className="ticket-status-callout ticket-callout-pending">
            <Icon name="clock" size={12} />
            <span>Verifikasi hasil ukur lapangan menunggu persetujuan admin</span>
          </div>
        )}

        {ticket.adminNotes && !isPendingApproval && (
          <div className="ticket-status-callout ticket-callout-notes">
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Catatan: {ticket.adminNotes}
            </span>
          </div>
        )}
      </div>

      {/* 5. Footer: Assigned Technician & Action Hint */}
      <footer className="ticket-card-footer">
        <div className="ticket-tech-assigned">
          <span className="tech-avatar-circle">{ticket.techInitials || 'TK'}</span>
          <span className="ticket-tech-name">
            {ticket.assignedTech || 'Belum ditugaskan'}
          </span>
        </div>
        <span className="ticket-action-hint">
          {isPendingApproval ? 'Tinjau' : 'Detail'} <Icon name="arrow" size={12} />
        </span>
      </footer>
    </article>
  );
}
