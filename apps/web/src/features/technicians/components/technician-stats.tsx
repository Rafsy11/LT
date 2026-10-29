import React from 'react';

interface TechnicianStatsProps {
  totalCount: number;
  activeSessionsCount: number;
  busyCount: number;
  revokedCount: number;
  disabledCount: number;
}

export function TechnicianStats({
  totalCount,
  activeSessionsCount,
  busyCount,
  revokedCount,
  disabledCount,
}: TechnicianStatsProps) {
  return (
    <section
      className="technicians-stats-grid"
      aria-label="Statistik Teknisi & Sesi"
      style={{ marginBottom: '24px' }}
    >
      <article className="stat-card">
        <div className="stat-card-inner">
          <div
            className="stat-card-top"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span
              className="stat-card-label"
              style={{
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.4px',
                textTransform: 'uppercase',
                color: '#64748b',
              }}
            >
              Teknisi Terdaftar
            </span>
          </div>
          <div
            className="stat-card-value"
            style={{ fontSize: '26px', fontWeight: 700, color: '#0f172a', margin: '8px 0 2px' }}
          >
            {totalCount}
          </div>
          <div className="stat-card-footer" style={{ borderTop: 'none', padding: 0 }}>
            <span className="caption" style={{ fontSize: '11.5px', color: '#64748b' }}>
              Pengguna aplikasi mobile terdaftar
            </span>
          </div>
        </div>
      </article>

      <article className="stat-card">
        <div className="stat-card-inner">
          <div
            className="stat-card-top"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span
              className="stat-card-label"
              style={{
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.4px',
                textTransform: 'uppercase',
                color: '#64748b',
              }}
            >
              Sesi Mobile Aktif
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                color: '#166534',
                fontWeight: 500,
              }}
            >
              <span
                style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a' }}
              />
              Online
            </span>
          </div>
          <div
            className="stat-card-value"
            style={{ fontSize: '26px', fontWeight: 700, color: '#166534', margin: '8px 0 2px' }}
          >
            {activeSessionsCount}
          </div>
          <div className="stat-card-footer" style={{ borderTop: 'none', padding: 0 }}>
            <span className="caption" style={{ fontSize: '11.5px', color: '#64748b' }}>
              Token JWT sah tersinkron di Redis
            </span>
          </div>
        </div>
      </article>

      <article className="stat-card">
        <div className="stat-card-inner">
          <div
            className="stat-card-top"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span
              className="stat-card-label"
              style={{
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.4px',
                textTransform: 'uppercase',
                color: '#64748b',
              }}
            >
              Sedang Bertugas
            </span>
          </div>
          <div
            className="stat-card-value"
            style={{ fontSize: '26px', fontWeight: 700, color: '#1b5ca2', margin: '8px 0 2px' }}
          >
            {busyCount}
          </div>
          <div className="stat-card-footer" style={{ borderTop: 'none', padding: 0 }}>
            <span className="caption" style={{ fontSize: '11.5px', color: '#64748b' }}>
              Memegang tiket terbuka di lapangan
            </span>
          </div>
        </div>
      </article>

      <article className="stat-card">
        <div className="stat-card-inner">
          <div
            className="stat-card-top"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span
              className="stat-card-label"
              style={{
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.4px',
                textTransform: 'uppercase',
                color: '#64748b',
              }}
            >
              Sesi Dicabut / Kunci
            </span>
          </div>
          <div
            className="stat-card-value"
            style={{
              fontSize: '26px',
              fontWeight: 700,
              color: revokedCount > 0 || disabledCount > 0 ? '#be123c' : '#0f172a',
              margin: '8px 0 2px',
            }}
          >
            {revokedCount + disabledCount}
          </div>
          <div className="stat-card-footer" style={{ borderTop: 'none', padding: 0 }}>
            <span className="caption" style={{ fontSize: '11.5px', color: '#64748b' }}>
              {revokedCount} sesi dicabut · {disabledCount} akun dikunci
            </span>
          </div>
        </div>
      </article>
    </section>
  );
}
