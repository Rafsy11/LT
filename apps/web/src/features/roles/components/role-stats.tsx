'use client';

import React from 'react';

export interface RoleStatsProps {
  totalUsers: number;
}

export function RoleStats({ totalUsers }: RoleStatsProps) {
  return (
    <section className="roles-stats-grid" aria-label="Statistik RBAC" style={{ marginBottom: '24px' }}>
      <article className="stat-card">
        <div className="stat-card-inner">
          <div className="stat-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-card-label" style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: '#64748b' }}>
              Total Pengguna Sistem
            </span>
          </div>
          <div className="stat-card-value" style={{ fontSize: '26px', fontWeight: 700, color: '#0f172a', margin: '8px 0 2px' }}>
            {totalUsers}
          </div>
          <div className="stat-card-footer" style={{ borderTop: 'none', padding: 0 }}>
            <span className="caption" style={{ fontSize: '11.5px', color: '#64748b' }}>
              Operator dan akun terdaftar
            </span>
          </div>
        </div>
      </article>

      <article className="stat-card">
        <div className="stat-card-inner">
          <div className="stat-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-card-label" style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: '#64748b' }}>
              Otoritas Penuh
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#0e5b92', fontWeight: 600 }}>
              Root Access
            </span>
          </div>
          <div className="stat-card-value" style={{ fontSize: '26px', fontWeight: 700, color: '#0e5b92', margin: '8px 0 2px' }}>
            Super Admin
          </div>
          <div className="stat-card-footer" style={{ borderTop: 'none', padding: 0 }}>
            <span className="caption" style={{ fontSize: '11.5px', color: '#64748b' }}>
              Akses global konfigurasi sistem
            </span>
          </div>
        </div>
      </article>

      <article className="stat-card">
        <div className="stat-card-inner">
          <div className="stat-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-card-label" style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: '#64748b' }}>
              Admin Operasional
            </span>
          </div>
          <div className="stat-card-value" style={{ fontSize: '26px', fontWeight: 700, color: '#1d4ed8', margin: '8px 0 2px' }}>
            NOC &amp; Helpdesk
          </div>
          <div className="stat-card-footer" style={{ borderTop: 'none', padding: 0 }}>
            <span className="caption" style={{ fontSize: '11.5px', color: '#64748b' }}>
              Cakupan wilayah &amp; penugasan tiket
            </span>
          </div>
        </div>
      </article>

      <article className="stat-card">
        <div className="stat-card-inner">
          <div className="stat-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-card-label" style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: '#64748b' }}>
              Akses Lapangan
            </span>
          </div>
          <div className="stat-card-value" style={{ fontSize: '26px', fontWeight: 700, color: '#475569', margin: '8px 0 2px' }}>
            Teknisi Mobile
          </div>
          <div className="stat-card-footer" style={{ borderTop: 'none', padding: 0 }}>
            <span className="caption" style={{ fontSize: '11.5px', color: '#64748b' }}>
              Terikat tiket aktif &amp; validasi OPM
            </span>
          </div>
        </div>
      </article>
    </section>
  );
}

