'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { FieldError } from '@/components/ui/FieldError';
import { SystemSettingsInput } from '@repo/shared';
import type { SettingsFieldErrors } from '../hooks/use-settings';

export interface NetworkSettingsPanelProps {
  settings: SystemSettingsInput;
  fieldErrors: SettingsFieldErrors;
  isSuperAdmin: boolean;
  handleChange: <K extends keyof SystemSettingsInput>(
    field: K,
    value: SystemSettingsInput[K],
  ) => void;
}

const PUBLIC_ACCESS_OPTIONS: ReadonlyArray<{
  key: SystemSettingsInput['publicAccessMethod'];
  title: string;
  desc: string;
}> = [
  {
    key: 'STATIC_IP_HTTPS',
    title: 'IP Publik Statis + HTTPS',
    desc: 'Port 443 terbuka langsung dengan domain resmi dan sertifikat TLS aktif.',
  },
  {
    key: 'CLOUDFLARE_TUNNEL',
    title: 'Cloudflare Tunnel (Zero-Trust)',
    desc: 'Koneksi keluar terenkripsi tanpa membuka port publik pada router kantor.',
  },
  {
    key: 'INTERNAL_VPN',
    title: 'Internal WireGuard / VPN',
    desc: 'Perangkat teknisi wajib terhubung ke profil VPN perusahaan sebelum mengakses API.',
  },
];

