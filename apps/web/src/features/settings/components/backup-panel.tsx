'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { SystemSettingsInput, SystemTelemetryData } from '@repo/shared';

export interface BackupPanelProps {
  settings: SystemSettingsInput;
  telemetry: SystemTelemetryData | null;
  isBackingUp: boolean;
  isSuperAdmin: boolean;
  onTriggerBackup: () => void;
  handleChange: <K extends keyof SystemSettingsInput>(
    field: K,
    value: SystemSettingsInput[K],
  ) => void;
}

export function BackupPanel({
  settings,
  telemetry,
  isBackingUp,
  isSuperAdmin,
  onTriggerBackup,
  handleChange,
}: BackupPanelProps) {
  return (
    <section
      aria-label="Disaster Recovery & Backup 3-2-1"
      style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
    >
      {/* Top 3-2-1 Architecture Strip */}
      <article
        style={{
          background: '#ffffff',
          border: '1px solid #e2ecf2',
          borderRadius: '8px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(27, 92, 162, 0.02)',
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '16px',
          }}
        >
          <div>
            <h2
              style={{ fontSize: '15px', fontWeight: 600, color: '#182230', margin: '0 0 4px 0' }}
            >
              Strategi Disaster Recovery 3-2-1
            </h2>
            <p style={{ fontSize: '12.5px', color: '#515a62', margin: 0 }}>
              Perlindungan master data FTTH terhadap kegagalan hardware fisik dengan 3 salinan data,
              2 media penyimpanan, dan 1 salinan off-site.
            </p>
          </div>

          <button
            type="button"
            onClick={onTriggerBackup}
            disabled={isBackingUp || !isSuperAdmin}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              background: '#0e5b92',
              color: '#ffffff',
              fontSize: '12.5px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              cursor: isBackingUp || !isSuperAdmin ? 'not-allowed' : 'pointer',
              opacity: isBackingUp ? 0.7 : 1,
              boxShadow: '0 1px 3px rgba(14, 91, 146, 0.25)',
            }}
          >
            <Icon name="refresh" size={14} className={isBackingUp ? 'spin' : ''} />
            <span>{isBackingUp ? 'Memproses Snapshot...' : 'Jalankan Backup Sekarang'}</span>
          </button>
        </header>

        {/* 3-2-1 Architecture Pill Cards */}
        <section
          aria-label="Arsitektur 3-2-1"
          className="settings-three-col-grid"
          style={{ marginBottom: '20px' }}
        >
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #eef2f6',
              borderRadius: '6px',
              padding: '12px',
            }}
          >
            <div
              style={{ fontSize: '11px', fontWeight: 700, color: '#0e5b92', marginBottom: '3px' }}
            >
              3 SALINAN DATA
            </div>
            <div style={{ fontSize: '12px', color: '#334155', lineHeight: 1.4 }}>
              Database Utama PostgreSQL + Snapshot Harian Terenkripsi + Replika Remote NAS.
            </div>
          </div>

          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #eef2f6',
              borderRadius: '6px',
              padding: '12px',
            }}
          >
            <div
              style={{ fontSize: '11px', fontWeight: 700, color: '#0e5b92', marginBottom: '3px' }}
            >
              2 MEDIA BERBEDA
            </div>
            <div style={{ fontSize: '12px', color: '#334155', lineHeight: 1.4 }}>
              Penyimpanan Internal NVMe SSD Server + Storage Appliance Terpisah (NAS/S3).
            </div>
          </div>

          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #eef2f6',
              borderRadius: '6px',
              padding: '12px',
            }}
          >
            <div
              style={{ fontSize: '11px', fontWeight: 700, color: '#0e5b92', marginBottom: '3px' }}
            >
              1 SALINAN OFF-SITE
            </div>
            <div style={{ fontSize: '12px', color: '#334155', lineHeight: 1.4 }}>
              Penyimpanan cadangan ditempatkan di luar gedung server utama untuk proteksi bencana
              fisik.
            </div>
          </div>
        </section>

        {/* Backup Settings Form */}
        <fieldset
          aria-label="Jadwal dan Target Penyimpanan Backup"
          style={{ border: 0, margin: 0, padding: 0 }}
        >
          <div
            className="settings-two-col-grid"
            style={{ marginBottom: '14px' }}
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
                Jadwal Cronjob Otomatis Harian
              </label>
              <input
                type="text"
                value={settings.cronSchedule}
                disabled={!isSuperAdmin}
                onChange={(e) => handleChange('cronSchedule', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #dce7f0',
                  fontSize: '12.5px',
                  fontFamily: 'monospace',
                  color: '#182230',
                }}
              />
              <span
                style={{ fontSize: '11.5px', color: '#64748b', display: 'block', marginTop: '4px' }}
              >
                Format cron: Pukul 02:00 WIB dini hari (
                <code style={{ background: '#f1f5f9', padding: '1px 4px' }}>0 2 * * *</code>)
              </span>
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
                Target Penyimpanan Kedua
              </label>
              <select
                value={settings.secondaryBackupTarget}
                disabled={!isSuperAdmin}
                onChange={(e) => handleChange('secondaryBackupTarget', e.target.value as any)}
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
                <option value="EXTERNAL_NAS">NAS Eksternal (Gedung Terpisah · Rekomendasi)</option>
                <option value="ENCRYPTED_CLOUD_BUCKET">
                  Encrypted Cloud Storage Bucket (S3 Compatible)
                </option>
                <option value="OFFLINE_COLD_STORAGE">Cold Offline Hard Drive Vault</option>
              </select>
            </div>
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
              Lokasi / Path Penyimpanan Cadangan
            </label>
            <input
              type="text"
              value={settings.secondaryStoragePath}
              disabled={!isSuperAdmin}
              onChange={(e) => handleChange('secondaryStoragePath', e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #dce7f0',
                fontSize: '12.5px',
                fontFamily: 'monospace',
                color: '#182230',
              }}
            />
          </div>
        </fieldset>
      </article>

      {/* Snapshot History Table */}
      <article
        style={{
          background: '#ffffff',
          border: '1px solid #e2ecf2',
          borderRadius: '8px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(27, 92, 162, 0.02)',
        }}
      >
        <header>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#182230', margin: '0 0 12px 0' }}>
            Riwayat Snapshot Backup Terenkripsi
          </h3>
        </header>

        <div
          className="table-scroll"
          style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}
          tabIndex={0}
          role="region"
          aria-label="Tabel Riwayat Snapshot Backup"
        >
          <table
            className="lintasarta-table"
            style={{
              width: '100%',
              minWidth: '640px',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '12px',
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid #e2ecf2',
                  background: '#f8fafc',
                  color: '#64748b',
                }}
              >
                <th scope="col" style={{ padding: '8px 12px', fontWeight: 600 }}>
                  Waktu Eksekusi
                </th>
                <th scope="col" style={{ padding: '8px 12px', fontWeight: 600 }}>
                  Nama Berkas
                </th>
                <th scope="col" style={{ padding: '8px 12px', fontWeight: 600 }}>
                  Ukuran
                </th>
                <th scope="col" style={{ padding: '8px 12px', fontWeight: 600 }}>
                  Foto Disinkronkan
                </th>
                <th scope="col" style={{ padding: '8px 12px', fontWeight: 600 }}>
                  Target Sinkronisasi
                </th>
                <th scope="col" style={{ padding: '8px 12px', fontWeight: 600 }}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {telemetry?.backupHistory.map((b) => (
                <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '9px 12px', color: '#182230', fontWeight: 500 }}>
                    {b.timestamp}
                  </td>
                  <td style={{ padding: '9px 12px', fontFamily: 'monospace', color: '#0e5b92' }}>
                    {b.filename}
                  </td>
                  <td style={{ padding: '9px 12px', color: '#475569' }}>{b.sizeMb} MB</td>
                  <td style={{ padding: '9px 12px', color: '#475569' }}>
                    {b.photosCount} Foto MinIO
                  </td>
                  <td style={{ padding: '9px 12px', color: '#64748b' }}>{b.target}</td>
                  <td style={{ padding: '9px 12px' }}>
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 600,
                        padding: '2px 7px',
                        borderRadius: '4px',
                        background: '#dcfce7',
                        color: '#056434',
                      }}
                    >
                      Tersinkron
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
