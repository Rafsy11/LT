import React from 'react';
import { Icon } from '@/components/ui/Icon';
import type { CustomerListItem } from '@repo/shared';
import { SignalStrengthBars } from './signal-strength-bars';

interface CustomerTableProps {
  customers: CustomerListItem[];
  onSelectCustomer: (customer: CustomerListItem) => void;
}

export function CustomerTable({ customers, onSelectCustomer }: CustomerTableProps) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabel Direktori Pelanggan">
      <table
        style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}
      >
        <thead>
          <tr
            style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}
          >
            <th scope="col" style={{ padding: '10px 14px', fontWeight: 600 }}>Pelanggan &amp; Nomor SIA</th>
            <th scope="col" style={{ padding: '10px 14px', fontWeight: 600 }}>Alamat Instalasi</th>
            <th scope="col" style={{ padding: '10px 14px', fontWeight: 600 }}>Cluster</th>
            <th scope="col" style={{ padding: '10px 14px', fontWeight: 600 }}>Splitter &amp; Port</th>
            <th scope="col" style={{ padding: '10px 14px', fontWeight: 600 }}>Status Layanan</th>
            <th scope="col" style={{ padding: '10px 14px', fontWeight: 600 }}>Redaman Terakhir</th>
            <th scope="col" style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'right' }}>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr
              key={c.siaNumber}
              tabIndex={0}
              role="button"
              aria-label={`Lihat detail pelanggan ${c.fullName}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectCustomer(c);
                }
              }}
              style={{
                borderBottom: '1px solid #f1f5f9',
                transition: 'background 0.15s ease',
                cursor: 'pointer',
              }}
              onClick={() => onSelectCustomer(c)}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <td style={{ padding: '12px 14px' }}>
                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '13px' }}>
                  {c.fullName}
                </div>
                <div style={{ marginTop: '2px' }}>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '1px 6px',
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                      color: '#0e5b92',
                    }}
                  >
                    {c.siaNumber}
                  </span>
                </div>
              </td>

              <td style={{ padding: '12px 14px', color: '#475569', maxWidth: '300px' }}>
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}
                  title={c.address}
                >
                  <span
                    style={{
                      fontWeight: 500,
                      color: '#0f172a',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {c.street || c.address.split(',')[0]}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      color: '#64748b',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                    }}
                  >
                    <Icon name="pin" size={11} />
                    {c.kelurahan && c.kecamatan
                      ? `Kel. ${c.kelurahan}, Kec. ${c.kecamatan}`
                      : c.address}
                  </span>
                </div>
              </td>

              <td style={{ padding: '12px 14px' }}>
                <span style={{ fontWeight: 500, color: '#334155' }}>{c.cluster}</span>
                <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block' }}>
                  {c.clusterCode}
                </span>
              </td>

              <td style={{ padding: '12px 14px' }}>
                <div style={{ fontWeight: 600, color: '#0f172a' }}>{c.splitterCode}</div>
                <div style={{ fontSize: '11px', color: '#0e5b92', fontFamily: 'monospace' }}>
                  Port #{c.portNumber}
                </div>
              </td>

              <td style={{ padding: '12px 14px' }}>
                <span className="customer-status-badge">
                  <span
                    className={`customer-status-dot ${
                      c.status === 'ACTIVE'
                        ? 'active'
                        : c.status === 'PENDING_INSTALL'
                          ? 'pending'
                          : c.status === 'ISOLATED'
                            ? 'isolated'
                            : 'inactive'
                    }`}
                  />
                  <span>
                    {c.status === 'ACTIVE'
                      ? 'Aktif'
                      : c.status === 'PENDING_INSTALL'
                        ? 'Menunggu PSB'
                        : c.status === 'ISOLATED'
                          ? 'Terisolir'
                          : 'Nonaktif'}
                  </span>
                </span>
              </td>

              <td style={{ padding: '12px 14px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    fontWeight: 600,
                    fontSize: '12.5px',
                    color: '#0f172a',
                  }}
                >
                  <span>{c.currentAttenuation.toFixed(1)} dBm</span>
                  <SignalStrengthBars
                    status={
                      c.currentAttenuation >= -22.0 && c.currentAttenuation <= -15.0
                        ? 'normal'
                        : c.currentAttenuation < -22.0 && c.currentAttenuation >= -25.0
                          ? 'warning'
                          : 'critical'
                    }
                  />
                </div>
                <span style={{ fontSize: '10.5px', color: '#64748b' }}>
                  {c.currentAttenuation >= -22.0 && c.currentAttenuation <= -15.0
                    ? 'Normal'
                    : c.currentAttenuation < -22.0 && c.currentAttenuation >= -25.0
                      ? 'Waspada'
                      : 'Kritis'}
                </span>
              </td>

              <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                <button
                  type="button"
                  className="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectCustomer(c);
                  }}
                  style={{
                    padding: '5px 10px',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: '#334155',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  Detail SIA
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {customers.length === 0 && (
        <div
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            color: '#94a3b8',
            fontSize: '13px',
            background: '#f8fafc',
            borderRadius: '8px',
            border: '1px dashed #cbd5e1',
            margin: '16px 0',
          }}
        >
          Data pelanggan tidak ditemukan untuk filter ini.
        </div>
      )}
    </div>
  );
}
