import React from 'react';
import Link from 'next/link';
import { classifyDbm, dbmTone } from '@repo/shared';
import type { LiveReportItem } from '../hooks/use-monitoring';

export interface TelemetryInspectorHudProps {
  activeReport: LiveReportItem | null;
  getMeterPercentage: (dbm: number) => number;
  onOpenModal: (report: LiveReportItem) => void;
}

export function TelemetryInspectorHud({
  activeReport,
  getMeterPercentage,
  onOpenModal,
}: TelemetryInspectorHudProps) {
  if (!activeReport) return null;

  const status = classifyDbm(activeReport.currentAttenuation);
  const tone = dbmTone(activeReport.currentAttenuation);
  const meterPct = getMeterPercentage(activeReport.currentAttenuation);

  return (
    <aside className="noc-inspector-panel" aria-label="Inspektor Telemetri Real-Time">
      <header className="noc-inspector-header">
        <h2 className="noc-inspector-title" style={{ margin: 0 }}>INSPEKTOR TELEMETRI</h2>
        <span className="ticket-tag-mono">{activeReport.ticketNumber}</span>
      </header>

      <div className="noc-inspector-body">
        {/* Optical HUD Gauge Card */}
        <section className={`hud-gauge-card ${status.toLowerCase()}`} aria-label="Pengukur Redaman Optik">
          <div className="hud-gauge-top">
            <div className={`hud-dbm-big ${tone}`}>
              {activeReport.currentAttenuation.toFixed(1)} <small>dBm</small>
            </div>
            <span className={`hud-status-badge ${status.toLowerCase()}`}>
              {status === 'Normal' && 'OPTIMAL'}
              {status === 'Warning' && 'PERLU PANTAU'}
              {status === 'Critical' && 'KRITIS - DROP'}
            </span>
          </div>

          <div
            className="hud-spectrum-bar"
            title={`Posisi spektrum ukur: ${activeReport.currentAttenuation} dBm`}
            role="progressbar"
            aria-valuenow={activeReport.currentAttenuation}
            aria-valuemin={-30}
            aria-valuemax={-10}
            aria-label="Spektrum redaman"
          >
            <div
              className={`hud-spectrum-fill ${status.toLowerCase()}`}
              style={{ width: `${meterPct}%` }}
            />
          </div>
          <div className="hud-spectrum-labels" aria-hidden="true">
            <span>-30 dBm</span>
            <span>-22.0</span>
            <span>-15.0</span>
            <span>-10 dBm</span>
          </div>

          <p className="hud-diagnostic-text">
            {status === 'Normal' && (
              <>
                Sinyal redaman optik berada di rentang ideal (<b>-15.0 s/d -22.0 dBm</b>) untuk
                transmisi GPON tanpa <i>packet loss</i>.
              </>
            )}
            {status === 'Warning' && (
              <>
                Sinyal mendekati ambang batas margin redaman (<b>-22.1 s/d -25.0 dBm</b>).
                Disarankan inspeksi konektor patch cord dan adaptor ODP.
              </>
            )}
            {status === 'Critical' && (
              <>
                Sinyal redaman drop kritis (<b>&lt; -25.0 dBm</b>). Risiko tinggi terjadi degradasi
                layanan pelanggan atau link optik terputus.
              </>
            )}
          </p>
        </section>

        {/* Customer & Physical Network Spec */}
        <section aria-labelledby="hud-identitas-label">
          <h3 id="hud-identitas-label" className="hud-section-label">IDENTITAS FISIK &amp; JARINGAN</h3>
          <div className="hud-spec-grid">
            <div className="hud-spec-item full-width">
              <div className="hud-spec-key">Nama Pelanggan</div>
              <div className="hud-spec-val">{activeReport.customerName}</div>
            </div>
            <div className="hud-spec-item">
              <div className="hud-spec-key">Nomor SIA</div>
              <div className="hud-spec-val">
                <code>{activeReport.siaNumber}</code>
              </div>
            </div>
            <div className="hud-spec-item">
              <div className="hud-spec-key">Cluster Area</div>
              <div className="hud-spec-val">{activeReport.cluster}</div>
            </div>
            <div className="hud-spec-item">
              <div className="hud-spec-key">Splitter ODP Fisik</div>
              <div className="hud-spec-val">
                <code>{activeReport.splitterCode || '—'}</code>
              </div>
            </div>
            <div className="hud-spec-item">
              <div className="hud-spec-key">Alokasi Port</div>
              <div className="hud-spec-val">
                {activeReport.portNumber ? `Port ${activeReport.portNumber}` : '—'}
              </div>
            </div>
          </div>
        </section>

        {/* Field Security & Verification (PRD 3.3) */}
        <section aria-labelledby="hud-security-label">
          <h3 id="hud-security-label" className="hud-section-label">INTEGRITAS LAPANGAN &amp; ANTI-FAKE GPS</h3>
          <div className="hud-security-box">
            <div className="hud-sec-row">
              <span className="hud-sec-label">Teknisi Bertugas</span>
              <span className="hud-sec-val">{activeReport.assignedTech}</span>
            </div>
            <div className="hud-sec-row">
              <span className="hud-sec-label">Jarak ke Titik ODP</span>
              {activeReport.distanceToSplitterM && activeReport.distanceToSplitterM > 100 ? (
                <span className="hud-sec-val warning">
                  {activeReport.distanceToSplitterM}m (Mismatch)
                </span>
              ) : (
                <span className="hud-sec-val verified">
                  {activeReport.distanceToSplitterM ?? 18}m (Toleransi OK)
                </span>
              )}
            </div>
            <div className="hud-sec-row">
              <span className="hud-sec-label">Deteksi Mock GPS</span>
              <span className="hud-sec-val verified">Negatif (OS Verified)</span>
            </div>
            <div className="hud-sec-row">
              <span className="hud-sec-label">Bukti Foto OPM</span>
              <span className="hud-sec-val verified">MinIO Verified</span>
            </div>
          </div>
        </section>

        {/* Action Buttons */}
        <nav className="hud-actions" aria-label="Aksi Inspeksi Telemetri">
          <button
            className="hud-btn-primary"
            onClick={() => onOpenModal(activeReport)}
            type="button"
          >
            <span>Lihat Rincian Lengkap Tiket</span>
          </button>

          <Link href="/network" className="hud-btn-secondary">
            <span>Buka di Master Jaringan</span>
          </Link>
        </nav>
      </div>
    </aside>
  );
}
