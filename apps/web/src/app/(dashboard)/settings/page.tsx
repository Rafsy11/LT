'use client';

import React, { useState } from 'react';

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);

  return (
    <main>
      <div className="page-heading">
        <div>
          <div className="eyebrow">KONFIGURASI SISTEM ON-PREMISE</div>
          <h1>Pengaturan Workspace</h1>
          <p>Parameter operasional, batasan geofencing anti-fake GPS, dan ambang batas redaman.</p>
        </div>
      </div>

      <section className="panel settings-content" style={{ marginTop: '20px' }}>
        <h2>Preferensi Umum</h2>
        <p>Identitas workspace dan zona waktu server operasional.</p>
        <form
          className="settings-form"
          onSubmit={(e) => {
            e.preventDefault();
            setSaved(true);
          }}
        >
          <label>
            Nama Perusahaan / ISP
            <input defaultValue="Nusantara Network" required onChange={() => setSaved(false)} />
          </label>
          <label>
            Zona Waktu Server
            <select>
              <option>Asia/Jakarta (WIB · UTC+7)</option>
              <option>Asia/Makassar (WITA · UTC+8)</option>
              <option>Asia/Jayapura (WIT · UTC+9)</option>
            </select>
          </label>

          <div className="settings-divider" />

          <h2>Validasi Lapangan & Geofencing (PRD 3.3)</h2>
          <label>
            Radius Geofencing Toleransi GPS (meter)
            <input type="number" min="10" max="1000" defaultValue="100" required />
          </label>
          <label>
            Penanganan Lokasi di Luar Radius ODP/Splitter
            <select>
              <option>Tandai untuk ditinjau Admin (Soft Warning)</option>
              <option>Tolak laporan langsung (Hard Block)</option>
            </select>
          </label>

          <div className="settings-divider" />

          <h2>Notifikasi & Peringatan Otomatis</h2>
          <label className="check-setting">
            <input type="checkbox" defaultChecked />
            Notifikasi redaman kritis (&lt; -25 dBm) ke SSE Live Feed
          </label>
          <label className="check-setting">
            <input type="checkbox" defaultChecked />
            Peringatan otomatis saat teknisi terdeteksi Mock Location / Fake GPS
          </label>

          <div className="info-strip">
            Parameter ini mengontrol validasi backend di apps/web/src/services/ticket.service.ts saat teknisi mengirim data dari aplikasi mobile.
          </div>

          <button className="button primary" type="submit">
            Simpan Pengaturan
          </button>

          {saved && (
            <p className="save-feedback" role="status">
              ✓ Pengaturan konfigurasi operasional berhasil disimpan.
            </p>
          )}
        </form>
      </section>
    </main>
  );
}
