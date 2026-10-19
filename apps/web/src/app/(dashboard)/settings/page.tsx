'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/ui/ToastProvider';
import { Icon } from '@/components/ui/Icon';
import {
  SystemSettingsInput,
  SystemTelemetryData,
  BackupSnapshotItem,
} from '@repo/shared';

type SettingsTab = 'infrastruktur' | 'geofencing' | 'backup' | 'jaringan';

const INITIAL_FALLBACK_SETTINGS: SystemSettingsInput = {
  companyName: 'Lintasarta Nusantara Network',
  serverTimezone: 'Asia/Jakarta',
  publicAccessMethod: 'STATIC_IP_HTTPS',
  publicDomain: 'https://ftth-ops.lintasarta.co.id',
  geofenceRadiusMeters: 100,
  locationViolationPolicy: 'SOFT_WARNING',
  blockMockLocation: true,
  minAppVersion: '1.0.0',
  aiInferenceMode: 'GPU_ACCELERATED',
  selectedAiModel: 'qwen2.5:14b-instruct',
  maxConcurrentAiQueries: 1,
  aiMemoryLimitGb: 16,
  cronSchedule: '0 2 * * *',
  compressionEncrypted: true,
  secondaryBackupTarget: 'EXTERNAL_NAS',
  secondaryStoragePath: 'nas://192.168.1.100/volume1/ftth_backups',
  apkDownloadUrl: 'https://ftth-ops.lintasarta.co.id/download/technician-latest.apk',
  otaUpdateUrl: 'https://ftth-ops.lintasarta.co.id/api/v1/ota/manifest',
};

