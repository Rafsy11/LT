'use client';

import React from 'react';
import { SystemSettingsInput } from '@repo/shared';

export interface NetworkSettingsPanelProps {
  settings: SystemSettingsInput;
  isSuperAdmin: boolean;
  handleChange: <K extends keyof SystemSettingsInput>(
    field: K,
    value: SystemSettingsInput[K],
  ) => void;
}

export function NetworkSettingsPanel({
  settings,
  isSuperAdmin,
  handleChange,
}: NetworkSettingsPanelProps) {
  return (
    <section
      className="settings-panel-grid"
      aria-label="Akses Jaringan & Distribusi APK"
    >
      {/* Left: Public Access & Workspace Identity */}
      <article className="settings-card">
        <header>
          <h2 className="ui-settings-heading">
            Metode Akses Publik untuk 200 Teknisi
          </h2>
          <p className="ui-settings-sub" style={{ margin: '0 0 16px 0' }}>
            Jalur koneksi terenkripsi HTTPS agar aplikasi mobile Android/iOS dapat mengakses API,
            kamera, dan koordinat GPS.
          </p>
        </header>

        <fieldset
          aria-label="Pilihan Metode Akses Publik"
          className="settings-three-col-grid"
          style={{
            border: 0,
            margin: 0,
            padding: 0,
            marginBottom: '20px',
          }}
        >
          {[
            {
              key: 'STATIC_IP_HTTPS',
              title: 'IP Publik Statis + HTTPS',
              desc: 'Port 443 terbuka langsung dengan domain resmi ISP.',
            },
            {
              key: 'CLOUDFLARE_TUNNEL',
              title: 'Cloudflare Tunnel (Zero-Trust)',
              desc: 'Koneksi keluar tanpa membuka port publik di router.',
            },
            {
              key: 'INTERNAL_VPN',
              title: 'Internal WireGuard / VPN',
              desc: 'HP teknisi wajib tersambung ke profil VPN perusahaan.',
            },
          ].map((item) => (
            <div
              key={item.key}
              onClick={() =>
                isSuperAdmin &&
                handleChange(
                  'publicAccessMethod',
                  item.key as SystemSettingsInput['publicAccessMethod'],
                )
              }
              className={`settings-option-card ${settings.publicAccessMethod === item.key ? 'active' : ''}`}
              style={{
                padding: '12px',
                borderRadius: '6px',
                cursor: isSuperAdmin ? 'pointer' : 'default',
              }}
            >
              <div
                className="settings-option-title"
                style={{
                  fontWeight: 600,
                  fontSize: '12.5px',
                  marginBottom: '3px',
                }}
              >
                {item.title}
              </div>
              <div className="settings-option-desc" style={{ fontSize: '11px', lineHeight: 1.35 }}>
                {item.desc}
              </div>
            </div>
          ))}
        </fieldset>

        <div
          className="settings-two-col-grid"
          style={{ marginBottom: '16px' }}
        >
          <div>
            <label className="settings-input-label">
              Domain / Host URL Sistem Operasional
            </label>
            <input
              type="text"
              value={settings.publicDomain}
              disabled={!isSuperAdmin}
              onChange={(e) => handleChange('publicDomain', e.target.value)}
              className="settings-text-input mono"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '12.5px',
              }}
            />
          </div>

          <div>
            <label className="settings-input-label">
              Zona Waktu Operasional Server
            </label>
            <select
              value={settings.serverTimezone}
              disabled={!isSuperAdmin}
              onChange={(e) =>
                handleChange(
                  'serverTimezone',
                  e.target.value as SystemSettingsInput['serverTimezone'],
                )
              }
              className="settings-select"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '12.5px',
              }}
            >
              <option value="Asia/Jakarta">Asia/Jakarta (WIB · UTC+7)</option>
              <option value="Asia/Makassar">Asia/Makassar (WITA · UTC+8)</option>
              <option value="Asia/Jayapura">Asia/Jayapura (WIT · UTC+9)</option>
            </select>
          </div>
        </div>

        {/* Nginx Reverse Proxy Config */}
        <section
          aria-label="Konfigurasi Nginx Reverse Proxy"
          className="ui-divider-top"
          style={{ paddingTop: '16px' }}
        >
          <header>
            <h3 className="settings-section-heading" style={{ fontSize: '13px', margin: '0 0 10px 0' }}>
              Konfigurasi Nginx Reverse Proxy (PRD 7.2 &amp; AGENT.md)
            </h3>
          </header>
          <div className="settings-two-col-grid">
            <div className="settings-nginx-card">
              <div className="settings-nginx-title">
                Batas Ukuran Upload Foto
              </div>
              <div className="settings-nginx-code">
                client_max_body_size 20M;
              </div>
              <div className="settings-nginx-desc">
                Mencegah error HTTP 413 saat teknisi mengunggah foto kompresi OPM/ODP.
              </div>
            </div>

            <div className="settings-nginx-card">
              <div className="settings-nginx-title">
                Buffering Server-Sent Events
              </div>
              <div className="settings-nginx-code">
                proxy_buffering off;
              </div>
              <div className="settings-nginx-desc">
                Memastikan Live Monitoring SSE mengalir instan tanpa tertahan buffer Nginx.
              </div>
            </div>
          </div>
        </section>
      </article>

      {/* Right: Mobile Distribution & Self-Hosted OTA Update (PRD 7.3) */}
      <aside
        aria-label="Distribusi Mobile & Self-Hosted OTA Update"
        style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
      >
        <article className="settings-card">
          <header
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
            }}
          >
            <h3 className="settings-section-heading" style={{ margin: 0 }}>
              Distribusi Mobile &amp; Self-Hosted OTA Update
            </h3>
            <span className="settings-status-pill healthy">
              PRD 7.3 Siap
            </span>
          </header>

          <p className="settings-section-subheading" style={{ margin: '0 0 16px 0', lineHeight: 1.4 }}>
            Mekanisme pembaruan aplikasi lapangan langsung melalui server internal tanpa harus
            menginstal ulang file APK pada 200 ponsel teknisi.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label className="settings-input-label">
                Portal Unduh APK Internal Resmi
              </label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  value={
                    settings.apkDownloadUrl ||
                    'https://ftth-ops.lintasarta.co.id/download/technician-latest.apk'
                  }
                  disabled={!isSuperAdmin}
                  onChange={(e) => handleChange('apkDownloadUrl', e.target.value)}
                  className="settings-text-input mono"
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                />
              </div>
            </div>

            <div>
              <label className="settings-input-label">
                Endpoint Manifest Self-Hosted OTA (expo-updates)
              </label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  value={
                    settings.otaUpdateUrl || 'https://ftth-ops.lintasarta.co.id/api/v1/ota/manifest'
                  }
                  disabled={!isSuperAdmin}
                  onChange={(e) => handleChange('otaUpdateUrl', e.target.value)}
                  className="settings-text-input mono"
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                />
              </div>
            </div>

            <div className="settings-ota-info-box">
              Teknisi yang membuka aplikasi mobile otomatis memeriksa endpoint manifest di atas.
              Bundle JavaScript dan perbaikan bug dapat langsung diunduh secara latar belakang.
            </div>
          </div>
        </article>
      </aside>
    </section>
  );
}
