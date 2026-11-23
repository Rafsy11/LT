'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import {
  getCriticalReason,
  type LiveReportItem,
} from '../utils/monitoring-telemetry';

export interface MonitoringIncidentBarProps {
  criticalReports: LiveReportItem[];
  activeCriticalIndex: number;
  onCycleCritical: (delta: -1 | 1) => void;
  onFocusReport: (report: LiveReportItem) => void;
  onOpenModal: (report: LiveReportItem) => void;
}

export function MonitoringIncidentBar({
  criticalReports,
  activeCriticalIndex,
  onCycleCritical,
  onFocusReport,
  onOpenModal,
}: MonitoringIncidentBarProps) {
  if (criticalReports.length === 0) return null;

  const safeIndex = Math.min(activeCriticalIndex, criticalReports.length - 1);
  const current = criticalReports[safeIndex];
  if (!current) return null;

  const reason = getCriticalReason(current.currentAttenuation);
  const reasonLead =
    reason === 'overpower' ? 'Daya optik berlebih (overpower) pada' : 'Redaman kritis pada';
  const odpText = current.splitterCode
    ? `${current.splitterCode}${current.portNumber ? ` Port ${current.portNumber}` : ''}`
    : 'ODP belum ditautkan';
  const techText = current.assignedTech || 'Belum ditugaskan';

  return (
    <aside className="noc-incident-bar" role="region" aria-label="Peringatan Insiden Redaman Kritis">
      <div className="noc-incident-left">
        <div className="noc-incident-badge-group">
          <span className="noc-incident-badge">
            <Icon name="alert" size={13} />
            <span>INSIDEN KRITIS</span>
          </span>
          {criticalReports.length > 1 && (
            <div className="noc-incident-pager" aria-label="Navigasi antar insiden kritis">
              <button
                type="button"
                className="noc-incident-nav-btn"
                onClick={() => onCycleCritical(-1)}
                aria-label="Insiden kritis sebelumnya"
              >
                <Icon name="chevronLeft" size={14} />
              </button>
              <span className="noc-incident-counter">
                {safeIndex + 1} / {criticalReports.length}
              </span>
              <button
                type="button"
                className="noc-incident-nav-btn"
                onClick={() => onCycleCritical(1)}
                aria-label="Insiden kritis berikutnya"
              >
                <Icon name="chevronRight" size={14} />
              </button>
            </div>
          )}
        </div>

        <p className="noc-incident-summary">
          {reasonLead} <strong>{current.customerName}</strong>
          {current.siaNumber ? ` (${current.siaNumber})` : ''} · {odpText}
          {current.cluster ? ` (${current.cluster})` : ''} · Teknisi: {techText}
        </p>
      </div>

      <div className="noc-incident-right">
        <span className="noc-incident-dbm">{current.currentAttenuation.toFixed(1)} dBm</span>
        <div className="noc-incident-actions">
          <button
            className="noc-incident-btn"
            onClick={() => onFocusReport(current)}
            type="button"
          >
            <span>Inspeksi</span>
          </button>
          <button
            className="noc-incident-btn noc-incident-btn-primary"
            onClick={() => onOpenModal(current)}
            type="button"
          >
            <span>Buka Tiket</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
