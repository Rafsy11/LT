import React from 'react';
import Link from 'next/link';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import {
  SPECTRUM_MAX_DBM,
  SPECTRUM_MIN_DBM,
  classifyMonitoringDbm,
  getCriticalReason,
  getSeverityLabel,
  isAttenuationMeasured,
  resolveValidationSummary,
  type LiveReportItem,
} from '../utils/monitoring-telemetry';

export interface TelemetryInspectorHudProps {
  activeReport: LiveReportItem | null;
  getMeterPercentage: (dbm: number | null | undefined) => number;
  onOpenModal: (report: LiveReportItem) => void;
  inDialog?: boolean;
  titleId?: string;
  onCloseDialog?: () => void;
}

export function TelemetryInspectorHud({
  activeReport,
  getMeterPercentage,
  onOpenModal,
  inDialog = false,
  titleId = 'noc-inspector-heading',
  onCloseDialog,
}: TelemetryInspectorHudProps) {
  const ContainerTag = inDialog ? 'div' : 'aside';
  const containerClass = inDialog
    ? 'noc-inspector-panel noc-inspector-panel--dialog'
    : 'noc-inspector-panel';

  if (!activeReport) {
    return (
      <ContainerTag className={containerClass} aria-labelledby={titleId}>
        <header className="noc-inspector-header">
          <h2 id={titleId} className="noc-inspector-title">
            Inspektor Telemetri
          </h2>
          {inDialog && onCloseDialog && (
            <button
              type="button"
              className="noc-dialog-close-btn"
              onClick={onCloseDialog}
              aria-label="Tutup inspektor telemetri"
            >
              <Icon name="x" size={16} />
            </button>
          )}
        </header>
        <div className="noc-inspector-body noc-inspector-body--empty">
          <EmptyState
            icon="activity"
            title="Belum ada laporan dipilih"
            description="Pilih salah satu laporan di daftar telemetri untuk melihat rincian redaman, validasi lokasi, dan tautan tindak lanjut."
            size="compact"
          />
        </div>
      </ContainerTag>
    );
  }

  const severity = classifyMonitoringDbm(activeReport.currentAttenuation);
  const severityClass = severity.toLowerCase();
  const isMeasured = isAttenuationMeasured(activeReport.currentAttenuation);
  const criticalReason = getCriticalReason(activeReport.currentAttenuation);
  const meterPct = getMeterPercentage(activeReport.currentAttenuation);
  const validation = resolveValidationSummary(activeReport);

  const badgeText =
    severity === 'Normal'
      ? 'OPTIMAL'
      : severity === 'Warning'
        ? 'PERLU PANTAU'
        : severity === 'Critical'
          ? criticalReason === 'overpower'
            ? 'KRITIS · OVERPOWER'
            : 'KRITIS · DROP'
          : 'BELUM DIUKUR';

  const networkHref = activeReport.splitterCode
    ? `/network?odp=${encodeURIComponent(activeReport.splitterCode)}`
    : `/network?cluster=${encodeURIComponent(activeReport.clusterCode || activeReport.cluster)}`;

  return (
    <ContainerTag className={containerClass} aria-labelledby={titleId}>
      <header className="noc-inspector-header">
        <div className="noc-inspector-header-main">
          <h2 id={titleId} className="noc-inspector-title">
            Inspektor Telemetri
          </h2>
          <span className="ticket-tag-mono">{activeReport.ticketNumber}</span>
        </div>
        {inDialog && onCloseDialog && (
          <button
            type="button"
            className="noc-dialog-close-btn"
            onClick={onCloseDialog}
            aria-label="Tutup inspektor telemetri"
          >
            <Icon name="x" size={16} />
          </button>
        )}
      </header>

      <div className="noc-inspector-body">
        {/* Optical Gauge Card */}
        <section
          className={`hud-gauge-card hud-gauge-card--${severityClass}`}
          aria-label="Pengukur Redaman Optik"
        >
          <div className="hud-gauge-top">
            <div className={`hud-dbm-big hud-dbm-big--${severityClass}`}>
              {isMeasured ? (
                <>
                  {activeReport.currentAttenuation.toFixed(1)} <small>dBm</small>
                </>
              ) : (
                <span className="hud-dbm-unmeasured">Belum diukur</span>
              )}
            </div>
            <span className={`hud-status-badge hud-status-badge--${severityClass}`}>
              {badgeText}
            </span>
          </div>

          <div
            className="hud-spectrum-bar"
            role="progressbar"
            aria-valuemin={SPECTRUM_MIN_DBM}
            aria-valuemax={SPECTRUM_MAX_DBM}
            aria-valuenow={isMeasured ? activeReport.currentAttenuation : undefined}
            aria-valuetext={
              isMeasured
                ? `${activeReport.currentAttenuation.toFixed(1)} dBm (${getSeverityLabel(severity)})`
                : 'Belum diukur'
            }
            aria-label="Spektrum redaman optik"
          >
            <span className="hud-spectrum-tick hud-spectrum-tick--crit" aria-hidden="true" />
            <span className="hud-spectrum-tick hud-spectrum-tick--warn" aria-hidden="true" />
            <div
              className={`hud-spectrum-fill hud-spectrum-fill--${severityClass}`}
              style={{ width: `${meterPct}%` }}
            />
          </div>

          <div className="hud-spectrum-labels" aria-hidden="true">
            <span>-35 dBm</span>
            <span>-28.0</span>
            <span>-25.0</span>
            <span>-10 dBm</span>
          </div>

          <p className="hud-diagnostic-text">
            {severity === 'Unmeasured' &&
              'Pengukuran OPM belum dikirim dari lapangan. Nilai redaman akan muncul otomatis setelah teknisi mengirim hasil ukur.'}
            {severity === 'Normal' && (
              <>
                Sinyal optik berada pada rentang operasional ideal (<strong>-10,0 s/d -25,0 dBm</strong>)
                untuk layanan FTTH yang stabil.
              </>
            )}
            {severity === 'Warning' && (
              <>
                Redaman mendekati ambang batas maksimal 28 dB (<strong>-25,1 s/d -28,0 dBm</strong>).
                Disarankan pengecekan konektor patch cord atau kelengkungan kabel.
              </>
            )}
            {severity === 'Critical' && criticalReason === 'overpower' && (
              <>
                Daya terima optik terlalu tinggi (<strong>&gt; -10,0 dBm</strong>). Periksa attenuator
                optik dan konfigurasi daya port OLT untuk mencegah kerusakan ONT.
              </>
            )}
            {severity === 'Critical' && criticalReason !== 'overpower' && (
              <>
                Redaman melebihi batas toleransi maksimal (<strong>&lt; -28,0 dBm</strong>). Risiko
                tinggi degradasi layanan atau link terputus; diperlukan pengecekan jalur atau
                penyambungan ulang.
              </>
            )}
          </p>
        </section>

        {/* Customer & Physical Network Spec */}
        <section aria-labelledby="hud-identitas-label">
          <h3 id="hud-identitas-label" className="hud-section-label">
            Identitas &amp; Jaringan
          </h3>
          <dl className="hud-spec-grid">
            <div className="hud-spec-item full-width">
              <dt className="hud-spec-key">Pelanggan</dt>
              <dd className="hud-spec-val">{activeReport.customerName}</dd>
            </div>
            <div className="hud-spec-item">
              <dt className="hud-spec-key">Nomor SIA</dt>
              <dd className="hud-spec-val">
                <code>{activeReport.siaNumber || 'Tidak tersedia'}</code>
              </dd>
            </div>
            <div className="hud-spec-item">
              <dt className="hud-spec-key">Status Tiket</dt>
              <dd className="hud-spec-val">{activeReport.status}</dd>
            </div>
            <div className="hud-spec-item">
              <dt className="hud-spec-key">Cluster Area</dt>
              <dd className="hud-spec-val">{activeReport.cluster || 'Belum ditentukan'}</dd>
            </div>
            <div className="hud-spec-item">
              <dt className="hud-spec-key">Tipe Pekerjaan</dt>
              <dd className="hud-spec-val">{activeReport.ticketType}</dd>
            </div>
            <div className="hud-spec-item">
              <dt className="hud-spec-key">Splitter ODP</dt>
              <dd className="hud-spec-val">
                {activeReport.splitterCode ? (
                  <code>{activeReport.splitterCode}</code>
                ) : (
                  <span className="hud-muted-val">Belum ditautkan</span>
                )}
              </dd>
            </div>
            <div className="hud-spec-item">
              <dt className="hud-spec-key">Alokasi Port</dt>
              <dd className="hud-spec-val">
                {activeReport.portNumber ? (
                  `Port ${activeReport.portNumber}`
                ) : (
                  <span className="hud-muted-val">Belum dialokasikan</span>
                )}
              </dd>
            </div>
          </dl>
        </section>

        {/* Field Validation Box */}
        <section aria-labelledby="hud-validation-label">
          <h3 id="hud-validation-label" className="hud-section-label">
            Status Validasi Lapangan
          </h3>
          <dl className="hud-security-box">
            <div className="hud-sec-row">
              <dt className="hud-sec-label">Teknisi Bertugas</dt>
              <dd className="hud-sec-val">{activeReport.assignedTech || 'Belum ditugaskan'}</dd>
            </div>
            <div className="hud-sec-row">
              <dt className="hud-sec-label">Jarak ke Titik ODP</dt>
              <dd className={`hud-sec-val hud-sec-val--${validation.gpsStatus}`}>
                {validation.gpsDetailLabel}
              </dd>
            </div>
            <div className="hud-sec-row">
              <dt className="hud-sec-label">Status Geofence</dt>
              <dd className={`hud-sec-val hud-sec-val--${validation.geofenceStatus}`}>
                {validation.geofenceDetailLabel}
              </dd>
            </div>
            <div className="hud-sec-row">
              <dt className="hud-sec-label">Bukti Foto OPM</dt>
              <dd className={`hud-sec-val hud-sec-val--${validation.opmStatus}`}>
                {validation.opmDetailLabel}
              </dd>
            </div>
          </dl>
        </section>

        {/* Action Navigation */}
        <nav className="hud-actions" aria-label="Tindak lanjut laporan">
          <button
            className="hud-btn-primary"
            onClick={() => onOpenModal(activeReport)}
            type="button"
          >
            <Icon name="fileText" size={14} />
            <span>Lihat Rincian Tiket</span>
          </button>

          <div className="hud-secondary-links">
            {activeReport.siaNumber && (
              <Link
                href={`/customers/${encodeURIComponent(activeReport.siaNumber)}`}
                className="hud-btn-secondary"
                onClick={onCloseDialog}
              >
                <Icon name="user" size={14} />
                <span>Profil Pelanggan</span>
              </Link>
            )}

            <Link href={networkHref} className="hud-btn-secondary" onClick={onCloseDialog}>
              <Icon name="network" size={14} />
              <span>Master Jaringan</span>
            </Link>

            {activeReport.splitterCode && (
              <Link
                href={`/maps?odp=${encodeURIComponent(activeReport.splitterCode)}`}
                className="hud-btn-secondary"
                onClick={onCloseDialog}
              >
                <Icon name="map" size={14} />
                <span>Lihat di Peta</span>
              </Link>
            )}
          </div>
        </nav>
      </div>
    </ContainerTag>
  );
}
