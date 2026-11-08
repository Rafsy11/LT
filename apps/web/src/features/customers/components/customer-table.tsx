import React from 'react';
import { Icon } from '@/components/ui/Icon';
import type { CustomerListItem } from '@repo/shared';
import { SignalStrengthBars } from './signal-strength-bars';
import { CustomerTableSkeletonRows } from '@/components/ui/PageSkeleton';

interface CustomerTableProps {
  customers: CustomerListItem[];
  onSelectCustomer: (customer: CustomerListItem) => void;
  loading?: boolean;
}

const CUSTOMER_SKELETON_ROWS = 5;

export function CustomerTable({ customers, onSelectCustomer, loading }: CustomerTableProps) {
  if (loading) {
    return (
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabel Direktori Pelanggan" aria-busy="true">
        <table className="lintasarta-table customer-table">
          <thead>
            <tr>
              <th scope="col">Pelanggan &amp; Nomor SIA</th>
              <th scope="col">Alamat Instalasi</th>
              <th scope="col">Cluster</th>
              <th scope="col">Splitter &amp; Port</th>
              <th scope="col">Status Layanan</th>
              <th scope="col">Redaman Terakhir</th>
              <th scope="col" style={{ textAlign: 'right' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            <CustomerTableSkeletonRows count={CUSTOMER_SKELETON_ROWS} />
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabel Direktori Pelanggan">
      <table className="lintasarta-table customer-table">
        <thead>
          <tr>
            <th scope="col">Pelanggan &amp; Nomor SIA</th>
            <th scope="col">Alamat Instalasi</th>
            <th scope="col">Cluster</th>
            <th scope="col">Splitter &amp; Port</th>
            <th scope="col">Status Layanan</th>
            <th scope="col">Redaman Terakhir</th>
            <th scope="col" style={{ textAlign: 'right' }}>Aksi</th>
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
              onClick={() => onSelectCustomer(c)}
            >
              <td>
                <div className="customer-name-heading">
                  {c.fullName}
                </div>
                <div style={{ marginTop: '2px' }}>
                  <span className="customer-sia-mono">
                    {c.siaNumber}
                  </span>
                </div>
              </td>

              <td style={{ maxWidth: '300px' }}>
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}
                  title={c.address}
                >
                  <span className="customer-street-name">
                    {c.street || c.address.split(',')[0]}
                  </span>
                  <span className="customer-address-sub">
                    <Icon name="pin" size={11} />
                    {c.kelurahan && c.kecamatan
                      ? `Kel. ${c.kelurahan}, Kec. ${c.kecamatan}`
                      : c.address}
                  </span>
                </div>
              </td>

              <td>
                <span className="customer-cluster-name">{c.cluster}</span>
                <span className="customer-cluster-code">
                  {c.clusterCode}
                </span>
              </td>

              <td>
                <div className="customer-splitter-name">{c.splitterCode}</div>
                <div className="customer-port-name">
                  Port #{c.portNumber}
                </div>
              </td>

              <td>
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

              <td>
                <div className="customer-dbm-row">
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
                <span className="customer-dbm-label">
                  {c.currentAttenuation >= -22.0 && c.currentAttenuation <= -15.0
                    ? 'Normal'
                    : c.currentAttenuation < -22.0 && c.currentAttenuation >= -25.0
                      ? 'Waspada'
                      : 'Kritis'}
                </span>
              </td>

              <td style={{ textAlign: 'right' }}>
                <button
                  type="button"
                  className="button customer-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectCustomer(c);
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
        <div className="customer-table-empty">
          Data pelanggan tidak ditemukan untuk filter ini.
        </div>
      )}
    </div>
  );
}
