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
      aria-label="Akses Jaringan & Distribusi APK"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.25fr) minmax(360px, 1fr)',
        gap: '24px',
        alignItems: 'start',
      }}
    >
      {/* Left: Public Access & Workspace Identity */}
      <article
        style={{
          background: '#ffffff',
          border: '1px solid #e2ecf2',
          borderRadius: '8px',
          padding: '22px',
          boxShadow: '0 1px 3px rgba(27, 92, 162, 0.02)',
        }}
      >
        <header>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#182230', margin: '0 0 4px 0' }}>
            Metode Akses Publik untuk 200 Teknisi
          </h2>
          <p style={{ fontSize: '12.5px', color: '#515a62', margin: '0 0 16px 0' }}>
            Jalur koneksi terenkripsi HTTPS agar aplikasi mobile Android/iOS dapat mengakses API,
            kamera, dan koordinat GPS.
          </p>
        </header>

        <fieldset
          aria-label="Pilihan Metode Akses Publik"
          style={{
            border: 0,
            margin: 0,
            padding: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '10px',
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
              onClick={() => isSuperAdmin && handleChange('publicAccessMethod', item.key as any)}
              style={{
                padding: '12px',
                borderRadius: '6px',
                border: `1.5px solid ${settings.publicAccessMethod === item.key ? '#0e5b92' : '#e2ecf2'}`,
                background: settings.publicAccessMethod === item.key ? '#f0f7ff' : '#ffffff',
                cursor: isSuperAdmin ? 'pointer' : 'default',
                transition: 'all 0.15s ease',
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  fontSize: '12.5px',
                  color: '#182230',
                  marginBottom: '3px',
                }}
              >
                {item.title}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.35 }}>
                {item.desc}
              </div>
            </div>
          ))}
        </fieldset>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '14px',
            marginBottom: '16px',
          }}
        >
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: '#334155',
                marginBottom: '6px',
              }}
            >
              Domain / Host URL Sistem Operasional
            </label>
            <input
              type="text"
              value={settings.publicDomain}
              disabled={!isSuperAdmin}
              onChange={(e) => handleChange('publicDomain', e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #dce7f0',
                fontSize: '12.5px',
                color: '#182230',
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: '#334155',
                marginBottom: '6px',
              }}
            >
              Zona Waktu Operasional Server
            </label>
            <select
              value={settings.serverTimezone}
              disabled={!isSuperAdmin}
              onChange={(e) => handleChange('serverTimezone', e.target.value as any)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #dce7f0',
                background: '#ffffff',
                fontSize: '12.5px',
                color: '#182230',
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
          style={{ borderTop: '1px solid #edf2f7', paddingTop: '16px' }}
        >
          <header>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#182230', margin: '0 0 10px 0' }}>
              Konfigurasi Nginx Reverse Proxy (PRD 7.2 &amp; AGENT.md)
            </h3>
          </header>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div
              style={{
                background: '#f8fafc',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid #eef2f6',
              }}
            >
              <div style={{ fontSize: '10.5px', fontWeight: 600, color: '#64748b' }}>
                Batas Ukuran Upload Foto
              </div>
              <div
                style={{ fontSize: '13px', fontWeight: 600, color: '#182230', marginTop: '2px' }}
              >
                client_max_body_size 20M;
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                Mencegah error HTTP 413 saat teknisi mengunggah foto kompresi OPM/ODP.
              </div>
            </div>

            <div
              style={{
                background: '#f8fafc',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid #eef2f6',
              }}
            >
              <div style={{ fontSize: '10.5px', fontWeight: 600, color: '#64748b' }}>
                Buffering Server-Sent Events
              </div>
              <div
                style={{ fontSize: '13px', fontWeight: 600, color: '#182230', marginTop: '2px' }}
              >
                proxy_buffering off;
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
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
        <article
          style={{
            background: '#ffffff',
            border: '1px solid #e2ecf2',
            borderRadius: '8px',
            padding: '22px',
            boxShadow: '0 1px 3px rgba(27, 92, 162, 0.02)',
          }}
        >
          <header
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
            }}
          >
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#182230', margin: 0 }}>
              Distribusi Mobile &amp; Self-Hosted OTA Update
            </h3>
            <span
              style={{
                fontSize: '10.5px',
                padding: '2px 7px',
                borderRadius: '4px',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                color: '#15803d',
                fontWeight: 600,
              }}
            >
              PRD 7.3 Siap
            </span>
          </header>

          <p style={{ fontSize: '12px', color: '#515a62', margin: '0 0 16px 0', lineHeight: 1.4 }}>
            Mekanisme pembaruan aplikasi lapangan langsung melalui server internal tanpa harus
            menginstal ulang file APK pada 200 ponsel teknisi.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: '#334155',
                  marginBottom: '4px',
                }}
              >
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
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    border: '1px solid #dce7f0',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    color: '#0e5b92',
                  }}
                />
              </div>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: '#334155',
                  marginBottom: '4px',
                }}
              >
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
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    border: '1px solid #dce7f0',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    color: '#0e5b92',
                  }}
                />
              </div>
            </div>

            <div
              style={{
                marginTop: '6px',
                padding: '10px 12px',
                borderRadius: '6px',
                background: '#f8fafc',
                border: '1px solid #eef2f6',
                fontSize: '11.5px',
                color: '#475569',
                lineHeight: 1.4,
              }}
            >
              Teknisi yang membuka aplikasi mobile otomatis memeriksa endpoint manifest di atas.
              Bundle JavaScript dan perbaikan bug dapat langsung diunduh secara latar belakang.
            </div>
          </div>
        </article>
      </aside>
    </section>
  );
}
