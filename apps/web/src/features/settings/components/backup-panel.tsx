'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { FieldError } from '@/components/ui/FieldError';
import { SystemSettingsInput, SystemTelemetryData } from '@repo/shared';
import type { SettingsFieldErrors } from '../hooks/use-settings';

export interface BackupPanelProps {
  settings: SystemSettingsInput;
  telemetry: SystemTelemetryData | null;
  fieldErrors: SettingsFieldErrors;
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
  fieldErrors,
  isBackingUp,
  isSuperAdmin,
  onTriggerBackup,
  handleChange,
}: BackupPanelProps) {
  const backupHistory = telemetry?.backupHistory ?? [];

  return (
    <section aria-label="Disaster Recovery & Backup 3-2-1" className="settings-col-stack">
      {/* Top 3-2-1 Architecture & Schedule Card */}
      <article className="settings-card">
        <header className="settings-card-header">
          <div>
            <h2 className="settings-section-heading">Strategi Disaster Recovery 3-2-1</h2>
            <p className="settings-section-subheading">
              Perlindungan master data operasional terhadap kegagalan perangkat keras dengan 3
              salinan data, 2 media penyimpanan, dan 1 salinan luar lokasi.
            </p>
          </div>

          <button
            type="button"
            onClick={onTriggerBackup}
            disabled={isBackingUp || !isSuperAdmin}
            className="settings-backup-trigger-btn"
          >
            <Icon name="refresh" size={14} className={isBackingUp ? 'icon-spin' : ''} />
            <span>{isBackingUp ? 'Memproses Snapshot...' : 'Jalankan Backup Sekarang'}</span>
          </button>
        </header>

        {/* 3-2-1 Architecture Info Strip */}
        <div className="settings-three-col-grid settings-form-row">
          <div className="settings-architecture-card">
            <div className="settings-architecture-title">3 SALINAN DATA</div>
            <div className="settings-architecture-desc">
              Database utama aktif, arsip snapshot harian terenkripsi, dan replika penyimpanan
              cadangan.
            </div>
          </div>

          <div className="settings-architecture-card">
            <div className="settings-architecture-title">2 MEDIA BERBEDA</div>
            <div className="settings-architecture-desc">
              Penyimpanan internal server aplikasi serta media arsip terpisah (NAS / S3 Bucket).
            </div>
          </div>

          <div className="settings-architecture-card">
            <div className="settings-architecture-title">1 SALINAN OFF-SITE</div>
            <div className="settings-architecture-desc">
              Salinan cadangan disimpan di luar lokasi server utama untuk ketahanan terhadap insiden
              fisik.
            </div>
          </div>
        </div>

        {/* Backup Settings Form */}
        <fieldset
          aria-label="Jadwal dan Target Penyimpanan Backup"
          className="settings-fieldset"
          disabled={!isSuperAdmin}
        >
          <div className="settings-two-col-grid settings-form-row">
            <div className="settings-field-group">
              <label htmlFor="settings-cron-schedule" className="settings-input-label">
                Jadwal Cronjob Otomatis Harian
              </label>
              <input
                id="settings-cron-schedule"
                name="cronSchedule"
                type="text"
                value={settings.cronSchedule}
                disabled={!isSuperAdmin}
                aria-invalid={Boolean(fieldErrors.cronSchedule)}
                aria-describedby={
                  fieldErrors.cronSchedule ? 'settings-cron-schedule-err' : undefined
                }
                onChange={(e) => handleChange('cronSchedule', e.target.value)}
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                className={`settings-text-input mono ${fieldErrors.cronSchedule ? 'ui-input-invalid' : ''}`}
              />
              <span className="settings-field-helper">
                Contoh pukul 02:00 WIB setiap hari:{' '}
                <code className="settings-inline-code">0 2 * * *</code>
              </span>
              <FieldError id="settings-cron-schedule-err" message={fieldErrors.cronSchedule} />
            </div>

            <div className="settings-field-group">
              <label htmlFor="settings-backup-target" className="settings-input-label">
                Target Penyimpanan Kedua
              </label>
              <select
                id="settings-backup-target"
                name="secondaryBackupTarget"
                value={settings.secondaryBackupTarget}
                disabled={!isSuperAdmin}
                onChange={(e) =>
                  handleChange(
                    'secondaryBackupTarget',
                    e.target.value as
                      | 'EXTERNAL_NAS'
                      | 'ENCRYPTED_CLOUD_BUCKET'
                      | 'OFFLINE_COLD_STORAGE',
                  )
                }
                className="settings-select"
              >
                <option value="EXTERNAL_NAS">NAS Eksternal (Gedung Terpisah · Rekomendasi)</option>
                <option value="ENCRYPTED_CLOUD_BUCKET">
                  Cloud Storage Bucket Terenkripsi (Kompatibel S3)
                </option>
                <option value="OFFLINE_COLD_STORAGE">Cold Offline Hard Drive Vault</option>
              </select>
            </div>
          </div>

          <div className="settings-field-group settings-form-row">
            <label htmlFor="settings-storage-path" className="settings-input-label">
              Lokasi / Path Penyimpanan Cadangan
            </label>
            <input
              id="settings-storage-path"
              name="secondaryStoragePath"
              type="text"
              value={settings.secondaryStoragePath}
              disabled={!isSuperAdmin}
              aria-invalid={Boolean(fieldErrors.secondaryStoragePath)}
              aria-describedby={
                fieldErrors.secondaryStoragePath ? 'settings-storage-path-err' : undefined
              }
              onChange={(e) => handleChange('secondaryStoragePath', e.target.value)}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className={`settings-text-input mono ${fieldErrors.secondaryStoragePath ? 'ui-input-invalid' : ''}`}
            />
            <FieldError
              id="settings-storage-path-err"
              message={fieldErrors.secondaryStoragePath}
            />
          </div>

          <div className="settings-switch-row settings-fieldset-divided">
            <div className="settings-switch-copy">
              <label htmlFor="settings-backup-encryption" className="settings-switch-title">
                Enkripsi &amp; Kompresi Arsip Cadangan (AES-256-GCM)
              </label>
              <span className="settings-field-helper">
                Mengompresi snapshot menggunakan gzip lalu mengenkripsinya dengan kunci server
                sebelum disimpan ke media cadangan.
              </span>
            </div>
            <input
              id="settings-backup-encryption"
              name="compressionEncrypted"
              type="checkbox"
              role="switch"
              checked={settings.compressionEncrypted}
              disabled={!isSuperAdmin}
              onChange={(e) => handleChange('compressionEncrypted', e.target.checked)}
              className="settings-switch"
              {...({ switch: '' } as Record<string, string>)}
            />
          </div>
        </fieldset>
      </article>

      {/* Snapshot History Table */}
      <article className="settings-card">
        <header className="settings-card-header">
          <div>
            <h3 className="settings-section-heading">Riwayat Snapshot Backup Terenkripsi</h3>
            <p className="settings-section-subheading">
              Catatan arsip snapshot terakhir beserta ukuran berkas dan status sinkronisasi.
            </p>
          </div>
          <span className="settings-subtext-mono">{backupHistory.length} arsip tercatat</span>
        </header>

        {backupHistory.length === 0 ? (
          <EmptyState
            icon="download"
            title="Belum ada riwayat cadangan"
            description="Belum terdapat arsip snapshot yang tercatat pada server. Jalankan pencadangan manual pertama atau tunggu jadwal cron harian."
            size="compact"
            action={
              isSuperAdmin
                ? {
                    label: isBackingUp ? 'Memproses...' : 'Jalankan Backup Pertama',
                    onClick: onTriggerBackup,
                    icon: 'refresh',
                    variant: 'primary',
                  }
                : undefined
            }
          />
        ) : (
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Tabel Riwayat Snapshot Backup"
          >
            <table className="lintasarta-table settings-backup-table">
              <thead>
                <tr className="settings-table-header-row">
                  <th scope="col">Waktu Eksekusi</th>
                  <th scope="col">Nama Berkas</th>
                  <th scope="col">Ukuran</th>
                  <th scope="col">Foto Disinkronkan</th>
                  <th scope="col">Target Sinkronisasi</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {backupHistory.map((b) => {
                  const badgeTone =
                    b.status === 'FAILED'
                      ? 'critical'
                      : b.status === 'IN_PROGRESS'
                        ? 'warning'
                        : 'healthy';
                  const badgeLabel =
                    b.status === 'FAILED'
                      ? 'Gagal'
                      : b.status === 'IN_PROGRESS'
                        ? 'Memproses'
                        : 'Tersinkron';

                  return (
                    <tr key={b.id} className="settings-table-row">
                      <td className="settings-td-time">{b.timestamp}</td>
                      <td className="settings-file-mono">{b.filename}</td>
                      <td className="settings-td-num">{b.sizeMb} MB</td>
                      <td className="settings-td-num">{b.photosCount} Foto</td>
                      <td>{b.target}</td>
                      <td>
                        <span className={`settings-status-pill ${badgeTone}`}>{badgeLabel}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  );
}
