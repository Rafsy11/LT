'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { FieldError } from '@/components/ui/FieldError';
import { SystemSettingsInput } from '@repo/shared';
import type { SettingsFieldErrors } from '../hooks/use-settings';

export interface GeofencingPanelProps {
  settings: SystemSettingsInput;
  fieldErrors: SettingsFieldErrors;
  isSuperAdmin: boolean;
  handleChange: <K extends keyof SystemSettingsInput>(
    field: K,
    value: SystemSettingsInput[K],
  ) => void;
}

const RADIUS_PRESETS = [
  {
    val: 50,
    title: '50 Meter',
    desc: 'Kawasan perkotaan padat dan deretan ruko dengan jarak tiang berdekatan.',
  },
  {
    val: 100,
    title: '100 Meter (Rekomendasi)',
    desc: 'Standar toleransi operasional FTTH untuk akurasi GPS lapangan.',
  },
  {
    val: 200,
    title: '200 Meter',
    desc: 'Wilayah sub-urban dan area dengan jarak antar tiang ODP lebih renggang.',
  },
] as const;

export function GeofencingPanel({
  settings,
  fieldErrors,
  isSuperAdmin,
  handleChange,
}: GeofencingPanelProps) {
  return (
    <section
      className="settings-panel-grid"
      aria-label="Validasi Lapangan & Geofencing"
    >
      {/* Left: Geofencing Radius & Location Policy */}
      <article className="settings-card">
        <header className="settings-card-header">
          <div>
            <h2 className="settings-section-heading">
              Batas Toleransi Geofencing Teknisi Lapangan
            </h2>
            <p className="settings-section-subheading">
              Jarak maksimal yang diizinkan antara koordinat GPS perangkat teknisi dengan titik
              tiang ODP saat mengirim laporan penyelesaian.
            </p>
          </div>
          <span className="settings-version-pill">{settings.geofenceRadiusMeters} m</span>
        </header>

        {/* 3 Radius Preset Radio Cards */}
        <fieldset className="settings-fieldset" disabled={!isSuperAdmin}>
          <legend className="settings-fieldset-legend">Preset Radius ODP</legend>
          <div className="settings-three-col-grid">
            {RADIUS_PRESETS.map((item) => {
              const selected = settings.geofenceRadiusMeters === item.val;
              return (
                <label
                  key={item.val}
                  className={`settings-option-card ${selected ? 'active' : ''} ${!isSuperAdmin ? 'is-readonly' : ''}`}
                >
                  <input
                    type="radio"
                    name="geofenceRadiusPreset"
                    value={item.val}
                    checked={selected}
                    disabled={!isSuperAdmin}
                    onChange={() => handleChange('geofenceRadiusMeters', item.val)}
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

        {/* Custom Radius Meter Input */}
        <div className="settings-field-group settings-form-row">
          <label htmlFor="settings-geofence-radius" className="settings-input-label">
            Radius Kustom (10 – 1000 Meter)
          </label>
          <div className="settings-input-unit-row">
            <input
              id="settings-geofence-radius"
              name="geofenceRadiusMeters"
              type="number"
              min={10}
              max={1000}
              value={
                Number.isNaN(settings.geofenceRadiusMeters) ? '' : settings.geofenceRadiusMeters
              }
              disabled={!isSuperAdmin}
              aria-invalid={Boolean(fieldErrors.geofenceRadiusMeters)}
              aria-describedby={
                fieldErrors.geofenceRadiusMeters ? 'settings-geofence-radius-err' : undefined
              }
              onChange={(e) => {
                const parsed = Number.parseInt(e.target.value, 10);
                handleChange('geofenceRadiusMeters', Number.isNaN(parsed) ? 0 : parsed);
              }}
              className={`settings-number-input ${fieldErrors.geofenceRadiusMeters ? 'ui-input-invalid' : ''}`}
            />
            <span className="settings-subtext-mono">meter dari koordinat ODP</span>
          </div>
          <FieldError
            id="settings-geofence-radius-err"
            message={fieldErrors.geofenceRadiusMeters}
          />
        </div>

        {/* Policy Selection */}
        <fieldset className="settings-fieldset settings-fieldset-divided" disabled={!isSuperAdmin}>
          <legend className="settings-fieldset-legend">
            Kebijakan Penanganan Laporan di Luar Radius ODP
          </legend>
          <p className="settings-field-helper">
            Tindakan sistem saat lokasi pengiriman laporan teknisi berada di luar batas radius.
          </p>

          <div className="settings-radio-stack">
            <label
              className={`settings-policy-radio-card ${settings.locationViolationPolicy === 'SOFT_WARNING' ? 'active' : ''} ${!isSuperAdmin ? 'is-readonly' : ''}`}
            >
              <input
                type="radio"
                name="locationViolationPolicy"
                value="SOFT_WARNING"
                checked={settings.locationViolationPolicy === 'SOFT_WARNING'}
                disabled={!isSuperAdmin}
                onChange={() => handleChange('locationViolationPolicy', 'SOFT_WARNING')}
              />
              <div>
                <div className="settings-policy-radio-title">
                  Tandai Anomali untuk Ditinjau Admin (Peringatan Lunak)
                </div>
                <div className="settings-policy-radio-desc">
                  Laporan tetap diterima agar pekerjaan lapangan tidak terhenti, namun ditandai
                  khusus pada halaman Pantauan Langsung untuk diverifikasi NOC.
                </div>
              </div>
            </label>

            <label
              className={`settings-policy-radio-card ${settings.locationViolationPolicy === 'HARD_BLOCK' ? 'active' : ''} ${!isSuperAdmin ? 'is-readonly' : ''}`}
            >
              <input
                type="radio"
                name="locationViolationPolicy"
                value="HARD_BLOCK"
                checked={settings.locationViolationPolicy === 'HARD_BLOCK'}
                disabled={!isSuperAdmin}
                onChange={() => handleChange('locationViolationPolicy', 'HARD_BLOCK')}
              />
              <div>
                <div className="settings-policy-radio-title">
                  Tolak Pengiriman Secara Langsung (Blokir Ketat)
                </div>
                <div className="settings-policy-radio-desc">
                  Server menolak laporan dan aplikasi lapangan meminta teknisi berpindah mendekati
                  lokasi tiang ODP yang sesuai sebelum mengirim ulang.
                </div>
              </div>
            </label>
          </div>
        </fieldset>
      </article>

      {/* Right: Security & App Version Gate */}
      <div className="settings-col-stack">
        <aside aria-label="Perlindungan Integritas & Anti-Fake GPS" className="settings-card">
          <header className="settings-card-header">
            <div>
              <h3 className="settings-section-heading">
                Perlindungan Integritas &amp; Anti-Fake GPS
              </h3>
              <p className="settings-section-subheading">
                Pengamanan aplikasi lapangan terhadap manipulasi koordinat dan versi aplikasi usang.
              </p>
            </div>
          </header>

          <div className="settings-switch-row">
            <div className="settings-switch-copy">
              <label htmlFor="settings-block-mock-gps" className="settings-switch-title">
                Kunci Otomatis jika Terdeteksi Lokasi Palsu (Mock GPS)
              </label>
              <span className="settings-field-helper">
                Memeriksa sinyal sistem perangkat (
                <code className="settings-inline-code">location.mocked</code>). Tombol kirim
                laporan dikunci seketika apabila aplikasi pengubah lokasi aktif.
              </span>
            </div>
            <input
              id="settings-block-mock-gps"
              name="blockMockLocation"
              type="checkbox"
              role="switch"
              checked={settings.blockMockLocation}
              disabled={!isSuperAdmin}
              onChange={(e) => handleChange('blockMockLocation', e.target.checked)}
              className="settings-switch"
              {...({ switch: '' } as Record<string, string>)}
            />
          </div>

          <div className="settings-field-group settings-fieldset-divided">
            <label htmlFor="settings-min-app-version" className="settings-input-label">
              Versi Minimum Aplikasi Mobile (App Version Gate)
            </label>
            <p className="settings-field-helper">
              Aplikasi teknisi dengan header{' '}
              <code className="settings-inline-code">X-App-Version</code> lebih rendah dari versi
              ini akan diminta memperbarui aplikasi terlebih dahulu.
            </p>
            <input
              id="settings-min-app-version"
              name="minAppVersion"
              type="text"
              value={settings.minAppVersion}
              disabled={!isSuperAdmin}
              aria-invalid={Boolean(fieldErrors.minAppVersion)}
              aria-describedby={
                fieldErrors.minAppVersion ? 'settings-min-app-version-err' : undefined
              }
              onChange={(e) => handleChange('minAppVersion', e.target.value)}
              placeholder="1.0.0"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className={`settings-mono-input settings-version-input ${fieldErrors.minAppVersion ? 'ui-input-invalid' : ''}`}
            />
            <FieldError id="settings-min-app-version-err" message={fieldErrors.minAppVersion} />
          </div>
        </aside>
      </div>
    </section>
  );
}
