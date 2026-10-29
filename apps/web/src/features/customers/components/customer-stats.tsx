import React from 'react';

interface CustomerStatsProps {
  totalCount: number;
  activeCount: number;
  pendingCount: number;
  criticalCount: number;
}

export function CustomerStats({
  totalCount,
  activeCount,
  pendingCount,
  criticalCount,
}: CustomerStatsProps) {
  return (
    <section
      className="customers-stats-grid"
      aria-label="Statistik Master Data Pelanggan"
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
              Total Pelanggan
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
              SIA terdaftar di wilayah terpilih
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
              Layanan Aktif
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
            {activeCount}
          </div>
          <div className="stat-card-footer" style={{ borderTop: 'none', padding: 0 }}>
            <span className="caption" style={{ fontSize: '11.5px', color: '#64748b' }}>
              Port splitter terkunci aktif
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
              Menunggu Instalasi
            </span>
          </div>
          <div
            className="stat-card-value"
            style={{ fontSize: '26px', fontWeight: 700, color: '#b45309', margin: '8px 0 2px' }}
          >
            {pendingCount}
          </div>
          <div className="stat-card-footer" style={{ borderTop: 'none', padding: 0 }}>
            <span className="caption" style={{ fontSize: '11.5px', color: '#64748b' }}>
              Tiket PSB dalam antrean teknisi
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
              Redaman Kritis
            </span>
          </div>
          <div
            className="stat-card-value"
            style={{
              fontSize: '26px',
              fontWeight: 700,
              color: criticalCount > 0 ? '#be123c' : '#0f172a',
              margin: '8px 0 2px',
            }}
          >
            {criticalCount}
          </div>
          <div className="stat-card-footer" style={{ borderTop: 'none', padding: 0 }}>
            <span className="caption" style={{ fontSize: '11.5px', color: '#64748b' }}>
              Nilai redaman optik &lt; -25.0 dBm
            </span>
          </div>
        </div>
      </article>
    </section>
  );
}