export function NetworkSettingsPanel({
  settings,
  fieldErrors,
  isSuperAdmin,
  handleChange,
}: NetworkSettingsPanelProps) {
  return (
    <section
      className="settings-panel-grid"
      aria-label="Profil, Akses Jaringan & Distribusi APK"
    >
      {/* Left: Workspace Profile & Public Access */}
      <article className="settings-card">
        <header className="settings-card-header">
          <div>
            <h2 className="settings-section-heading">
              Identitas Operasional &amp; Metode Akses Publik
            </h2>
            <p className="settings-section-subheading">
              Profil instansi dan jalur koneksi HTTPS agar aplikasi lapangan dapat mengakses API,
              kamera bukti ukur, serta validasi GPS dengan aman.
            </p>
          </div>
        </header>

        <div className="settings-field-group settings-form-row">
          <label htmlFor="settings-company-name" className="settings-input-label">
            Nama Perusahaan / Unit Operasional
          </label>
          <input
            id="settings-company-name"
            name="companyName"
            type="text"
            value={settings.companyName}
            disabled={!isSuperAdmin}
            aria-invalid={Boolean(fieldErrors.companyName)}
            aria-describedby={fieldErrors.companyName ? 'settings-company-name-err' : undefined}
            onChange={(e) => handleChange('companyName', e.target.value)}
            className={`settings-text-input ${fieldErrors.companyName ? 'ui-input-invalid' : ''}`}
          />
          <FieldError id="settings-company-name-err" message={fieldErrors.companyName} />
        </div>

        <fieldset className="settings-fieldset settings-form-row" disabled={!isSuperAdmin}>
          <legend className="settings-fieldset-legend">Pilihan Metode Akses Publik</legend>
          <div className="settings-three-col-grid">
            {PUBLIC_ACCESS_OPTIONS.map((item) => {
              const selected = settings.publicAccessMethod === item.key;
              return (
                <label
                  key={item.key}
                  className={`settings-option-card ${selected ? 'active' : ''} ${!isSuperAdmin ? 'is-readonly' : ''}`}
                >
                  <input
                    type="radio"
                    name="publicAccessMethod"
                    value={item.key}
                    checked={selected}
                    disabled={!isSuperAdmin}
                    onChange={() => handleChange('publicAccessMethod', item.key)}
                    className="sr-only"
                  />
                  <div className="settings-option-card-top">
                    <span className="settings-option-title">
                      {selected && <Icon name="check" size={13} />}
                      <span>{item.title}</span>
                    </span>
                  </div>
                  <span className="settings-option-desc">{item.desc}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="settings-two-col-grid settings-form-row">
          <div className="settings-field-group">
            <label htmlFor="settings-public-domain" className="settings-input-label">
              Domain / Host URL Sistem Operasional
            </label>
            <input
              id="settings-public-domain"
              name="publicDomain"
              type="url"
              inputMode="url"
              value={settings.publicDomain}
              disabled={!isSuperAdmin}
              aria-invalid={Boolean(fieldErrors.publicDomain)}
              aria-describedby={
                fieldErrors.publicDomain ? 'settings-public-domain-err' : undefined
              }
              onChange={(e) => handleChange('publicDomain', e.target.value)}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className={`settings-text-input mono ${fieldErrors.publicDomain ? 'ui-input-invalid' : ''}`}
            />
            <FieldError id="settings-public-domain-err" message={fieldErrors.publicDomain} />
          </div>

          <div className="settings-field-group">
            <label htmlFor="settings-timezone" className="settings-input-label">
              Zona Waktu Operasional Server
            </label>
            <select
              id="settings-timezone"
              name="serverTimezone"
              value={settings.serverTimezone}
              disabled={!isSuperAdmin}
              onChange={(e) =>
                handleChange(
                  'serverTimezone',
                  e.target.value as SystemSettingsInput['serverTimezone'],
                )
              }
              className="settings-select"
            >
              <option value="Asia/Jakarta">Asia/Jakarta (WIB · UTC+7)</option>
              <option value="Asia/Makassar">Asia/Makassar (WITA · UTC+8)</option>
              <option value="Asia/Jayapura">Asia/Jayapura (WIT · UTC+9)</option>
            </select>
          </div>
        </div>

        {/* Reverse Proxy Reference Parameters */}
        <section
          aria-label="Referensi Parameter Reverse Proxy"
          className="settings-fieldset-divided"
        >
          <h3 className="settings-fieldset-legend">Referensi Parameter Reverse Proxy (Nginx)</h3>
          <div className="settings-two-col-grid">
            <div className="settings-nginx-card">
              <div className="settings-nginx-title">Batas Ukuran Unggah Foto</div>
              <div className="settings-nginx-code">client_max_body_size 20M;</div>
              <div className="settings-nginx-desc">
                Mencegah penolakan ukuran payload saat teknisi mengunggah bukti ukur OPM/ODP.
              </div>
            </div>

            <div className="settings-nginx-card">
              <div className="settings-nginx-title">Buffering Server-Sent Events</div>
              <div className="settings-nginx-code">proxy_buffering off;</div>
              <div className="settings-nginx-desc">
                Memastikan aliran pemantauan langsung (SSE) terkirim instan tanpa tertahan buffer.
              </div>
            </div>
          </div>
        </section>
      </article>

      {/* Right: Mobile Distribution & Self-Hosted OTA Update */}
      <div className="settings-col-stack">
        <aside aria-label="Distribusi Mobile & Pembaruan OTA Internal" className="settings-card">
          <header className="settings-card-header">
            <div>
              <h3 className="settings-section-heading">
                Distribusi Mobile &amp; Pembaruan OTA Internal
              </h3>
              <p className="settings-section-subheading">
                Pembaruan aplikasi lapangan langsung melalui server internal tanpa instal ulang
                manual berkas APK pada perangkat teknisi.
              </p>
            </div>
            <span className="settings-status-pill healthy">OTA Aktif</span>
          </header>

          <div className="settings-col-stack-sm">
            <div className="settings-field-group">
              <label htmlFor="settings-apk-url" className="settings-input-label">
                Portal Unduh APK Internal Resmi
              </label>
              <input
                id="settings-apk-url"
                name="apkDownloadUrl"
                type="url"
                inputMode="url"
                value={settings.apkDownloadUrl ?? ''}
                disabled={!isSuperAdmin}
                aria-invalid={Boolean(fieldErrors.apkDownloadUrl)}
                aria-describedby={fieldErrors.apkDownloadUrl ? 'settings-apk-url-err' : undefined}
                placeholder="https://ftth-ops.lintasarta.co.id/download/technician-latest.apk"
                onChange={(e) => handleChange('apkDownloadUrl', e.target.value)}
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                className={`settings-text-input mono ${fieldErrors.apkDownloadUrl ? 'ui-input-invalid' : ''}`}
              />
              <FieldError id="settings-apk-url-err" message={fieldErrors.apkDownloadUrl} />
            </div>

            <div className="settings-field-group">
              <label htmlFor="settings-ota-url" className="settings-input-label">
                Endpoint Manifest Self-Hosted OTA
              </label>
              <input
                id="settings-ota-url"
                name="otaUpdateUrl"
                type="url"
                inputMode="url"
                value={settings.otaUpdateUrl ?? ''}
                disabled={!isSuperAdmin}
                aria-invalid={Boolean(fieldErrors.otaUpdateUrl)}
                aria-describedby={fieldErrors.otaUpdateUrl ? 'settings-ota-url-err' : undefined}
                placeholder="https://ftth-ops.lintasarta.co.id/api/v1/ota/manifest"
                onChange={(e) => handleChange('otaUpdateUrl', e.target.value)}
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                className={`settings-text-input mono ${fieldErrors.otaUpdateUrl ? 'ui-input-invalid' : ''}`}
              />
              <FieldError id="settings-ota-url-err" message={fieldErrors.otaUpdateUrl} />
            </div>

            <div className="settings-ota-info-box">
              Aplikasi mobile secara otomatis memeriksa endpoint manifest di atas saat dibuka.
              Pembaruan antarmuka dan perbaikan bug dapat diunduh di latar belakang secara aman.
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
