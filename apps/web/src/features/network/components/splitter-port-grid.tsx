'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/providers';
import {
  ATTENUATION_THRESHOLDS,
  isAttenuationBad,
  type ClusterListItem,
  type SplitterPortState,
  type CreateTicketInput,
} from '@repo/shared';
import { SignalStrengthBars } from '@/features/customers';
import {
  buildOdpInspectionReportRows,
  DEFAULT_EXCEL_CSV_DELIMITER,
  downloadBlobFile,
  escapeCsvRowsAsync,
  EXCEL_CSV_LINE_ENDING,
  ODP_INSPECTION_REPORT_HEADERS,
} from '@/lib/csv';
import { normalizeAppError } from '@/lib/error-normalizer';
import type {
  AttenuationMeta,
  OdpHistoryLogItem,
  PortAllocationFilter,
} from '../hooks/use-network';

export interface SplitterPortGridProps {
  activeSplitter: ClusterListItem;
  activeSplitterFilteredPorts: SplitterPortState[];
  portFilter: PortAllocationFilter;
  setPortFilter: (filter: PortAllocationFilter) => void;
  expandedPortNum: number | null;
  setExpandedPortNum: React.Dispatch<React.SetStateAction<number | null>>;
  getAttenuationMeta: (att: number | undefined) => AttenuationMeta;
  latestHistory: OdpHistoryLogItem | null;
  showSuccess: (msg: string) => void;
  setTicketModalInitial: (initial: Partial<CreateTicketInput>) => void;
  setTicketModalOpen: (open: boolean) => void;
  canCreateTicket: boolean;
}

function formatPortCode(portNumber: number): string {
  return `P${String(portNumber).padStart(2, '0')}`;
}

function resolveInspectionSummary(
  port: SplitterPortState,
  attMeta: AttenuationMeta,
  goodLimitDb: number,
): { label: string; cls: string } {
  if (!port.isOccupied) {
    return { label: 'Port Siap Alokasi PSB', cls: 'is-info' };
  }
  if (attMeta.status === 'critical') {
    return { label: `Redaman Buruk (> ${goodLimitDb} dB)`, cls: 'is-critical' };
  }
  if (attMeta.status === 'warning') {
    return { label: `Mendekati Batas (<= ${goodLimitDb} dB)`, cls: 'is-warning' };
  }
  if (attMeta.status === 'normal') {
    return { label: `Normal (<= ${goodLimitDb} dB)`, cls: 'is-ok' };
  }
  return { label: 'Belum Diukur OPM/OLT', cls: 'is-muted' };
}

/**
 * Consolidated Port & Inspection workspace for an active ODP splitter.
 * Combines a clickable visual port strip (P01..P16/P32), telemetry summary + CSV export,
 * desktop port table, and mobile reflow card list with direct links to `/customers/[sia]`.
 *
 * @param props - Active splitter data, filtered ports, filter controls, and ticket modal callbacks.
 * @returns Rendered Port & Inspection panel.
 * @example
 * <SplitterPortGrid activeSplitter={activeSplitter} ... />
 */
