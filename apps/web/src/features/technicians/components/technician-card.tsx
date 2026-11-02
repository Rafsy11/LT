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
    <article
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      {/* Card Header: Avatar, Name & Username, Last Active & Unified Status Pill */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <DefaultAvatar size={38} name={tech.fullName} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: '13.5px',
                  fontWeight: 600,
                  color: '#0f172a',
                  lineHeight: 1.3,
                }}
              >
                {tech.fullName}
              </h3>
              <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                @{tech.username}
              </span>
            </div>
            <div
              style={{
                fontSize: '11px',
                color: '#64748b',
                marginTop: '3px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {tech.lastActiveAt
                ? `Sesi online terakhir ${tech.lastActiveAt}`
                : 'Belum ada riwayat sesi'}
            </div>
          </div>
        </div>

        {/* Single Unified Status Pill */}
        <div style={{ flexShrink: 0 }}>
          {!tech.isActive ? (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 500,
                padding: '3px 8px',
                borderRadius: '4px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                color: '#64748b',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Icon name="lock" size={11} />
              Akun Terkunci
            </span>
          ) : isActiveSession ? (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 500,
                padding: '3px 8px',
                borderRadius: '4px',
                background: '#f0fdf4',
                border: '1px solid #dcfce7',
                color: '#15803d',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <span
                style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#16a34a' }}
              />
              Sesi Aktif
            </span>
          ) : isRevokedSession ? (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 500,
                padding: '3px 8px',
                borderRadius: '4px',
                background: '#fff1f2',
                border: '1px solid #ffe4e6',
                color: '#be123c',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              Sesi Dicabut
            </span>
          ) : (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 500,
                padding: '3px 8px',
                borderRadius: '4px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                color: '#64748b',
              }}
            >
              Belum Login
            </span>
          )}
        </div>
      </header>

      {/* Work Order Info Strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11.5px',
          color: '#475569',
          padding: '7px 10px',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              fontSize: '10.5px',
              fontWeight: 500,
              color: '#334155',
              background: '#f1f5f9',
              padding: '1px 6px',
              borderRadius: '4px',
            }}
          >
            {tech.cluster}
          </span>
          <span style={{ color: '#cbd5e1' }}>·</span>
          <span style={{ fontWeight: 600, color: '#0f172a' }}>{tech.activeTicketsCount}</span>
          <span>Tiket Aktif</span>
          <span style={{ color: '#cbd5e1' }}>·</span>
          <span style={{ color: '#64748b' }}>{tech.completedTicketsCount} Selesai</span>
        </div>

        {tech.activeWorkOrders && tech.activeWorkOrders.length > 0 && (
          <Link
            href={`/tickets?search=${tech.activeWorkOrders[0].ticketNumber}`}
            style={{
              fontSize: '11px',
              color: '#0e5b92',
              fontFamily: 'monospace',
              textDecoration: 'none',
              fontWeight: 600,
              padding: '2px 7px',
              background: '#f8fafc',
              borderRadius: '4px',
              border: '1px solid #cbd5e1',
            }}
            title={`Buka tiket ${tech.activeWorkOrders[0].ticketNumber}`}
          >
            {tech.activeWorkOrders[0].ticketNumber}
          </Link>
        )}
      </div>

      {/* Card Actions */}
      <footer
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginTop: 'auto',
          paddingTop: '8px',
          borderTop: '1px solid #f1f5f9',
        }}
      >
        {/* Detail Modal Button */}
        <button
          className="button"
          onClick={() => onSelectTech(tech)}
          type="button"
          style={{
            flex: 1,
            height: '32px',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            padding: '0 10px',
            fontSize: '11.5px',
            fontWeight: 500,
            color: '#334155',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          Detail Sesi
        </button>

        {/* Force Logout Button - Icon Only (PRD 2.2 / Law 4) */}
        {canManageTech ? (
          <button
            className="button"
            disabled={isProcessing || !isActiveSession}
            onClick={() => onForceLogout(tech.username)}
            title={
              isActiveSession ? 'Cabut sesi token JWT mobile' : 'Teknisi tidak memiliki sesi aktif'
            }
            aria-label={isActiveSession ? 'Cabut sesi' : 'Sesi nonaktif'}
            type="button"
            style={{
              width: '32px',
              height: '32px',
              flexShrink: 0,
              background: isActiveSession ? '#ffffff' : '#f8fafc',
              border: `1px solid ${isActiveSession ? '#fecaca' : '#e2e8f0'}`,
              borderRadius: '6px',
              padding: 0,
              color: isActiveSession ? '#dc2626' : '#cbd5e1',
              cursor: isActiveSession ? 'pointer' : 'not-allowed',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
          >
            {isProcessing ? (
              <span style={{ fontSize: '10px' }}>...</span>
            ) : (
              <Icon name="logOut" size={15} />
            )}
          </button>
        ) : (
          <button
            className="button disabled"
            disabled
            title="Izin tech:manage diperlukan"
            aria-label="Izin diperlukan"
            type="button"
            style={{
              width: '32px',
              height: '32px',
              flexShrink: 0,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              padding: 0,
              color: '#cbd5e1',
              cursor: 'not-allowed',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="logOut" size={15} />
          </button>
        )}

        {/* Account Lock Toggle */}
        {canManageTech && (
          <button
            className="button"
            disabled={isProcessing}
            onClick={() => onToggleAccount(tech.username)}
            title={tech.isActive ? 'Kunci akun teknisi ini' : 'Buka kunci akun teknisi ini'}
            type="button"
            style={{
              width: '32px',
              height: '32px',
              padding: 0,
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              color: tech.isActive ? '#64748b' : '#b91c1c',
              cursor: isProcessing ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
          >
            <Icon name={tech.isActive ? 'lock' : 'unlock'} size={13} />
          </button>
        )}
      </footer>
    </article>
  );
}
