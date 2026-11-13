import React from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';
import type { TechnicianListItem } from '@repo/shared';

interface TechnicianCardProps {
  tech: TechnicianListItem;
  isProcessing: boolean;
  canManageTech: boolean;
  onSelectTech: (tech: TechnicianListItem) => void;
  onForceLogout: (usernameOrId: string) => void;
  onToggleAccount: (usernameOrId: string) => void;
}

export function TechnicianCard({
  tech,
  isProcessing,
  canManageTech,
  onSelectTech,
  onForceLogout,
  onToggleAccount,
}: TechnicianCardProps) {
  const isActiveSession = tech.sessionStatus === 'ACTIVE_SESSION';
  const isRevokedSession = tech.sessionStatus === 'REVOKED';

  return (
    <article className="technician-card">
      {/* Card Header: Avatar, Name & Username, Last Active & Unified Status Pill */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <DefaultAvatar size={30} name={tech.fullName} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', flexWrap: 'wrap' }}>
              <h2
                className="tech-card-name"
                style={{
                  margin: 0,
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  lineHeight: 1.25,
                }}
              >
                {tech.fullName}
              </h2>
              <span className="tech-card-username" style={{ fontSize: '10.5px', fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>
                @{tech.username}
              </span>
            </div>
            <div
              className="tech-card-last-active"
              style={{
                fontSize: '10.5px',
                color: 'var(--color-text-muted)',
                marginTop: '1px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {tech.lastActiveAt
                ? `Online ${tech.lastActiveAt}`
                : 'Belum ada riwayat sesi'}
            </div>
          </div>
        </div>

        {/* Single Unified Status Pill */}
        <div style={{ flexShrink: 0 }}>
          {!tech.isActive ? (
            <span className="tech-session-badge locked">
              <Icon name="lock" size={10} />
              Terkunci
            </span>
          ) : isActiveSession ? (
            <span className="tech-session-badge active">
              <span className="tech-session-dot" />
              Sesi Aktif
            </span>
          ) : isRevokedSession ? (
            <span className="tech-session-badge revoked">
              Sesi Dicabut
            </span>
          ) : (
            <span className="tech-session-badge idle">
              Belum Login
            </span>
          )}
        </div>
      </header>

      {/* Work Order Info Strip */}
      <div className="tech-spec-strip">
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span className="tech-cluster-chip">
            {tech.cluster}
          </span>
          <span className="tech-spec-sep">·</span>
          <span className="tech-count-active">{tech.activeTicketsCount}</span>
          <span className="tech-label-active">Aktif</span>
          <span className="tech-spec-sep">·</span>
          <span className="tech-count-done">{tech.completedTicketsCount} Selesai</span>
        </div>

        {tech.activeWorkOrders && tech.activeWorkOrders.length > 0 && (
          <Link
            href={`/tickets?search=${tech.activeWorkOrders[0].ticketNumber}`}
            className="tech-ticket-pill"
            title={`Buka tiket ${tech.activeWorkOrders[0].ticketNumber}`}
          >
            {tech.activeWorkOrders[0].ticketNumber}
          </Link>
        )}
      </div>

      {/* Card Actions */}
      <footer className="tech-card-footer">
        {/* Detail Modal Button */}
        <button
          className="button tech-detail-btn"
          onClick={() => onSelectTech(tech)}
          type="button"
        >
          Detail Sesi
        </button>

        {/* Force Logout Button - Icon Only (PRD 2.2 / Law 4) */}
        {canManageTech ? (
          <button
            className={`button tech-logout-btn ${isActiveSession ? 'active' : 'inactive'}`}
            disabled={isProcessing || !isActiveSession}
            onClick={() => onForceLogout(tech.username)}
            title={
              isActiveSession ? 'Cabut sesi token JWT mobile' : 'Teknisi tidak memiliki sesi aktif'
            }
            aria-label={isActiveSession ? 'Cabut sesi' : 'Sesi nonaktif'}
            type="button"
          >
            {isProcessing ? (
              <span style={{ fontSize: '10px' }}>...</span>
            ) : (
              <Icon name="logOut" size={13} />
            )}
          </button>
        ) : (
          <button
            className="button disabled tech-logout-btn inactive"
            disabled
            title="Izin tech:manage diperlukan"
            aria-label="Izin diperlukan"
            type="button"
          >
            <Icon name="logOut" size={13} />
          </button>
        )}

        {/* Account Lock Toggle */}
        {canManageTech && (
          <button
            className="button tech-lock-btn"
            disabled={isProcessing}
            onClick={() => onToggleAccount(tech.username)}
            title={tech.isActive ? 'Kunci akun teknisi ini' : 'Buka kunci akun teknisi ini'}
            type="button"
          >
            <Icon name={tech.isActive ? 'lock' : 'unlock'} size={12} />
          </button>
        )}
      </footer>
    </article>
  );
}
