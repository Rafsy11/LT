'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';

export interface RoleStatsProps {
  totalUsers: number;
}

export function RoleStats({ totalUsers }: RoleStatsProps) {
  return (
    <section
      className="roles-stats-grid"
      aria-label="Statistik RBAC"
    >
      <article className="stat-card">
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round">
              <Icon name="users" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Total Pengguna</span>
              <div className="stat-card-value">{totalUsers}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">Operator dan akun terdaftar</span>
          </div>
        </div>
      </article>

      <article className="stat-card">
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round">
              <Icon name="shield" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Otoritas Penuh</span>
              <div className="stat-card-value">Super Admin</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">Akses global konfigurasi sistem</span>
          </div>
        </div>
      </article>

      <article className="stat-card">
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round">
              <Icon name="activity" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Admin Operasional</span>
              <div className="stat-card-value">NOC &amp; Helpdesk</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">Cakupan wilayah &amp; penugasan tiket</span>
          </div>
        </div>
      </article>

      <article className="stat-card">
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round">
              <Icon name="user" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Akses Lapangan</span>
              <div className="stat-card-value">Teknisi Mobile</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">Terikat tiket aktif &amp; validasi OPM</span>
          </div>
        </div>
      </article>
    </section>
  );
}
