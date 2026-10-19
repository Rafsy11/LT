'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { classifyDbm, dbmTone } from '@repo/shared';
import type { CustomerListItem } from '@/services/customer.service';

interface AttenuationHistoryItem {
  id: string;
  submissionId: string;
  oldAttenuation: number | null;
  newAttenuation: number;
  splitterCode: string;
  portNumber: number;
  photoObjectKey?: string;
  technicianName: string;
  recordedAt: string;
}

interface CustomerDetailModalProps {
  customer: CustomerListItem | null;
  onClose: () => void;
}

export function CustomerDetailModal({ customer, onClose }: CustomerDetailModalProps) {
  const [histories, setHistories] = useState<AttenuationHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!customer?.siaNumber) return;

    setLoadingHistory(true);
    fetch(`/api/v1/admin/customers?sia=${encodeURIComponent(customer.siaNumber)}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data?.histories) {
          setHistories(json.data.histories);
        }
      })
      .catch((err) => console.error('Gagal mengambil riwayat redaman:', err))
      .finally(() => setLoadingHistory(false));
  }, [customer?.siaNumber]);

  if (!customer) return null;

  const tone = dbmTone(customer.currentAttenuation);
  const statusClass =
    customer.status === 'ACTIVE'
      ? 'status-active'
      : customer.status === 'PENDING_INSTALL'
      ? 'status-pending'
      : 'status-neutral';

  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal"
        style={{ maxWidth: '640px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="panel-heading" style={{ borderBottom: '1px solid #e2e8f0', padding: '16px 20px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                background: '#f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0e5b92',
                border: '1px solid #e2e8f0',
                flexShrink: 0,
              }}
            >
              <Icon name="users" size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>
                  {customer.fullName}
                </h2>
                <span
                  style={{
                    fontSize: '11.5px',
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    padding: '2px 7px',
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    color: '#0e5b92',
                  }}
                >
                  {customer.siaNumber}
                </span>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                Cluster: <b>{customer.cluster}</b> ({customer.clusterCode})
              </p>
            </div>
          </div>
          <button className="dots" onClick={onClose} aria-label="Tutup modal" type="button">
            ×
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Service Status & Physical Binding Strip */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              padding: '12px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
            }}
          >
            <div>
              <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Status Layanan
              </div>
              <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    fontSize: '11.5px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: customer.status === 'ACTIVE' ? '#f0fdf4' : '#fffbeb',
                    border: `1px solid ${customer.status === 'ACTIVE' ? '#bbf7d0' : '#fde68a'}`,
                    color: customer.status === 'ACTIVE' ? '#166534' : '#92400e',
                  }}
                >
                  {customer.status}
                </span>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Alokasi Splitter & Port
              </div>
              <div style={{ marginTop: '4px', fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>
                {customer.splitterCode}{' '}
                <span style={{ color: '#0e5b92', fontFamily: 'monospace' }}>
                  Port #{customer.portNumber}
                </span>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Redaman Optik Terakhir
              </div>
              <div style={{ marginTop: '4px', fontSize: '13px', fontWeight: 700, color: tone === 'green' ? '#166534' : tone === 'orange' ? '#b45309' : '#be123c' }}>
                {customer.currentAttenuation.toFixed(1)} dBm{' '}
                <span style={{ fontSize: '10.5px', fontWeight: 500, color: '#64748b' }}>
                  ({classifyDbm(customer.currentAttenuation)})
                </span>
              </div>
            </div>
          </div>

          {/* Alamat & Catatan Lokasi */}
          <div style={{ fontSize: '12px', color: '#475569', lineHeight: '1.5' }}>
            <span style={{ color: '#64748b', fontWeight: 500 }}>Alamat Instalasi: </span>
            {customer.address}
          </div>

          {/* Attenuation History Section (Append-Only per PRD 5.1 & Law 2) */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>
                Riwayat Pengukuran Redaman (10 Laporan Terakhir)
              </div>
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                Immutable Audit Trail (PRD 5.1)
              </span>
            </div>

            {loadingHistory ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                Memuat riwayat redaman...
              </div>
            ) : histories.length === 0 ? (
              <div
                style={{
                  padding: '24px',
                  textAlign: 'center',
                  color: '#94a3b8',
                  fontSize: '12px',
                  background: '#f8fafc',
                  border: '1px dashed #cbd5e1',
                  borderRadius: '6px',
                }}
              >
                Belum ada data pengukuran redaman yang tercatat di <code>attenuation_histories</code>.
              </div>
            ) : (
              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  maxHeight: '260px',
                  overflowY: 'auto',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                      <th style={{ padding: '8px 10px', fontWeight: 600 }}>Waktu Pencatatan</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600 }}>Nilai Redaman</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600 }}>Splitter & Port</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600 }}>Teknisi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {histories.map((h) => {
                      const histTone = dbmTone(h.newAttenuation);
                      return (
                        <tr key={h.id || h.submissionId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 10px', color: '#475569', fontSize: '11px' }}>
                            {new Date(h.recordedAt).toLocaleString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })} WIB
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <span
                              style={{
                                fontWeight: 600,
                                color: histTone === 'green' ? '#166534' : histTone === 'orange' ? '#b45309' : '#be123c',
                              }}
                            >
                              {h.newAttenuation.toFixed(1)} dBm
                            </span>
                            {h.oldAttenuation !== null && (
                              <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: '6px' }}>
                                (sebelumnya: {h.oldAttenuation.toFixed(1)})
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '8px 10px', color: '#334155' }}>
                            {h.splitterCode} <span style={{ color: '#0e5b92', fontFamily: 'monospace' }}>#{h.portNumber}</span>
                          </td>
                          <td style={{ padding: '8px 10px', color: '#475569' }}>
                            {h.technicianName}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer Links */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #e2e8f0',
            background: '#f8fafc',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', gap: '10px' }}>
            <Link
              href={`/tickets?search=${encodeURIComponent(customer.siaNumber)}`}
              style={{
                fontSize: '11.5px',
                color: '#0e5b92',
                textDecoration: 'none',
                fontWeight: 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Icon name="ticket" size={13} />
              Lihat Tiket Terkait
            </Link>
            <span style={{ color: '#cbd5e1' }}>·</span>
            <Link
              href={`/monitoring?search=${encodeURIComponent(customer.siaNumber)}`}
              style={{
                fontSize: '11.5px',
                color: '#0e5b92',
                textDecoration: 'none',
                fontWeight: 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Icon name="activity" size={13} />
              Pantau di Live Stream
            </Link>
          </div>

          <button
            onClick={onClose}
            className="button"
            type="button"
            style={{
              padding: '6px 14px',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              color: '#334155',
              cursor: 'pointer',
            }}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
