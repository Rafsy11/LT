'use client';

import React from 'react';
import { dbmTone } from '@repo/shared';

interface TicketDetailModalProps {
  ticket: any | null;
  onClose: () => void;
  onMarkCompleted?: (ticketNumber: string) => void;
}

export function TicketDetailModal({ ticket, onClose, onMarkCompleted }: TicketDetailModalProps) {
  if (!ticket) return null;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-heading">
          <h2>Detail work order</h2>
          <button className="dots" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <span
            className={`badge ${
              ticket.status === 'Selesai'
                ? 'green'
                : ticket.status === 'Menunggu'
                ? 'neutral'
                : 'blue'
            }`}
          >
            {ticket.status}
          </span>
          <h2>{ticket.ticketNumber}</h2>
          <p>
            <b>{ticket.customerName}</b> · SIA {ticket.siaNumber}
          </p>
          <p>
            {ticket.ticketType} · {ticket.cluster}
          </p>
          <p>
            Teknisi yang ditugaskan: <b>{ticket.assignedTech}</b>
          </p>
          <p>
            Redaman optik terakhir:{' '}
            <b className={`${dbmTone(ticket.currentAttenuation)}-text`}>
              {ticket.currentAttenuation} dBm
            </b>
          </p>
          {ticket.adminNotes && (
            <p className="text-gray-500 text-xs mt-2">
              <i>Catatan Admin: {ticket.adminNotes}</i>
            </p>
          )}

          {ticket.status !== 'Selesai' && onMarkCompleted && (
            <button
              className="button primary mt-4"
              onClick={() => {
                onMarkCompleted(ticket.ticketNumber);
                onClose();
              }}
            >
              Tandai Selesai (Demo Eksekusi)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