export default function SettingsPage() {
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();

  const [activeTab, setActiveTab] = useState<SettingsTab>('infrastruktur');
  const [settings, setSettings] = useState<SystemSettingsInput>(INITIAL_FALLBACK_SETTINGS);
  const [telemetry, setTelemetry] = useState<SystemTelemetryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const isSuperAdmin = user.hierarchyLevel >= 100;

  // Fetch settings & telemetry from backend service
  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/admin/settings');
      const json = await res.json();
      if (json.success && json.data) {
        setSettings(json.data.settings);
        setTelemetry(json.data.telemetry);
      }
    } catch (err: any) {
      console.warn('Menggunakan data konfigurasi fallback:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Handle form change
  const handleChange = <K extends keyof SystemSettingsInput>(
    field: K,
    value: SystemSettingsInput[K]
  ) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  // Save settings
  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isSuperAdmin) {
      showError('Akses ditolak: Hanya Super Admin yang berwenang mengubah konfigurasi sistem.');
      return;
    }

    try {
      setIsSaving(true);
      const res = await fetch('/api/v1/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
          'x-username': user.username,
          'x-user-role': user.roleName,
          'x-user-type': user.userType,
          'x-hierarchy-level': String(user.hierarchyLevel),
        },
        body: JSON.stringify(settings),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Gagal menyimpan konfigurasi sistem');
      }

      setSettings(json.data);
      setHasChanges(false);
      showSuccess('Konfigurasi sistem on-premise berhasil diperbarui dan dicatat pada activity_logs.');
    } catch (err: any) {
      showError(err.message || 'Terjadi kesalahan saat menyimpan pengaturan');
    } finally {
      setIsSaving(false);
    }
  };

  // Trigger manual instant backup
  const handleTriggerBackup = async () => {
    if (isBackingUp) return;
    try {
      setIsBackingUp(true);
      const res = await fetch('/api/v1/admin/settings/backup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
          'x-username': user.username,
          'x-user-role': user.roleName,
          'x-user-type': user.userType,
          'x-hierarchy-level': String(user.hierarchyLevel),
        },
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Gagal menjalankan backup snapshot');
      }

      const newSnapshot: BackupSnapshotItem = json.data;
      if (telemetry) {
        setTelemetry({
          ...telemetry,
          backupHistory: [newSnapshot, ...telemetry.backupHistory],
        });
      }

      showSuccess(`Backup darurat ${newSnapshot.filename} (${newSnapshot.sizeMb} MB) berhasil dibuat dan disinkronkan ke NAS.`);
    } catch (err: any) {
      showError(err.message || 'Gagal menjalankan snapshot backup');
    } finally {
      setIsBackingUp(false);
    }
  };

  return (
    <main className="settings-page" style={{ paddingBottom: '48px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Overview Command Header */}
      <div className="overview-header" style={{ marginBottom: '22px' }}>
        <div className="overview-header-copy">
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.06em',
              color: '#0e5b92',
              textTransform: 'uppercase',
              marginBottom: '3px',
            }}
          >
            KONSOL ON-PREMISE · DOCKER COMPOSE ORCHESTRATION
          </div>
          <h1 className="overview-greeting">Pengaturan Sistem & Infrastruktur</h1>
          <p className="overview-subtitle">
            Manajemen sumber daya server lokal, isolasi kontainer Docker, parameter geofencing lapangan, dan pemulihan bencana 3-2-1.
          </p>
        </div>

        <div className="overview-toolbar" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: '#ffffff',
              border: '1px solid #dce7f0',
              borderRadius: '6px',
              fontSize: '11.5px',
              fontWeight: 500,
              color: '#334155',
              boxShadow: '0 1px 2px rgba(27, 92, 162, 0.03)',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#16a34a',
                display: 'inline-block',
              }}
            />
            <span>Docker: 6 Layanan Normal</span>
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: '#f0f7ff',
              border: '1px solid #c8e0f4',
              borderRadius: '6px',
              fontSize: '11.5px',
              fontWeight: 600,
              color: '#0e5b92',
            }}
          >
            <Icon name="shield" size={13} />
            <span>{isSuperAdmin ? 'Super Admin (Level 100)' : `${user.roleName} (Read-Only)`}</span>
          </div>

          {/* Quick Header Save Action */}
          <button
            type="button"
            onClick={() => handleSaveSettings()}
            disabled={!isSuperAdmin || isSaving || !hasChanges}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#ffffff',
              background: !isSuperAdmin || !hasChanges ? '#94a3b8' : '#0e5b92',
              border: 'none',
              borderRadius: '6px',
              cursor: !isSuperAdmin || !hasChanges ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: hasChanges ? '0 1px 3px rgba(14, 91, 146, 0.25)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            {isSaving ? <Icon name="refresh" size={13} className="spin" /> : <Icon name="check" size={13} />}
            <span>{isSaving ? 'Menyimpan...' : hasChanges ? 'Simpan Perubahan' : 'Tersimpan'}</span>
          </button>
        </div>
      </div>

      {/* Modern Hairline Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '24px',
          borderBottom: '1px solid #e2ecf2',
          marginBottom: '24px',
          overflowX: 'auto',
        }}
      >
        {[
          { key: 'infrastruktur', label: 'Infrastruktur & Komputasi AI', icon: 'activity' },
          { key: 'geofencing', label: 'Validasi Lapangan & Geofencing', icon: 'pin' },
          { key: 'backup', label: 'Disaster Recovery & Backup 3-2-1', icon: 'download' },
          { key: 'jaringan', label: 'Akses Jaringan & Distribusi APK', icon: 'network' },
        ].map((t) => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key as SettingsTab)}
              style={{
                padding: '10px 4px 12px',
                fontSize: '13px',
                fontWeight: active ? 600 : 500,
                color: active ? '#0e5b92' : '#64748b',
                background: 'transparent',
                border: 'none',
                borderBottom: active ? '2px solid #0e5b92' : '2px solid transparent',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                transition: 'color 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              <Icon name={t.icon} size={15} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      <form onSubmit={handleSaveSettings}>
        {/* ========================================================================= */}
        {/* TAB 1: INFRASTRUKTUR & KOMPUTASI AI (PRD 7.1 & 7.2)                     */}
        {/* ========================================================================= */}
        {activeTab === 'infrastruktur' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.45fr) minmax(360px, 1fr)',
              gap: '24px',
              alignItems: 'start',
            }}
          >
            {/* Left Column: Form Controls & AI Isolation Configuration */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Local AI Engine Box */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2ecf2',
                  borderRadius: '8px',
                  padding: '22px',
                  boxShadow: '0 1px 3px rgba(27, 92, 162, 0.02)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div>
                    <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#182230', margin: '0 0 4px 0' }}>
                      Mesin Inferensi AI Lokal
                    </h2>
                    <p style={{ fontSize: '12.5px', color: '#515a62', margin: 0 }}>
                      Konfigurasi model open-weight Qwen 2.5 pada server internal menggunakan runtime Ollama atau vLLM.
                    </p>
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: '4px',
                      background: '#f0f7ff',
                      color: '#0e5b92',
                      border: '1px solid #c8e0f4',
                    }}
                  >
                    Ollama v0.3.14
                  </span>
                </div>

                {/* Inference Mode Option Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
                  <div
                    onClick={() => isSuperAdmin && handleChange('aiInferenceMode', 'GPU_ACCELERATED')}
                    style={{
                      padding: '14px',
                      borderRadius: '6px',
                      border: `1.5px solid ${settings.aiInferenceMode === 'GPU_ACCELERATED' ? '#0e5b92' : '#e2ecf2'}`,
                      background: settings.aiInferenceMode === 'GPU_ACCELERATED' ? '#f0f7ff' : '#ffffff',
                      cursor: isSuperAdmin ? 'pointer' : 'default',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, fontSize: '13px', color: '#182230' }}>
                        Akselerasi GPU NVIDIA
                      </span>
                      <span
                        style={{
                          fontSize: '10.5px',
                          padding: '2px 6px',
                          borderRadius: '3px',
                          background: '#dcfce7',
                          color: '#056434',
                          fontWeight: 600,
                        }}
                      >
                        1–3s Respons
                      </span>
                    </div>
                    <p style={{ fontSize: '11.5px', color: '#515a62', margin: 0, lineHeight: 1.4 }}>
                      Model 14B / 7B Instruct dengan akselerasi VRAM 16GB penuh untuk respons percakapan instan.
                    </p>
                  </div>

                  <div
                    onClick={() => isSuperAdmin && handleChange('aiInferenceMode', 'CPU_FALLBACK')}
                    style={{
                      padding: '14px',
                      borderRadius: '6px',
                      border: `1.5px solid ${settings.aiInferenceMode === 'CPU_FALLBACK' ? '#0e5b92' : '#e2ecf2'}`,
                      background: settings.aiInferenceMode === 'CPU_FALLBACK' ? '#f0f7ff' : '#ffffff',
                      cursor: isSuperAdmin ? 'pointer' : 'default',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, fontSize: '13px', color: '#182230' }}>
                        Fallback Komputasi CPU
                      </span>
                      <span
                        style={{
                          fontSize: '10.5px',
                          padding: '2px 6px',
                          borderRadius: '3px',
                          background: '#fef3c7',
                          color: '#92400e',
                          fontWeight: 600,
                        }}
                      >
                        8–15s Respons
                      </span>
                    </div>
                    <p style={{ fontSize: '11.5px', color: '#515a62', margin: 0, lineHeight: 1.4 }}>
                      Model mikro 1.5B / 3B Q4_K_M jika server internal beroperasi tanpa kartu grafis khusus.
                    </p>
                  </div>
                </div>

                {/* Form Inputs Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '14px', marginBottom: '18px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                      Model AI Aktif
                    </label>
                    <select
                      value={settings.selectedAiModel}
                      disabled={!isSuperAdmin}
                      onChange={(e) => handleChange('selectedAiModel', e.target.value)}
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
                      <option value="qwen2.5:14b-instruct">qwen2.5:14b-instruct (Rekomendasi GPU · Presisi Tinggi)</option>
                      <option value="qwen2.5:7b-instruct">qwen2.5:7b-instruct (Seimbang · 8GB VRAM)</option>
                      <option value="qwen2.5:3b-q4_k_m">qwen2.5:3b-q4_k_m (CPU Mode)</option>
                      <option value="qwen2.5:1.5b-q4_k_m">qwen2.5:1.5b-q4_k_m (CPU Fallback Ringan)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                      Batas Alokasi Memori AI
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="number"
                        min={4}
                        max={64}
                        value={settings.aiMemoryLimitGb}
                        disabled={!isSuperAdmin}
                        onChange={(e) => handleChange('aiMemoryLimitGb', parseInt(e.target.value, 10) || 16)}
                        style={{
                          width: '80px',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: '1px solid #dce7f0',
                          fontSize: '12.5px',
                          color: '#182230',
                        }}
                      />
                      <span style={{ fontSize: '12px', color: '#64748b' }}>GB RAM/VRAM</span>
                    </div>
                  </div>
                </div>

                {/* Hard isolation info strip */}
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '6px',
                    background: '#f8fafc',
                    border: '1px solid #eef2f6',
                    fontSize: '12px',
                    color: '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <Icon name="lock" size={16} />
                  <span>
                    <b>Isolasi Beban AI Aktif:</b> Parameter lingkungan disetel ke{' '}
                    <code style={{ background: '#edf2f7', padding: '1px 5px', borderRadius: '3px', fontWeight: 600 }}>
                      OLLAMA_NUM_PARALLEL=1
                    </code>
                    . Permintaan chat AI dieksekusi berurutan dalam antrean agar tidak membebani transaksi database PostgreSQL dan trafik 200 teknisi lapangan.
                  </span>
                </div>
              </div>

              {/* Docker Compose Container Resource Isolation */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2ecf2',
                  borderRadius: '8px',
                  padding: '22px',
                  boxShadow: '0 1px 3px rgba(27, 92, 162, 0.02)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#182230', margin: '0 0 4px 0' }}>
                      Alokasi & Isolasi Kontainer Docker Compose
                    </h2>
                    <p style={{ fontSize: '12.5px', color: '#515a62', margin: 0 }}>
                      Penetapan hard resource limits per container on-premise untuk menjaga kestabilan master data.
                    </p>
                  </div>
                  <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                    docker-compose.yml (Enforced)
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {telemetry?.containers.map((c) => (
                    <div
                      key={c.service}
                      style={{
                        border: '1px solid #edf2f7',
                        borderRadius: '6px',
                        padding: '12px',
                        background: '#fcfdfe',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: c.status === 'HEALTHY' ? '#16a34a' : '#ea580c',
                            }}
                          />
                          <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#182230' }}>
                            {c.name}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            padding: '1px 5px',
                            borderRadius: '3px',
                            background: c.status === 'HEALTHY' ? '#dcfce7' : '#ffedd5',
                            color: c.status === 'HEALTHY' ? '#056434' : '#9a3412',
                          }}
                        >
                          {c.status}
                        </span>
                      </div>

                      <div style={{ fontSize: '11.5px', color: '#64748b', marginBottom: '8px', lineHeight: 1.35 }}>
                        {c.details}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#475569', fontWeight: 500 }}>
                        <span>CPU: {c.cpuUsagePercent}%</span>
                        <span>
                          RAM: {c.memoryUsageMb} / {c.memoryLimitMb} MB
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Server Cockpit HUD & Telemetry */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2ecf2',
                  borderRadius: '8px',
                  padding: '22px',
                  boxShadow: '0 1px 3px rgba(27, 92, 162, 0.02)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#182230', margin: 0 }}>
                    Telemetri Server On-Premise
                  </h3>
                  <span
                    style={{
                      fontSize: '10.5px',
                      padding: '2px 7px',
                      borderRadius: '4px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      color: '#64748b',
                      fontFamily: 'monospace',
                    }}
                  >
                    UPTIME: 42 Hari 18 Jam
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* CPU Gauge */}
                  <div style={{ background: '#f8fafc', border: '1px solid #eef2f6', borderRadius: '6px', padding: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                        Prosesor (CPU)
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#0e5b92', fontFamily: 'monospace' }}>
                        {telemetry?.cpuUsage || 24.5}%
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#182230', marginBottom: '8px' }}>
                      {telemetry?.cpuModel || '16-Core / 32-Thread'}
                    </div>
                    <div style={{ height: '5px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${telemetry?.cpuUsage || 24.5}%`, height: '100%', background: '#0e5b92' }} />
                    </div>
                  </div>

                  {/* RAM Gauge */}
                  <div style={{ background: '#f8fafc', border: '1px solid #eef2f6', borderRadius: '6px', padding: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                        Memori Sistem (RAM ECC)
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#0e5b92', fontFamily: 'monospace' }}>
                        {telemetry?.ramUsedGb || 31.8} / {telemetry?.ramTotalGb || 64} GB
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#182230', marginBottom: '8px' }}>
                      DDR4 ECC Low-Latency
                    </div>
                    <div style={{ height: '5px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${((telemetry?.ramUsedGb || 31.8) / (telemetry?.ramTotalGb || 64)) * 100}%`,
                          height: '100%',
                          background: '#0e5b92',
                        }}
                      />
                    </div>
                  </div>

                  {/* Storage Gauge */}
                  <div style={{ background: '#f8fafc', border: '1px solid #eef2f6', borderRadius: '6px', padding: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                        Penyimpanan Master (NVMe)
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#0e5b92', fontFamily: 'monospace' }}>
                        {telemetry?.storageUsedGb || 742} / {telemetry?.storageTotalGb || 2048} GB
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#182230', marginBottom: '8px' }}>
                      2 TB NVMe RAID 1 Mirroring
                    </div>
                    <div style={{ height: '5px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${((telemetry?.storageUsedGb || 742) / (telemetry?.storageTotalGb || 2048)) * 100}%`,
                          height: '100%',
                          background: '#0e5b92',
                        }}
                      />
                    </div>
                  </div>

                  {/* GPU VRAM Gauge */}
                  <div style={{ background: '#f8fafc', border: '1px solid #eef2f6', borderRadius: '6px', padding: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                        Akselerator AI (VRAM)
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#16a34a', fontFamily: 'monospace' }}>
                        {settings.aiInferenceMode === 'GPU_ACCELERATED' ? '9.4 / 16.0 GB' : 'N/A'}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#182230', marginBottom: '8px' }}>
                      {settings.aiInferenceMode === 'GPU_ACCELERATED' ? 'NVIDIA RTX 4060 Ti 16GB' : 'CPU Inference'}
                    </div>
                    <div style={{ height: '5px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: settings.aiInferenceMode === 'GPU_ACCELERATED' ? '58.7%' : '0%',
                          height: '100%',
                          background: '#16a34a',
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Operating OS & Network Footprint */}
                <div style={{ borderTop: '1px solid #edf2f7', paddingTop: '14px', marginTop: '16px', fontSize: '11.5px', color: '#64748b' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span>Sistem Operasi Host:</span>
                    <span style={{ fontWeight: 600, color: '#334155' }}>Ubuntu 24.04 LTS (Kernel 6.8)</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span>Throughput Jaringan:</span>
                    <span style={{ fontWeight: 600, color: '#334155', fontFamily: 'monospace' }}>142.8 Mbps RX · 88.4 Mbps TX</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Sertifikat TLS / HTTPS:</span>
                    <span style={{ fontWeight: 600, color: '#16a34a' }}>Aktif (Valid s/d 2027)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: VALIDASI LAPANGAN & GEOFENCING (PRD 3.3 & PRD 8 Item 3)           */}
        {/* ========================================================================= */}
        {activeTab === 'geofencing' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.35fr) minmax(360px, 1fr)',
              gap: '24px',
              alignItems: 'start',
            }}
          >
            {/* Left: Geofencing Radius & Location Policy */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2ecf2',
                borderRadius: '8px',
                padding: '22px',
                boxShadow: '0 1px 3px rgba(27, 92, 162, 0.02)',
              }}
            >
              <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#182230', margin: '0 0 4px 0' }}>
                Batas Toleransi Geofencing Teknisi Lapangan
              </h2>
              <p style={{ fontSize: '12.5px', color: '#515a62', margin: '0 0 16px 0' }}>
                Jarak maksimal yang diizinkan antara koordinat GPS ponsel teknisi dengan koordinat tiang ODP saat menekan tombol Submit.
              </p>

              {/* 3 Radius Option Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '22px' }}>
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
                    style={{
                      padding: '14px 12px',
                      borderRadius: '6px',
                      border: `1.5px solid ${settings.geofenceRadiusMeters === item.val ? '#0e5b92' : '#e2ecf2'}`,
                      background: settings.geofenceRadiusMeters === item.val ? '#f0f7ff' : '#ffffff',
                      cursor: isSuperAdmin ? 'pointer' : 'default',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#182230', marginBottom: '3px' }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748b', lineHeight: 1.35 }}>{item.desc}</div>
                  </div>
                ))}
              </div>

              {/* Policy Selection */}
              <div style={{ borderTop: '1px solid #edf2f7', paddingTop: '18px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#182230', marginBottom: '4px' }}>
                  Kebijakan Penanganan Laporan di Luar Radius ODP
                </label>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px 0' }}>
                  Respon sistem saat teknisi berada di luar radius geofencing yang telah dikonfigurasi.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: '6px',
                      border: `1.5px solid ${settings.locationViolationPolicy === 'SOFT_WARNING' ? '#0e5b92' : '#e2ecf2'}`,
                      background: settings.locationViolationPolicy === 'SOFT_WARNING' ? '#f0f7ff' : '#ffffff',
                      cursor: isSuperAdmin ? 'pointer' : 'default',
                      transition: 'all 0.15s ease',
                    }}
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
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#182230' }}>
                        Tandai untuk Ditinjau Admin (Soft Warning · LOCATION_MISMATCH_WARNING)
                      </div>
                      <div style={{ fontSize: '12px', color: '#515a62', marginTop: '2px', lineHeight: 1.4 }}>
                        Laporan tetap tersimpan ke PostgreSQL agar pekerjaan lapangan tidak tertunda, namun disorot dengan badge merah pada Live Monitoring untuk verifikasi Admin/NOC.
                      </div>
                    </div>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: '6px',
                      border: `1.5px solid ${settings.locationViolationPolicy === 'HARD_BLOCK' ? '#0e5b92' : '#e2ecf2'}`,
                      background: settings.locationViolationPolicy === 'HARD_BLOCK' ? '#f0f7ff' : '#ffffff',
                      cursor: isSuperAdmin ? 'pointer' : 'default',
                      transition: 'all 0.15s ease',
                    }}
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
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#182230' }}>
                        Tolak Laporan Langsung (Hard Block · HTTP 400 Out of Geofence)
                      </div>
                      <div style={{ fontSize: '12px', color: '#515a62', marginTop: '2px', lineHeight: 1.4 }}>
                        Backend langsung menolak transaksi dan aplikasi mobile menampilkan peringatan agar teknisi berpindah mendekati tiang ODP yang benar sebelum mengirim data.
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Right: Security & App Version Gate */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2ecf2',
                  borderRadius: '8px',
                  padding: '22px',
                  boxShadow: '0 1px 3px rgba(27, 92, 162, 0.02)',
                }}
              >
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#182230', margin: '0 0 12px 0' }}>
                  Perlindungan Integritas & Anti-Fake GPS
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '12.5px', color: '#334155' }}>
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
                      <span style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.4, display: 'block', marginTop: '2px' }}>
                        Memeriksa bendera sistem operasi Android (<code style={{ background: '#f1f5f9', padding: '1px 4px' }}>location.mocked</code>). Tombol submit dikunci seketika jika aplikasi fake GPS aktif.
                      </span>
                    </div>
                  </label>

                  <div style={{ borderTop: '1px solid #edf2f7', paddingTop: '14px' }}>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                      Batas Versi Minimum Aplikasi Mobile (App Version Gate)
                    </label>
                    <p style={{ fontSize: '11.5px', color: '#64748b', margin: '0 0 8px 0' }}>
                      Request dari aplikasi mobile yang menyertakan header <code style={{ background: '#f1f5f9', padding: '1px 4px' }}>X-App-Version</code> di bawah versi ini akan menerima respon <b>HTTP 426 Upgrade Required</b>.
                    </p>
                    <input
                      type="text"
                      value={settings.minAppVersion}
                      disabled={!isSuperAdmin}
                      onChange={(e) => handleChange('minAppVersion', e.target.value)}
                      placeholder="1.0.0"
                      style={{
                        width: '120px',
                        padding: '7px 10px',
                        borderRadius: '6px',
                        border: '1px solid #dce7f0',
                        fontSize: '13px',
                        fontFamily: 'monospace',
                        color: '#182230',
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: DISASTER RECOVERY & BACKUP 3-2-1 (PRD 7.3 & PRD 8 Item 4)         */}
        {/* ========================================================================= */}
        {activeTab === 'backup' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Top 3-2-1 Architecture Strip */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2ecf2',
                borderRadius: '8px',
                padding: '20px',
                boxShadow: '0 1px 3px rgba(27, 92, 162, 0.02)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div>
                  <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#182230', margin: '0 0 4px 0' }}>
                    Strategi Disaster Recovery 3-2-1
                  </h2>
                  <p style={{ fontSize: '12.5px', color: '#515a62', margin: 0 }}>
                    Perlindungan master data FTTH terhadap kegagalan hardware fisik dengan 3 salinan data, 2 media penyimpanan, dan 1 salinan off-site.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleTriggerBackup}
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
              </div>

              {/* 3-2-1 Architecture Pill Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                <div style={{ background: '#f8fafc', border: '1px solid #eef2f6', borderRadius: '6px', padding: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#0e5b92', marginBottom: '3px' }}>
                    3 SALINAN DATA
                  </div>
                  <div style={{ fontSize: '12px', color: '#334155', lineHeight: 1.4 }}>
                    Database Utama PostgreSQL + Snapshot Harian Terenkripsi + Replika Remote NAS.
                  </div>
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid #eef2f6', borderRadius: '6px', padding: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#0e5b92', marginBottom: '3px' }}>
                    2 MEDIA BERBEDA
                  </div>
                  <div style={{ fontSize: '12px', color: '#334155', lineHeight: 1.4 }}>
                    Penyimpanan Internal NVMe SSD Server + Storage Appliance Terpisah (NAS/S3).
                  </div>
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid #eef2f6', borderRadius: '6px', padding: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#0e5b92', marginBottom: '3px' }}>
                    1 SALINAN OFF-SITE
                  </div>
                  <div style={{ fontSize: '12px', color: '#334155', lineHeight: 1.4 }}>
                    Penyimpanan cadangan ditempatkan di luar gedung server utama untuk proteksi bencana fisik.
                  </div>
                </div>
              </div>

              {/* Backup Settings Form */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
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
                  <span style={{ fontSize: '11.5px', color: '#64748b', display: 'block', marginTop: '4px' }}>
                    Format cron: Pukul 02:00 WIB dini hari (<code style={{ background: '#f1f5f9', padding: '1px 4px' }}>0 2 * * *</code>)
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
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
                    <option value="ENCRYPTED_CLOUD_BUCKET">Encrypted Cloud Storage Bucket (S3 Compatible)</option>
                    <option value="OFFLINE_COLD_STORAGE">Cold Offline Hard Drive Vault</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
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
            </div>

            {/* Snapshot History Table */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2ecf2',
                borderRadius: '8px',
                padding: '20px',
                boxShadow: '0 1px 3px rgba(27, 92, 162, 0.02)',
              }}
            >
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#182230', margin: '0 0 12px 0' }}>
                Riwayat Snapshot Backup Terenkripsi
              </h3>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e2ecf2', background: '#f8fafc', color: '#64748b' }}>
                      <th style={{ padding: '8px 12px', fontWeight: 600 }}>Waktu Eksekusi</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600 }}>Nama Berkas</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600 }}>Ukuran</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600 }}>Foto Disinkronkan</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600 }}>Target Sinkronisasi</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {telemetry?.backupHistory.map((b) => (
                      <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '9px 12px', color: '#182230', fontWeight: 500 }}>{b.timestamp}</td>
                        <td style={{ padding: '9px 12px', fontFamily: 'monospace', color: '#0e5b92' }}>{b.filename}</td>
                        <td style={{ padding: '9px 12px', color: '#475569' }}>{b.sizeMb} MB</td>
                        <td style={{ padding: '9px 12px', color: '#475569' }}>{b.photosCount} Foto MinIO</td>
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
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: JARINGAN & DISTRIBUSI APK (PRD 7.3 & PRD 8 Item 2)                */}
        {/* ========================================================================= */}
        {activeTab === 'jaringan' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.25fr) minmax(360px, 1fr)',
              gap: '24px',
              alignItems: 'start',
            }}
          >
            {/* Left: Public Access & Workspace Identity */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2ecf2',
                borderRadius: '8px',
                padding: '22px',
                boxShadow: '0 1px 3px rgba(27, 92, 162, 0.02)',
              }}
            >
              <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#182230', margin: '0 0 4px 0' }}>
                Metode Akses Publik untuk 200 Teknisi
              </h2>
              <p style={{ fontSize: '12.5px', color: '#515a62', margin: '0 0 16px 0' }}>
                Jalur koneksi terenkripsi HTTPS agar aplikasi mobile Android/iOS dapat mengakses API, kamera, dan koordinat GPS.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
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
                    <div style={{ fontWeight: 600, fontSize: '12.5px', color: '#182230', marginBottom: '3px' }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.35 }}>{item.desc}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
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
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
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
              <div style={{ borderTop: '1px solid #edf2f7', paddingTop: '16px' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#182230', margin: '0 0 10px 0' }}>
                  Konfigurasi Nginx Reverse Proxy (PRD 7.2 & AGENT.md)
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '6px', border: '1px solid #eef2f6' }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 600, color: '#64748b' }}>Batas Ukuran Upload Foto</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#182230', marginTop: '2px' }}>
                      client_max_body_size 20M;
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      Mencegah error HTTP 413 saat teknisi mengunggah foto kompresi OPM/ODP.
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '6px', border: '1px solid #eef2f6' }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 600, color: '#64748b' }}>Buffering Server-Sent Events</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#182230', marginTop: '2px' }}>
                      proxy_buffering off;
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      Memastikan Live Monitoring SSE mengalir instan tanpa tertahan buffer Nginx.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Mobile Distribution & Self-Hosted OTA Update (PRD 7.3) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2ecf2',
                  borderRadius: '8px',
                  padding: '22px',
                  boxShadow: '0 1px 3px rgba(27, 92, 162, 0.02)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#182230', margin: 0 }}>
                    Distribusi Mobile & Self-Hosted OTA Update
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
                </div>

                <p style={{ fontSize: '12px', color: '#515a62', margin: '0 0 16px 0', lineHeight: 1.4 }}>
                  Mekanisme pembaruan aplikasi lapangan langsung melalui server internal tanpa harus menginstal ulang file APK pada 200 ponsel teknisi.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                      Portal Unduh APK Internal Resmi
                    </label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        type="text"
                        value={settings.apkDownloadUrl || 'https://ftth-ops.lintasarta.co.id/download/technician-latest.apk'}
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
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                      Endpoint Manifest Self-Hosted OTA (expo-updates)
                    </label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        type="text"
                        value={settings.otaUpdateUrl || 'https://ftth-ops.lintasarta.co.id/api/v1/ota/manifest'}
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
                    Teknisi yang membuka aplikasi mobile otomatis memeriksa endpoint manifest di atas. Bundle JavaScript dan perbaikan bug dapat langsung diunduh secara latar belakang.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Integrated Clean Section Footer */}
        <div
          style={{
            marginTop: '24px',
            padding: '12px 18px',
            background: '#ffffff',
            border: '1px solid #e2ecf2',
            borderRadius: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 1px 2px rgba(27, 92, 162, 0.02)',
          }}
        >
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            {hasChanges ? (
              <span style={{ color: '#0e5b92', fontWeight: 600 }}>
                ● Terdapat perubahan konfigurasi yang belum disimpan.
              </span>
            ) : (
              <span>Konfigurasi tersinkronisasi penuh dengan server on-premise PostgreSQL & Docker.</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={fetchSettings}
              disabled={loading || isSaving || !hasChanges}
              style={{
                padding: '7px 14px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#475569',
                border: '1px solid #dce7f0',
                borderRadius: '6px',
                background: '#ffffff',
                cursor: !hasChanges ? 'not-allowed' : 'pointer',
                opacity: !hasChanges ? 0.6 : 1,
              }}
            >
              Reset
            </button>

            <button
              type="submit"
              disabled={!isSuperAdmin || isSaving || !hasChanges}
              style={{
                padding: '7px 18px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#ffffff',
                background: !isSuperAdmin || !hasChanges ? '#94a3b8' : '#0e5b92',
                border: 'none',
                borderRadius: '6px',
                cursor: !isSuperAdmin || !hasChanges ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {isSaving && <Icon name="refresh" size={13} className="spin" />}
              <span>{isSaving ? 'Menyimpan...' : 'Simpan Konfigurasi'}</span>
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}
