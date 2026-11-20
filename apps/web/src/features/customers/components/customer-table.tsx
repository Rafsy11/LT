import React from 'react';
import Link from 'next/link';
import {
  classifyDbm,
  type CustomerListItem,
  STANDARD_ERROR_MESSAGES,
  STANDARD_ACTION_LABELS,
  STANDARD_EMPTY_STATES,
} from '@repo/shared';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { SafeErrorState } from '@/components/ui/SafeErrorState';
import { SignalStrengthBars } from './signal-strength-bars';
import { CustomerTableSkeletonRows } from '@/components/ui/PageSkeleton';

interface CustomerTableProps {
  customers: CustomerListItem[];
  onSelectCustomer: (customer: CustomerListItem) => void;
  loading?: boolean;
  loadError?: string | null;
  onRetry?: () => void;
  hasActiveFilters?: boolean;
  onResetFilters?: () => void;
}

const CUSTOMER_SKELETON_ROWS = 5;

export function CustomerTable({
  customers,
  onSelectCustomer,
  loading,
  loadError,
  onRetry,
  hasActiveFilters = false,
  onResetFilters,
}: CustomerTableProps) {
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

  if (loadError && customers.length === 0) {
    return (
      <div style={{ padding: '24px 16px' }}>
        <SafeErrorState
          error={loadError}
          title="Gagal Memuat Data Pelanggan"
          description={STANDARD_ERROR_MESSAGES.DATA_LOAD_FAILED}
          onRetry={onRetry}
          retryLabel={STANDARD_ACTION_LABELS.RELOAD_DATA}
          variant="panel"
        />
      </div>
    );
  }

  return (
    <>
      {/* Desktop Table View (>=768px) */}
      <div className="table-scroll desktop-customer-table" tabIndex={0} role="region" aria-label="Tabel Direktori Pelanggan">
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
                  <div style={{ marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span className="customer-sia-mono">
                      {c.siaNumber}
                    </span>
                    {c.picName && (
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        PIC: {c.picName}
                      </span>
                    )}
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
                  <div className="customer-splitter-name">{c.splitterCode || 'Belum dipetakan'}</div>
                  <div className="customer-port-name">
                    {c.portNumber != null ? `Port #${c.portNumber}` : 'Tanpa port'}
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
                  {(() => {
                    const effAtt = c.ontAttenuation ?? c.currentAttenuation ?? c.oltAttenuation ?? null;
                    const dbmStatus = classifyDbm(effAtt);
                    const barStatus =
                      dbmStatus === 'Normal'
                        ? 'normal'
                        : dbmStatus === 'Warning'
                          ? 'warning'
                          : dbmStatus === 'Critical'
                            ? 'critical'
                            : 'neutral';
                    return (
                      <>
                        <div className="customer-dbm-row">
                          <span>
                            {effAtt != null ? `${effAtt.toFixed(1)} dBm` : 'Belum diukur'}
                          </span>
                          <SignalStrengthBars status={barStatus} />
                        </div>
                        <span className="customer-dbm-label">
                          {dbmStatus === 'Neutral'
                            ? 'Belum diukur'
                            : dbmStatus === 'Normal'
                              ? 'Bagus'
                              : dbmStatus === 'Warning'
                                ? 'Layak (<= 28 dB)'
                                : 'Jelek (> 28 dB)'}
                        </span>
                      </>
                    );
                  })()}
                </td>

                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'flex-end' }}>
                    <Link
                      href={`/customers/${encodeURIComponent(c.siaNumber)}`}
                      className="button customer-action-btn"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Profil
                    </Link>
                    <button
                      type="button"
                      className="button customer-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCustomer(c);
                      }}
                    >
                      Ringkasan
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {customers.length === 0 && (
          <div style={{ padding: '16px' }}>
            <EmptyState
              icon={hasActiveFilters ? 'search' : 'users'}
              title={
                hasActiveFilters
                  ? STANDARD_EMPTY_STATES.CUSTOMERS.FILTER_TITLE
                  : STANDARD_EMPTY_STATES.CUSTOMERS.EMPTY_TITLE
              }
              description={
                hasActiveFilters
                  ? STANDARD_EMPTY_STATES.CUSTOMERS.FILTER_DESC
                  : STANDARD_EMPTY_STATES.CUSTOMERS.EMPTY_DESC
              }
              actionLabel={hasActiveFilters ? STANDARD_ACTION_LABELS.RESET_FILTER : undefined}
              actionIcon="refresh"
              onAction={hasActiveFilters ? onResetFilters : undefined}
              size="compact"
            />
          </div>
        )}
      </div>

      {/* Mobile Customer Cards View (<768px) */}
      <div className="mobile-customer-cards" aria-label="Daftar Kartu Pelanggan">
        {customers.map((c) => (
          <article
            key={c.siaNumber}
            className="mobile-customer-card"
            tabIndex={0}
            role="button"
            aria-label={`Lihat detail pelanggan ${c.fullName}`}
            onClick={() => onSelectCustomer(c)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectCustomer(c);
              }
            }}
          >
            {/* Top Row: Name, Status */}
            <div className="mobile-customer-top">
              <div style={{ minWidth: 0, flex: 1 }}>
                <h3 className="mobile-customer-name">{c.fullName}</h3>
                <span className="customer-sia-mono">{c.siaNumber}</span>
              </div>
              <span className="customer-status-badge" style={{ flexShrink: 0 }}>
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
            </div>

            {/* Spec Row: Cluster & Splitter/Port */}
            <div className="mobile-customer-spec-strip">
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden' }}>
                <Icon name="network" size={13} />
                <span className="mobile-customer-cluster">{c.cluster || c.clusterCode}</span>
                <span className="mobile-customer-sep">·</span>
                <span className="mobile-customer-port">
                  {c.splitterCode ? `${c.splitterCode} (#${c.portNumber ?? '-'})` : 'Belum dipetakan'}
                </span>
              </div>
              <div className="customer-dbm-row" style={{ flexShrink: 0 }}>
                <span style={{ fontSize: '11px', fontWeight: 600 }}>
                  {c.currentAttenuation != null ? `${c.currentAttenuation.toFixed(1)} dBm` : '-'}
                </span>
                <SignalStrengthBars
                  status={(() => {
                    const s = classifyDbm(c.ontAttenuation ?? c.currentAttenuation);
                    return s === 'Normal'
                      ? 'normal'
                      : s === 'Warning'
                        ? 'warning'
                        : s === 'Critical'
                          ? 'critical'
                          : 'neutral';
                  })()}
                />
              </div>
            </div>

            {/* Address Row & Detail Action */}
            <div className="mobile-customer-bottom">
              <div className="mobile-customer-address" title={c.address}>
                <Icon name="pin" size={11} />
                <span>{c.street || c.address.split(',')[0]}</span>
              </div>
              <span className="mobile-customer-arrow">
                Detail <Icon name="arrowRight" size={12} />
              </span>
            </div>
          </article>
        ))}

        {customers.length === 0 && (
          <EmptyState
            icon={hasActiveFilters ? 'search' : 'users'}
            title={
              hasActiveFilters
                ? STANDARD_EMPTY_STATES.CUSTOMERS.FILTER_TITLE
                : STANDARD_EMPTY_STATES.CUSTOMERS.EMPTY_TITLE
            }
            description={
              hasActiveFilters
                ? STANDARD_EMPTY_STATES.CUSTOMERS.FILTER_DESC
                : STANDARD_EMPTY_STATES.CUSTOMERS.EMPTY_DESC
            }
            actionLabel={hasActiveFilters ? STANDARD_ACTION_LABELS.RESET_FILTER : undefined}
            actionIcon="refresh"
            onAction={hasActiveFilters ? onResetFilters : undefined}
          />
        )}
      </div>
    </>
  );
}
