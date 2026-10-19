'use client';

import React from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

interface TicketDetailModalProps {
  ticket: any | null;
  onClose: () => void;
  onMarkCompleted?: (ticketNumber: string) => void;
}

export function TicketDetailModal({ ticket, onClose }: TicketDetailModalProps) {
  if (!ticket) return null;

  const isCompleted = ticket.status === 'Selesai';
  const isInProgress = ticket.status === 'Dalam proses';
  const isPending = ticket.status === 'Menunggu';

  const getDbmBadge = (att: number | undefined) => {
    if (att === undefined || att === null) {
      return { label: 'Belum diukur', cls: 'badge gray' };
    }
    if (att >= -22.0 && att <= -15.0) {
      return { label: `${att.toFixed(1)} dBm (Normal)`, cls: 'badge green' };
    }
    if (att < -22.0 && att >= -25.0) {
      return { label: `${att.toFixed(1)} dBm (Warning)`, cls: 'badge yellow' };
    }
    return { label: `${att.toFixed(1)} dBm (Critical)`, cls: 'badge red' };
  };

  const attMeta = getDbmBadge(ticket.currentAttenuation);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
        <div className="panel-heading">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="ticket-number-tag">{ticket.ticketNumber}</span>
            <h2 style={{ margin: 0, fontSize: '18px' }}>Rincian Work Order</h2>
          </div>
          <button className="dots" onClick={onClose} aria-label="Tutup modal">
            ×
          </button>
        </div>

        <div className="modal-body" style={{ padding: '16px 20px 24px' }}>
          {/* Strict Workflow Status Banner (PRD 3.2 & agent.md) */}
          {isPending && (
            <div className="ticket-workflow-banner pending">
              <Icon name="clock" size={16} />
              <div>
                <b>Status: Menunggu Respon Teknisi.</b>
                <div>Tiket penugasan telah dikirim ke perangkat mobile teknisi terkait dan menunggu konfirmasi keberangkatan ke lokasi.</div>
              </div>
            </div>
          )}

          {isInProgress && (
            <div className="ticket-workflow-banner in-progress">
              <Icon name="wrench" size={16} />
              <div>
                <b>Pekerjaan Sedang Berlangsung di Lapangan.</b>
                <div>Sesuai PRD 3.2 & 3.3, penyelesaian tiket wajib dilaporkan langsung oleh teknisi melalui aplikasi mobile dengan foto OPM, validasi GPS anti-fake, dan Idempotency UUID.</div>
              </div>
            </div>
          )}

          {isCompleted && (
            <div className="ticket-workflow-banner completed">
              <Icon name="check" size={16} />
              <div>
                <b>Work Order Telah Selesai & Terverifikasi.</b>
                <div>Laporan hasil ukur redaman telah tercatat permanen di <code>attenuation_histories</code> dan master data pelanggan telah diperbarui.</div>
              </div>
            </div>
          )}

          {/* Detailed Fields Grid */}
          <div className="inspector-grid" style={{ marginTop: '16px', gap: '14px' }}>
            <div className="inspector-field">
              <span className="inspector-field-label">Nama Pelanggan</span>
              <span className="inspector-field-value">{ticket.customerName}</span>
            </div>

            <div className="inspector-field">
              <span className="inspector-field-label">Nomor SIA</span>
              <span className="inspector-field-value">
                <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>
                  {ticket.siaNumber}
                </code>
              </span>
            </div>

            <div className="inspector-field">
              <span className="inspector-field-label">Tipe Pekerjaan</span>
              <span className="inspector-field-value">
                <span className={`badge ${ticket.ticketType.includes('Pasang') || ticket.ticketType === 'PSB' ? 'blue' : 'neutral'}`}>
                  {ticket.ticketType}
                </span>
              </span>
            </div>

            <div className="inspector-field">
              <span className="inspector-field-label">Status Penugasan</span>
              <span className="inspector-field-value">
                <span className={`badge ${isCompleted ? 'green' : isInProgress ? 'blue' : 'neutral'}`}>
                  {ticket.status}
                </span>
              </span>
            </div>

            <div className="inspector-field">
              <span className="inspector-field-label">Wilayah Cluster</span>
              <span className="inspector-field-value">{ticket.cluster}</span>
            </div>

            <div className="inspector-field">
              <span className="inspector-field-label">Teknisi Ditugaskan</span>
              <span className="inspector-field-value">{ticket.assignedTech}</span>
            </div>

            <div className="inspector-field">
              <span className="inspector-field-label">Redaman Optik (OPM)</span>
              <span className="inspector-field-value">
                <span className={attMeta.cls}>{attMeta.label}</span>
              </span>
            </div>

            <div className="inspector-field">
              <span className="inspector-field-label">Waktu Dibuat</span>
              <span className="inspector-field-value" style={{ fontSize: '12px', color: '#64748b' }}>
                {ticket.createdAt ? new Date(ticket.createdAt).toLocaleString('id-ID') : '-'}
              </span>
            </div>
          </div>

          {/* Admin Notes */}
          {ticket.adminNotes && (
            <div style={{ marginTop: '14px' }}>
              <span className="inspector-field-label">Catatan Admin / Instruksi Kerja</span>
              <div className="ticket-notes-box" style={{ marginTop: '4px' }}>
                {ticket.adminNotes}
              </div>
            </div>
          )}

          {/* Quick Context Navigation */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '20px', paddingTop: '14px', borderTop: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
            <Link
              href={`/network?search=${encodeURIComponent(ticket.cluster)}`}
              className="button secondary"
              style={{ fontSize: '11.5px', padding: '7px 12px' }}
            >
              <Icon name="network" size={13} />
              <span>Buka di Master Jaringan</span>
            </Link>

            <Link
              href="/monitoring"
              className="button secondary"
              style={{ fontSize: '11.5px', padding: '7px 12px' }}
            >
              <Icon name="activity" size={13} />
              <span>Pantau di Live Stream</span>
            </Link>

            <button
              type="button"
              className="button primary"
              style={{ fontSize: '11.5px', padding: '7px 16px', marginLeft: 'auto' }}
              onClick={onClose}
            >
              Tutup Rincian
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
