import React from 'react';
import { Icon } from '@/components/ui/Icon';
import type { LiveReportItem } from '../hooks/use-monitoring';

export interface MonitoringIncidentBarProps {
  pinnedCriticalReport: LiveReportItem | null;
  onFocusReport: (report: LiveReportItem) => void;
  onOpenModal: (report: LiveReportItem) => void;
}

export function MonitoringIncidentBar({
  pinnedCriticalReport,
  onFocusReport,
  onOpenModal,
}: MonitoringIncidentBarProps) {
  if (!pinnedCriticalReport) return null;

  return (
    <section className="noc-incident-bar" aria-label="Notifikasi Insiden Kritis">
      <div className="noc-incident-left">
        <span className="noc-incident-badge">
          <span className="noc-incident-dot" />
          INSIDEN KRITIS
        </span>
        <div className="noc-incident-summary">
          Sinyal drop terdeteksi pada <b>{pinnedCriticalReport.customerName}</b> ({pinnedCriticalReport.siaNumber}) · {pinnedCriticalReport.splitterCode || 'ODP-CMH-02'} Port {pinnedCriticalReport.portNumber || 7} ({pinnedCriticalReport.cluster}) · Teknisi: {pinnedCriticalReport.assignedTech}
        </div>
      </div>

      <div className="noc-incident-right">
        <span className="noc-incident-dbm">{pinnedCriticalReport.currentAttenuation.toFixed(1)} dBm</span>
        <button
          className="noc-incident-btn"
          onClick={() => onFocusReport(pinnedCriticalReport)}
          type="button"
          title="Fokuskan inspektor HUD ke tiket ini"
        >
          <span>Investigasi Cepat</span>
          <Icon name="chevron" size={12} />
        </button>
        <button
          className="noc-incident-btn noc-incident-btn-primary"
          onClick={() => onOpenModal(pinnedCriticalReport)}
          type="button"
          title="Buka rincian tiket lengkap"
        >
          <span>Buka Tiket</span>
          <Icon name="arrow" size={12} />
        </button>
      </div>
    </section>
  );
}

