'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';

export interface RoleStatsProps {
  totalUsers: number;
  activeUsers?: number;
  telegramLinkedCount?: number;
  totalRoles?: number;
}

export function RoleStats({
  totalUsers,
  activeUsers = totalUsers,
  telegramLinkedCount = 0,
  totalRoles = 5,
}: RoleStatsProps) {
  const inactiveCount = totalUsers - activeUsers;
  const pendingTelegramCount = totalUsers - telegramLinkedCount;

  return (
    <section className="roles-stats-grid" aria-label="Statistik RBAC">
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
            <span className="caption">Akun operator &amp; staf terdaftar</span>
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
              <span className="stat-card-label">Akun Aktif</span>
              <div className="stat-card-value">
                {activeUsers} <span style={{ fontSize: '13px', fontWeight: 500, color: '#64748b' }}>/ {totalUsers}</span>
              </div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">
              {inactiveCount > 0 ? `${inactiveCount} akun dinonaktifkan` : 'Seluruh akun berstatus aktif'}
            </span>
          </div>
        </div>
      </article>

      <article className="stat-card">
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round">
              <Icon name="bot" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">2FA Telegram</span>
              <div className="stat-card-value">
                {telegramLinkedCount} <span style={{ fontSize: '13px', fontWeight: 500, color: '#64748b' }}>/ {totalUsers}</span>
              </div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">
              {pendingTelegramCount > 0 ? `${pendingTelegramCount} akun menunggu /start` : 'Seluruh akun terhubung'}
            </span>
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
              <span className="stat-card-label">Tingkatan Akses</span>
              <div className="stat-card-value">{totalRoles} Peran</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">Hierarki otoritas RBAC Lvl 10–100</span>
          </div>
        </div>
      </article>
    </section>
  );
}