export function SplitterPortGrid({
  activeSplitter,
  activeSplitterFilteredPorts,
  portFilter,
  setPortFilter,
  expandedPortNum,
  setExpandedPortNum,
  getAttenuationMeta,
  latestHistory,
  showSuccess,
  setTicketModalInitial,
  setTicketModalOpen,
  canCreateTicket,
}: SplitterPortGridProps) {
  const goodLimitDb = ATTENUATION_THRESHOLDS.GOOD_MAX_LOSS_DB;
  const { showError } = useToast();
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  const occupiedPorts = activeSplitter.ports.filter((p) => p.isOccupied);
  const availablePortsCount = activeSplitter.ports.length - occupiedPorts.length;
  const measuredPorts = occupiedPorts.filter(
    (p) => typeof p.attenuation === 'number' && p.attenuation !== 0,
  );
  const criticalPortsCount = measuredPorts.filter((p) => isAttenuationBad(p.attenuation)).length;
  const avgAttenuation =
    measuredPorts.length > 0
      ? measuredPorts.reduce((sum, p) => sum + (p.attenuation ?? 0), 0) / measuredPorts.length
      : null;

  const handleDownloadInspectionCsv = async () => {
    try {
      const rows = buildOdpInspectionReportRows(activeSplitter);
      const csvContent = await escapeCsvRowsAsync(ODP_INSPECTION_REPORT_HEADERS, rows, {
        delimiter: DEFAULT_EXCEL_CSV_DELIMITER,
        includeBom: true,
        lineEnding: EXCEL_CSV_LINE_ENDING,
      });
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      downloadBlobFile(
        blob,
        `inspeksi-${activeSplitter.splitterCode}-${new Date().toISOString().slice(0, 10)}.csv`,
      );
      showSuccess(`Laporan inspeksi teknis ${activeSplitter.splitterCode} diunduh (CSV).`);
    } catch (err: unknown) {
      showError(
        normalizeAppError(err, {
          fallbackMessage: 'Gagal membuat berkas inspeksi CSV.',
        }),
      );
    }
  };

  const handleDownloadInspectionExcel = async () => {
    setIsExportingExcel(true);
    try {
      const params = new URLSearchParams({
        type: 'odp',
        splitterCode: activeSplitter.splitterCode,
      });
      const res = await fetch(`/api/v1/admin/reports/export?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
      });
      if (!res.ok) {
        let payload: unknown = null;
        try {
          payload = await res.json();
        } catch {
          payload = null;
        }
        const errorObj =
          payload && typeof payload === 'object' && 'error' in payload
            ? (payload as { error: unknown }).error
            : { statusCode: res.status };
        throw normalizeAppError(errorObj, {
          fallbackMessage: 'Gagal mengunduh laporan inspeksi Excel.',
        });
      }

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') || '';
      const matchedName = disposition.match(/filename="([^"]+)"/i)?.[1];
      const filename =
        matchedName ||
        `inspeksi-${activeSplitter.splitterCode}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      downloadBlobFile(blob, filename);
      showSuccess(`Laporan inspeksi teknis ${activeSplitter.splitterCode} diunduh (Excel .xlsx).`);
    } catch (err: unknown) {
      showError(
        normalizeAppError(err, {
          fallbackMessage: 'Gagal mengunduh laporan inspeksi Excel (.xlsx).',
        }),
      );
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleSelectPortTile = (portNumber: number) => {
    const isVisibleInFilter = activeSplitterFilteredPorts.some((p) => p.portNumber === portNumber);
    if (!isVisibleInFilter) {
      setPortFilter('ALL');
    }
    setExpandedPortNum((prev) => (prev === portNumber ? null : portNumber));
  };

  const openTicketForPort = (port: SplitterPortState) => {
    setTicketModalInitial({
      ticketType: port.isOccupied ? 'MAINTENANCE' : 'PSB',
      clusterCode: activeSplitter.name,
      customerName: port.customerName || '',
      siaNumber: port.siaNumber || '',
      adminNotes: port.isOccupied
        ? `Maintenance redaman pada ${activeSplitter.splitterCode} Port ${port.portNumber} (${port.attenuation ?? 'belum diukur'} dBm)`
        : `Penugasan Pasang Baru pada ${activeSplitter.splitterCode} Port ${port.portNumber}`,
    });
    setTicketModalOpen(true);
  };

  return (
    <section className="odp-ports-workspace" aria-label="Daftar Port dan Inspeksi ODP">
      {/* Compact Inspection Telemetry & Action Strip */}
      <div className="odp-inspection-strip">
        <div className="odp-inspection-metrics">
          <div className="odp-insp-metric">
            <span className="odp-insp-metric-label">Rata-rata Redaman</span>
            <strong className="odp-insp-metric-val">
              {avgAttenuation !== null ? `${avgAttenuation.toFixed(1)} dBm` : '-'}
            </strong>
          </div>
          <div className="odp-insp-metric">
            <span className="odp-insp-metric-label">Port &gt; {goodLimitDb} dB</span>
            <strong
              className={`odp-insp-metric-val ${criticalPortsCount > 0 ? 'is-danger' : 'is-ok'}`}
            >
              {criticalPortsCount} port
            </strong>
          </div>
          <div className="odp-insp-metric odp-insp-metric-wide">
            <span className="odp-insp-metric-label">Aktivitas Terakhir</span>
            <span className="odp-insp-metric-sub">
              {latestHistory
                ? `${latestHistory.date} · ${latestHistory.technician} (${latestHistory.ticketNumber})`
                : 'Belum ada catatan inspeksi tersimpan'}
            </span>
          </div>
        </div>

        <div className="odp-inspection-actions">
          <button
            type="button"
            className="btn-inspect-detail-action"
            onClick={() => void handleDownloadInspectionExcel()}
            disabled={isExportingExcel}
          >
            <Icon
              name={isExportingExcel ? 'refresh' : 'fileText'}
              size={13}
              className={isExportingExcel ? 'icon-spin' : ''}
            />
            <span>{isExportingExcel ? 'Menyiapkan...' : 'Unduh Excel'}</span>
          </button>

          <button
            type="button"
            className="btn-inspect-detail-action"
            onClick={() => void handleDownloadInspectionCsv()}
          >
            <Icon name="download" size={13} />
            <span>Unduh CSV</span>
          </button>

          {canCreateTicket && (
            <button
              type="button"
              className="btn-inspect-ticket-action"
              onClick={() => {
                setTicketModalInitial({
                  ticketType: 'MAINTENANCE',
                  clusterCode: activeSplitter.name,
                  adminNotes: `Inspeksi berkala dan pengukuran redaman pada ${activeSplitter.splitterCode}`,
                });
                setTicketModalOpen(true);
              }}
            >
              <Icon name="plus" size={13} />
              <span>Jadwalkan Inspeksi</span>
            </button>
          )}
        </div>
      </div>

      {/* Interactive Visual Port Strip (P01..P16 / P32) */}
      <div className="odp-visual-strip-box">
        <div className="odp-visual-strip-head">
          <span className="odp-visual-strip-title">Peta Slot Port Splitter</span>
          <div className="odp-visual-strip-legend" aria-hidden="true">
            <span className="odp-legend-key">
              <i className="odp-slot-dot is-available" /> Siap PSB
            </span>
            <span className="odp-legend-key">
              <i className="odp-slot-dot is-normal" /> Normal
            </span>
            <span className="odp-legend-key">
              <i className="odp-slot-dot is-warning" /> Batas
            </span>
            <span className="odp-legend-key">
              <i className="odp-slot-dot is-critical" /> &gt;{goodLimitDb} dB
            </span>
          </div>
        </div>
        <div className="odp-visual-port-strip" role="group" aria-label="Pilih slot port ODP">
          {activeSplitter.ports.map((port) => {
            const attMeta = getAttenuationMeta(port.attenuation);
            const isSelected = expandedPortNum === port.portNumber;
            const slotTone = !port.isOccupied
              ? 'is-available'
              : attMeta.status === 'critical'
                ? 'is-critical'
                : attMeta.status === 'warning'
                  ? 'is-warning'
                  : attMeta.status === 'normal'
                    ? 'is-normal'
                    : 'is-occupied';

            return (
              <button
                key={port.portNumber}
                type="button"
                aria-pressed={isSelected}
                className={`odp-port-slot-chip ${slotTone} ${isSelected ? 'is-selected' : ''}`}
                onClick={() => handleSelectPortTile(port.portNumber)}
                title={`${formatPortCode(port.portNumber)}: ${
                  port.isOccupied
                    ? `${port.customerName || 'Terisi'}${
                        port.attenuation != null ? ` (${port.attenuation.toFixed(1)} dBm)` : ''
                      }`
                    : 'Siap PSB'
                }`}
              >
                <span className="odp-port-slot-num">{formatPortCode(port.portNumber)}</span>
                <span className="odp-port-slot-sub">
                  {port.isOccupied
                    ? port.attenuation != null && port.attenuation !== 0
                      ? `${port.attenuation.toFixed(0)}dB`
                      : 'Aktif'
                    : 'PSB'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Port Table + Mobile Cards Container */}
      <div className="odp-table-wrapper">
        <header className="odp-port-filter-bar">
          <span className="odp-port-filter-label">Filter Port:</span>
          <nav aria-label="Filter status port" className="odp-port-filter-nav">
            <button
              type="button"
              onClick={() => setPortFilter('ALL')}
              className={`odp-port-filter-btn ${portFilter === 'ALL' ? 'active' : ''}`}
            >
              Semua ({activeSplitter.ports.length})
            </button>
            <button
              type="button"
              onClick={() => setPortFilter('OCCUPIED')}
              className={`odp-port-filter-btn ${portFilter === 'OCCUPIED' ? 'active' : ''}`}
            >
              Terpakai ({occupiedPorts.length})
            </button>
            <button
              type="button"
              onClick={() => setPortFilter('AVAILABLE')}
              className={`odp-port-filter-btn ${portFilter === 'AVAILABLE' ? 'active' : ''}`}
            >
              Siap PSB ({availablePortsCount})
            </button>
            {criticalPortsCount > 0 && (
              <button
                type="button"
                onClick={() => setPortFilter('CRITICAL')}
                className={`odp-port-filter-btn is-crit-filter ${portFilter === 'CRITICAL' ? 'active' : ''}`}
              >
                Kritis &gt; {goodLimitDb} dB ({criticalPortsCount})
              </button>
            )}
          </nav>
        </header>

        {/* Desktop Table */}
        <div
          className="odp-desktop-table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Tabel port splitter"
        >
          <table className="odp-clean-table">
            <thead>
              <tr>
                <th scope="col" style={{ width: '36px' }}>
                  <span className="sr-only">Perluas</span>
                </th>
                <th scope="col">PORT</th>
                <th scope="col">ALOKASI</th>
                <th scope="col">PELANGGAN / SIA</th>
                <th scope="col">REDAMAN (dBm)</th>
                <th scope="col">STATUS</th>
                <th scope="col">AKTIVITAS TERAKHIR</th>
                <th scope="col" style={{ textAlign: 'right', paddingRight: '16px' }}>
                  AKSI
                </th>
              </tr>
            </thead>
            <tbody>
              {activeSplitterFilteredPorts.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '16px' }}>
                    <EmptyState
                      icon="network"
                      title="Tidak ada port pada kategori ini"
                      description="Tidak ada port splitter yang sesuai dengan status alokasi atau redaman yang dipilih."
                      actionLabel={portFilter !== 'ALL' ? 'Tampilkan Semua Port' : undefined}
                      actionIcon="refresh"
                      onAction={portFilter !== 'ALL' ? () => setPortFilter('ALL') : undefined}
                      size="compact"
                    />
                  </td>
                </tr>
              ) : (
                activeSplitterFilteredPorts.map((port) => {
                  const isExpanded = expandedPortNum === port.portNumber;
                  const isOccupied = port.isOccupied;
                  const attMeta = getAttenuationMeta(port.attenuation);
                  const inspSummary = resolveInspectionSummary(port, attMeta, goodLimitDb);

                  return (
                    <React.Fragment key={port.portNumber}>
                      <tr
                        className={`odp-table-data-row ${isExpanded ? 'is-row-selected' : ''}`}
                        tabIndex={0}
                        role="button"
                        aria-expanded={isExpanded}
                        aria-label={`Port ${formatPortCode(port.portNumber)}, ${isOccupied ? port.customerName || 'Terisi' : 'Siap PSB'}`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setExpandedPortNum((prev) =>
                              prev === port.portNumber ? null : port.portNumber,
                            );
                          }
                        }}
                        onClick={() =>
                          setExpandedPortNum((prev) =>
                            prev === port.portNumber ? null : port.portNumber,
                          )
                        }
                        style={{ cursor: 'pointer' }}
                      >
                        <td className="ui-text-muted" style={{ textAlign: 'center', fontSize: '13px' }}>
                          <span aria-hidden="true">{isExpanded ? '⌄' : '›'}</span>
                        </td>

                        <td>
                          <span className="port-id-chip-clean">
                            {formatPortCode(port.portNumber)}
                          </span>
                        </td>

                        <td>
                          <span
                            className={`port-alokasi-dot-label ${isOccupied ? 'occupied' : 'available'}`}
                          >
                            {isOccupied ? 'Terisi' : 'Siap PSB'}
                          </span>
                        </td>

                        <td>
                          {isOccupied ? (
                            <div>
                              <div className="customer-name-bold">
                                {port.customerName || 'Pelanggan'}
                              </div>
                              <div className="customer-sia-code">{port.siaNumber || '-'}</div>
                            </div>
                          ) : (
                            <span className="ui-text-muted">-</span>
                          )}
                        </td>

                        <td>
                          {isOccupied && port.attenuation != null && port.attenuation !== 0 ? (
                            <span className="redaman-value-clean">
                              <span>{port.attenuation.toFixed(1)} dBm</span>
                              <SignalStrengthBars status={attMeta.status} />
                            </span>
                          ) : (
                            <span className="ui-text-muted">-</span>
                          )}
                        </td>

                        <td>
                          {isOccupied ? (
                            <span
                              className={`odp-port-status-badge is-${attMeta.status}`}
                            >
                              <Icon
                                name={
                                  attMeta.status === 'critical' || attMeta.status === 'warning'
                                    ? 'alert'
                                    : attMeta.status === 'normal'
                                      ? 'check'
                                      : 'clock'
                                }
                                size={11}
                              />
                              <span>
                                {attMeta.status === 'normal'
                                  ? 'Normal'
                                  : attMeta.status === 'warning'
                                    ? 'Batas'
                                    : attMeta.status === 'critical'
                                      ? 'Kritis'
                                      : 'Belum diukur'}
                              </span>
                            </span>
                          ) : (
                            <span className="odp-port-status-badge is-psb">
                              <Icon name="check" size={11} />
                              <span>Siap PSB</span>
                            </span>
                          )}
                        </td>

                        <td>
                          {port.lastActivity ? (
                            <div className="activity-cell-clean">
                              <span className="activity-title-clean">
                                {port.lastActivity.type === 'MAINTENANCE'
                                  ? 'Maintenance'
                                  : port.lastActivity.type === 'PEMASANGAN'
                                    ? 'Pemasangan'
                                    : 'Penarikan'}
                              </span>
                              <span className="activity-sub-clean">
                                {port.lastActivity.technician} · {port.lastActivity.date}
                              </span>
                            </div>
                          ) : (
                            <span className="ui-text-muted">-</span>
                          )}
                        </td>

                        <td
                          style={{ textAlign: 'right', paddingRight: '16px' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="action-detail-link"
                            onClick={() =>
                              setExpandedPortNum((prev) =>
                                prev === port.portNumber ? null : port.portNumber,
                              )
                            }
                          >
                            {isExpanded ? 'Tutup' : 'Detail'}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="odp-table-expanded-row">
                          <td colSpan={8} style={{ padding: '8px 16px 14px 16px' }}>
                            <article className="inline-inspect-box-reference">
                              <header className="inline-inspect-box-title">
                                Detail Inspeksi Port {formatPortCode(port.portNumber)}
                              </header>

                              <div className="inline-inspect-ref-grid">
                                <div className="inline-inspect-col">
                                  <span className="inline-inspect-col-label">Status Redaman</span>
                                  <span className={`inline-inspect-col-val ${inspSummary.cls}`}>
                                    {inspSummary.label}
                                  </span>
                                </div>

                                <div className="inline-inspect-col">
                                  <span className="inline-inspect-col-label">Dokumentasi Tiket</span>
                                  <span className="inline-inspect-col-val inline-inspect-doc">
                                    <Icon name="image" size={13} />
                                    <span>
                                      {port.lastActivity?.ticketNumber
                                        ? `Tiket ${port.lastActivity.ticketNumber}`
                                        : port.lastActivity
                                          ? 'Tercatat di riwayat'
                                          : 'Belum tercatat'}
                                    </span>
                                  </span>
                                </div>

                                <div className="inline-inspect-col">
                                  <span className="inline-inspect-col-label">Catatan Lapangan</span>
                                  <span className="inline-inspect-col-val is-body-note">
                                    {port.lastActivity?.notes ||
                                      (isOccupied
                                        ? 'Port aktif teralokasi pada pelanggan.'
                                        : 'Port kosong, siap untuk aktivasi PSB baru.')}
                                  </span>
                                </div>

                                <div className="inline-inspect-col inline-inspect-actions-col">
                                  <nav
                                    aria-label={`Aksi port ${formatPortCode(port.portNumber)}`}
                                    className="inline-inspect-actions-nav"
                                  >
                                    {isOccupied && port.siaNumber ? (
                                      <Link
                                        href={`/customers/${encodeURIComponent(port.siaNumber)}`}
                                        className="btn-inspect-detail-action"
                                      >
                                        <Icon name="externalLink" size={12} />
                                        <span>Profil Pelanggan</span>
                                      </Link>
                                    ) : null}

                                    {canCreateTicket && (
                                      <button
                                        type="button"
                                        className="btn-inspect-ticket-action"
                                        onClick={() => openTicketForPort(port)}
                                      >
                                        <Icon name="plus" size={12} />
                                        <span>
                                          {isOccupied ? 'Tiket Maintenance' : 'Tiket PSB'}
                                        </span>
                                      </button>
                                    )}
                                  </nav>
                                </div>
                              </div>
                            </article>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Reflow Card List (< 768px, zero horizontal scroll) */}
        <div className="odp-mobile-port-cards" role="list" aria-label="Daftar port splitter mobile">
          {activeSplitterFilteredPorts.length === 0 ? (
            <EmptyState
              icon="network"
              title="Tidak ada port pada kategori ini"
              description="Tidak ada port splitter yang sesuai dengan status alokasi atau redaman yang dipilih."
              actionLabel={portFilter !== 'ALL' ? 'Tampilkan Semua Port' : undefined}
              actionIcon="refresh"
              onAction={portFilter !== 'ALL' ? () => setPortFilter('ALL') : undefined}
              size="compact"
            />
          ) : (
            activeSplitterFilteredPorts.map((port) => {
              const isExpanded = expandedPortNum === port.portNumber;
              const isOccupied = port.isOccupied;
              const attMeta = getAttenuationMeta(port.attenuation);
              const inspSummary = resolveInspectionSummary(port, attMeta, goodLimitDb);

              return (
                <article
                  key={port.portNumber}
                  role="listitem"
                  className={`odp-mobile-port-card ${isExpanded ? 'is-expanded' : ''} ${
                    attMeta.status === 'critical' ? 'is-critical' : ''
                  }`}
                >
                  <button
                    type="button"
                    className="odp-mobile-port-head"
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setExpandedPortNum((prev) =>
                        prev === port.portNumber ? null : port.portNumber,
                      )
                    }
                  >
                    <div className="odp-mobile-port-left">
                      <span className="port-id-chip-clean">
                        {formatPortCode(port.portNumber)}
                      </span>
                      <div className="odp-mobile-port-identity">
                        <strong>
                          {isOccupied ? port.customerName || 'Pelanggan' : 'Port Siap PSB'}
                        </strong>
                        <span>
                          {isOccupied ? `SIA ${port.siaNumber || '-'}` : 'Kosong · Siap alokasi'}
                        </span>
                      </div>
                    </div>

                    <div className="odp-mobile-port-right">
                      {isOccupied && port.attenuation != null && port.attenuation !== 0 && (
                        <span
                          className={`odp-mobile-dbm-chip is-${attMeta.status}`}
                        >
                          {port.attenuation.toFixed(1)} dB
                        </span>
                      )}
                      <span className="odp-mobile-expand-glyph" aria-hidden="true">
                        {isExpanded ? '⌄' : '›'}
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="odp-mobile-port-detail">
                      <div className="odp-mobile-port-meta-line">
                        <span>Status:</span>
                        <strong className={`inline-inspect-col-val ${inspSummary.cls}`}>
                          {inspSummary.label}
                        </strong>
                      </div>
                      <p className="odp-mobile-port-note">
                        {port.lastActivity?.notes ||
                          (isOccupied
                            ? 'Port aktif teralokasi pada pelanggan.'
                            : 'Port kosong, siap untuk aktivasi PSB baru.')}
                      </p>
                      <div className="odp-mobile-port-actions">
                        {isOccupied && port.siaNumber && (
                          <Link
                            href={`/customers/${encodeURIComponent(port.siaNumber)}`}
                            className="btn-inspect-detail-action"
                          >
                            <Icon name="externalLink" size={13} />
                            <span>Profil Pelanggan</span>
                          </Link>
                        )}
                        {canCreateTicket && (
                          <button
                            type="button"
                            className="btn-inspect-ticket-action"
                            onClick={() => openTicketForPort(port)}
                          >
                            <Icon name="plus" size={13} />
                            <span>{isOccupied ? 'Tiket Maintenance' : 'Tiket PSB'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
