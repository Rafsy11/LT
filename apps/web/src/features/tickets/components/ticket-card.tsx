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
      {/* Header Row */}
      <header className="ticket-card-header">
        <span className="ticket-number-tag">{ticket.ticketNumber}</span>
        <div className="ticket-badges-group">
          <span
            className={`badge ${
              ticket.ticketType.includes('Pasang') || ticket.ticketType === 'PSB'
                ? 'blue'
                : 'neutral'
            }`}
            style={{ fontSize: '10.5px' }}
          >
            {ticket.ticketType}
          </span>
          <span
            className={`badge ${isCompleted ? 'green' : isInProgress ? 'blue' : 'neutral'}`}
            style={{ fontSize: '10.5px' }}
          >
            {ticket.status}
          </span>
        </div>
      </header>

      {/* Customer Details */}
      <div className="ticket-card-body">
        <h3 className="ticket-customer-name">{ticket.customerName}</h3>
        <div className="ticket-meta-row">
          <code
            style={{
              background: '#f1f5f9',
              padding: '1px 5px',
              borderRadius: '4px',
              fontSize: '11px',
            }}
          >
            {ticket.siaNumber}
          </code>
          <span>·</span>
          <span>{ticket.cluster}</span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '2px',
          }}
        >
          <span style={{ fontSize: '11px', color: '#64748b' }}>
            {isPendingApproval ? 'Hasil Ukur Diajukan:' : 'Redaman:'}
          </span>
          <span className={att.cls} style={{ fontSize: '10.5px', padding: '2px 6px' }}>
            {att.label}
          </span>
        </div>

        {/* Super Admin Review Callout on Card without AI Slop Icons and Yellow Colors */}
        {isPendingApproval && (
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              padding: '8px 10px',
              fontSize: '11px',
              color: '#334155',
              marginTop: '4px',
            }}
          >
            <div style={{ fontWeight: 600, color: '#0f172a' }}>Verifikasi Persetujuan Admin</div>
            <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
              ODP:{' '}
              <strong style={{ color: '#0f172a' }}>
                {ticket.pendingSubmission?.splitterCode || ticket.splitterCode || 'ODP'}
              </strong>{' '}
              · Port:{' '}
              <strong style={{ color: '#0f172a' }}>
                {ticket.pendingSubmission?.portNumber || ticket.portNumber || 1}
              </strong>
            </div>
          </div>
        )}

        {ticket.adminNotes && !isPendingApproval && (
          <div className="ticket-notes-box">{ticket.adminNotes}</div>
        )}
      </div>

      {/* Footer Row */}
      <footer className="ticket-card-footer">
        <div className="ticket-tech-assigned">
          <span className="tech-avatar-circle">{ticket.techInitials || 'TK'}</span>
          <span>{ticket.assignedTech}</span>
        </div>
        <span className="ticket-action-hint">
          {isPendingApproval ? 'Tinjau' : 'Detail'} <Icon name="arrow" size={12} />
        </span>
      </footer>
    </article>
  );
}
