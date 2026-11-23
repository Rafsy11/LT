'use client';

import React from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';
import type { TechnicianListItem } from '@repo/shared';
import {
  formatTechnicianActivityText,
  resolveTechnicianVisualState,
  type TechnicianModalIntent,
} from '../utils/technician-session';

export interface TechnicianCardProps {
  tech: TechnicianListItem;
  isProcessing: boolean;
  canManageTech: boolean;
  onOpenModal: (tech: TechnicianListItem, intent?: TechnicianModalIntent) => void;
}

export function TechnicianCard({
  tech,
  isProcessing,
  canManageTech,
  onOpenModal,
}: TechnicianCardProps) {
  const visual = resolveTechnicianVisualState(tech);
  const isActiveSession = tech.isActive && tech.sessionStatus === 'ACTIVE_SESSION';
  const activityText = formatTechnicianActivityText(tech);
  const hasMetaRow = Boolean(
    tech.isMockLocationDetected || tech.vendorCompany || tech.nik || tech.telegramBound,
  );
  const primaryWorkOrder = tech.activeWorkOrders?.[0];

  return (
    <article className={`technician-card technician-card--${visual.state}`}>
      {/* Card Header */}
      <header className="tech-card-header">
        <div className="tech-card-identity">
          <DefaultAvatar size={36} name={tech.fullName} />
          <div className="tech-card-title-group">
            <div className="tech-card-name-row">
              <h2 className="tech-card-name" title={tech.fullName}>
                {tech.fullName}
              </h2>
              <span className="tech-card-username">@{tech.username}</span>
            </div>
            <div className="tech-card-last-active" title={activityText}>
              {activityText}
            </div>
          </div>
        </div>

        <span className={`tech-session-badge tech-session-badge--${visual.state}`}>
          {visual.state === 'locked' && <Icon name="lock" size={11} />}
          {visual.state === 'active' && <span className="tech-session-dot" aria-hidden="true" />}
          <span>{visual.badgeLabel}</span>
        </span>
      </header>

      {/* Operational Metadata Row (Mock GPS Warning, Vendor, NIK, Telegram) */}
      {hasMetaRow && (
        <div className="tech-meta-row">
          {tech.isMockLocationDetected && (
            <span className="tech-meta-pill tech-meta-pill--alert">
              <Icon name="alert" size={11} />
              <span>Mock GPS Terdeteksi</span>
            </span>
          )}
          {tech.vendorCompany && (
            <span className="tech-meta-pill" title={tech.vendorCompany}>
              <Icon name="building" size={11} />
              <span className="tech-meta-pill-truncate">{tech.vendorCompany}</span>
            </span>
          )}
          {tech.nik && <span className="tech-meta-pill tech-meta-pill--mono">NIK {tech.nik}</span>}
          {tech.telegramBound && (
            <span className="tech-meta-pill tech-meta-pill--ok">
              <Icon name="check" size={11} />
              <span>Telegram</span>
            </span>
          )}
        </div>
      )}

      {/* Workload & Cluster Strip */}
      <div className="tech-spec-strip">
        <div className="tech-spec-metrics">
          <span className="tech-cluster-chip">{tech.cluster || 'Belum ditentukan'}</span>
          <span className="tech-spec-sep" aria-hidden="true">
            ·
          </span>
          <span className="tech-count-active">{tech.activeTicketsCount}</span>
          <span className="tech-label-active">Aktif</span>
          <span className="tech-spec-sep" aria-hidden="true">
            ·
          </span>
          <span className="tech-count-done">{tech.completedTicketsCount} Selesai</span>
        </div>

        {primaryWorkOrder && (
          <Link
            href={`/tickets?search=${encodeURIComponent(primaryWorkOrder.ticketNumber)}`}
            className="tech-ticket-pill"
            title={`Buka tiket ${primaryWorkOrder.ticketNumber}`}
          >
            {primaryWorkOrder.ticketNumber}
          </Link>
        )}
      </div>

      {/* Card Footer Actions (Quick Destructive Controls Route Through Safe Modal Confirmation) */}
      <footer className="tech-card-footer">
        <button
          className="tech-detail-btn"
          onClick={() => onOpenModal(tech, 'inspect')}
          type="button"
        >
          <span>Detail Sesi</span>
        </button>

        {canManageTech && (
          <>
            <button
              className={`tech-icon-action-btn tech-logout-btn ${isActiveSession ? 'active' : 'inactive'}`}
              disabled={isProcessing || !isActiveSession}
              onClick={() => onOpenModal(tech, 'force_logout')}
              title={
                isActiveSession
                  ? 'Cabut sesi perangkat teknisi (dengan konfirmasi)'
                  : 'Teknisi tidak memiliki sesi aktif'
              }
              aria-label={
                isActiveSession
                  ? `Cabut sesi perangkat ${tech.fullName}`
                  : `Sesi ${tech.fullName} tidak aktif`
              }
              type="button"
            >
              <Icon name="logOut" size={14} />
            </button>

            <button
              className={`tech-icon-action-btn tech-lock-btn ${!tech.isActive ? 'is-locked' : ''}`}
              disabled={isProcessing}
              onClick={() => onOpenModal(tech, tech.isActive ? 'lock_account' : 'unlock_account')}
              title={
                tech.isActive
                  ? 'Kunci akun teknisi (dengan konfirmasi)'
                  : 'Buka kunci akun teknisi (dengan konfirmasi)'
              }
              aria-label={
                tech.isActive
                  ? `Kunci akun teknisi ${tech.fullName}`
                  : `Buka kunci akun teknisi ${tech.fullName}`
              }
              type="button"
            >
              <Icon name={tech.isActive ? 'lock' : 'unlock'} size={14} />
            </button>
          </>
        )}
      </footer>
    </article>
  );
}
