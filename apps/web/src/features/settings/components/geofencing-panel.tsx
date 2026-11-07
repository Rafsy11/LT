'use client';

import React from 'react';
import { SystemSettingsInput } from '@repo/shared';

export interface GeofencingPanelProps {
  settings: SystemSettingsInput;
  isSuperAdmin: boolean;
  handleChange: <K extends keyof SystemSettingsInput>(
    field: K,
    value: SystemSettingsInput[K],
  ) => void;
}

export function GeofencingPanel({ settings, isSuperAdmin, handleChange }: GeofencingPanelProps) {
  return (
    <section
      className="settings-panel-grid"
      aria-label="Validasi Lapangan & Geofencing"
    >
      {/* Left: Geofencing Radius & Location Policy */}
      <article className="settings-card">
        <header>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#182230', margin: '0 0 4px 0' }}>
            Batas Toleransi Geofencing Teknisi Lapangan
          </h2>
          <p style={{ fontSize: '12.5px', color: '#515a62', margin: '0 0 16px 0' }}>
            Jarak maksimal yang diizinkan antara koordinat GPS ponsel teknisi dengan koordinat tiang
            ODP saat menekan tombol Submit.
          </p>
        </header>

        {/* 3 Radius Option Cards */}
        <fieldset
          aria-label="Batas Jarak Radius ODP"
          style={{
            border: 0,
            margin: 0,
            padding: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '10px',
            marginBottom: '22px',
          }}
        >
          {[
            {
              val: 50,
              title: '50 Meter',
              desc: 'Kawasan perkotaan padat & perumahan ruko sempit.',
            },
            {
              val: 100,
              title: '100 Meter (Rekomendasi)',
              desc: 'Standar toleransi operasional FTTH umum.',
            },
            {
              val: 200,
              title: '200 Meter',
              desc: 'Wilayah sub-urban dan pedesaan dengan titik tiang berjauhan.',
            },
          ].map((item) => (
            <div
              key={item.val}
              onClick={() => isSuperAdmin && handleChange('geofenceRadiusMeters', item.val)}
              className={`settings-option-card ${settings.geofenceRadiusMeters === item.val ? 'active' : ''}`}
              style={{
                cursor: isSuperAdmin ? 'pointer' : 'default',
              }}
            >
              <div className="settings-option-title">
                {item.title}
              </div>
              <div className="settings-option-desc">
                {item.desc}
              </div>
            </div>
          ))}
        </fieldset>

        {/* Policy Selection */}
        <fieldset
          aria-label="Kebijakan Penanganan Laporan di Luar Radius"
          style={{ border: 0, margin: 0, padding: 0, borderTop: '1px solid #edf2f7', paddingTop: '18px' }}
        >
          <legend
            style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 600,
              color: '#182230',
              marginBottom: '4px',
            }}
          >
            Kebijakan Penanganan Laporan di Luar Radius ODP
          </legend>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px 0' }}>
            Respon sistem saat teknisi berada di luar radius geofencing yang telah dikonfigurasi.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label
              className={`settings-policy-radio-card ${settings.locationViolationPolicy === 'SOFT_WARNING' ? 'active' : ''}`}
              style={{ cursor: isSuperAdmin ? 'pointer' : 'default' }}
            >
              <input
                type="radio"
                name="policy"
                checked={settings.locationViolationPolicy === 'SOFT_WARNING'}
                disabled={!isSuperAdmin}
                onChange={() => handleChange('locationViolationPolicy', 'SOFT_WARNING')}
                style={{ marginTop: '2px' }}
              />
              <div>
                <div className="settings-policy-radio-title">
                  Tandai untuk Ditinjau Admin (Soft Warning · LOCATION_MISMATCH_WARNING)
                </div>
                <div className="settings-policy-radio-desc">
                  Laporan tetap tersimpan ke PostgreSQL agar pekerjaan lapangan tidak tertunda,
                  namun disorot dengan badge merah pada Live Monitoring untuk verifikasi Admin/NOC.
                </div>
              </div>
            </label>

            <label
              className={`settings-policy-radio-card ${settings.locationViolationPolicy === 'HARD_BLOCK' ? 'active' : ''}`}
              style={{ cursor: isSuperAdmin ? 'pointer' : 'default' }}
            >
              <input
                type="radio"
                name="policy"
                checked={settings.locationViolationPolicy === 'HARD_BLOCK'}
                disabled={!isSuperAdmin}
                onChange={() => handleChange('locationViolationPolicy', 'HARD_BLOCK')}
                style={{ marginTop: '2px' }}
              />
              <div>
                <div className="settings-policy-radio-title">
                  Tolak Laporan Langsung (Hard Block · HTTP 400 Out of Geofence)
                </div>
                <div className="settings-policy-radio-desc">
                  Backend langsung menolak transaksi dan aplikasi mobile menampilkan peringatan agar
                  teknisi berpindah mendekati tiang ODP yang benar sebelum mengirim data.
                </div>
              </div>
            </label>
          </div>
        </fieldset>
      </article>

      {/* Right: Security & App Version Gate */}
      <aside
        aria-label="Perlindungan Integritas & Anti-Fake GPS"
        style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
      >
        <article className="settings-card">
          <header>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#182230', margin: '0 0 12px 0' }}>
              Perlindungan Integritas &amp; Anti-Fake GPS
            </h3>
          </header>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                fontSize: '12.5px',
                color: '#334155',
              }}
            >
              <input
                type="checkbox"
                checked={settings.blockMockLocation}
                disabled={!isSuperAdmin}
                onChange={(e) => handleChange('blockMockLocation', e.target.checked)}
                style={{ width: '16px', height: '16px', marginTop: '2px' }}
              />
              <div>
                <span style={{ fontWeight: 600, color: '#182230', display: 'block' }}>
                  Kunci Otomatis Aplikasi jika Terdeteksi Mock Location
                </span>
                <span
                  style={{
                    fontSize: '12px',
                    color: '#64748b',
                    lineHeight: 1.4,
                    display: 'block',
                    marginTop: '2px',
                  }}
                >
                  Memeriksa bendera sistem operasi Android (
                  <code className="settings-inline-code">location.mocked</code>
                  ). Tombol submit dikunci seketika jika aplikasi fake GPS aktif.
                </span>
              </div>
            </label>

            <div style={{ borderTop: '1px solid #edf2f7', paddingTop: '14px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: 'inherit',
                  marginBottom: '4px',
                }}
              >
                Batas Versi Minimum Aplikasi Mobile (App Version Gate)
              </label>
              <p style={{ fontSize: '11.5px', color: '#64748b', margin: '0 0 8px 0' }}>
                Request dari aplikasi mobile yang menyertakan header{' '}
                <code className="settings-inline-code">X-App-Version</code> di
                bawah versi ini akan menerima respon <b>HTTP 426 Upgrade Required</b>.
              </p>
              <input
                type="text"
                value={settings.minAppVersion}
                disabled={!isSuperAdmin}
                onChange={(e) => handleChange('minAppVersion', e.target.value)}
                placeholder="1.0.0"
                className="settings-mono-input"
                style={{
                  width: '120px',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                }}
              />
            </div>
          </div>
        </article>
      </aside>
    </section>
  );
}
