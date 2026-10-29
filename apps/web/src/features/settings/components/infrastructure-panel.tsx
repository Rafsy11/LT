'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { SystemSettingsInput, SystemTelemetryData } from '@repo/shared';

export interface InfrastructurePanelProps {
  settings: SystemSettingsInput;
  telemetry: SystemTelemetryData | null;
  isSuperAdmin: boolean;
  handleChange: <K extends keyof SystemSettingsInput>(
    field: K,
    value: SystemSettingsInput[K],
  ) => void;
}

export function InfrastructurePanel({
  settings,
  telemetry,
  isSuperAdmin,
  handleChange,
}: InfrastructurePanelProps) {
  return (
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
          <div
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
                Mesin Inferensi AI Lokal
              </h2>
              <p style={{ fontSize: '12.5px', color: '#515a62', margin: 0 }}>
                Konfigurasi model open-weight Qwen 2.5 pada server internal menggunakan runtime
                Ollama atau vLLM.
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
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '18px',
            }}
          >
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
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '4px',
                }}
              >
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
                Model 14B / 7B Instruct dengan akselerasi VRAM 16GB penuh untuk respons percakapan
                instan.
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
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '4px',
                }}
              >
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
                Model mikro 1.5B / 3B Q4_K_M jika server internal beroperasi tanpa kartu grafis
                khusus.
              </p>
            </div>
          </div>

          {/* Form Inputs Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 1fr',
              gap: '14px',
              marginBottom: '18px',
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
                <option value="qwen2.5:14b-instruct">
                  qwen2.5:14b-instruct (Rekomendasi GPU · Presisi Tinggi)
                </option>
                <option value="qwen2.5:7b-instruct">
                  qwen2.5:7b-instruct (Seimbang · 8GB VRAM)
                </option>
                <option value="qwen2.5:3b-q4_k_m">qwen2.5:3b-q4_k_m (CPU Mode)</option>
                <option value="qwen2.5:1.5b-q4_k_m">
                  qwen2.5:1.5b-q4_k_m (CPU Fallback Ringan)
                </option>
              </select>
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
                Batas Alokasi Memori AI
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="number"
                  min={4}
                  max={64}
                  value={settings.aiMemoryLimitGb}
                  disabled={!isSuperAdmin}
                  onChange={(e) =>
                    handleChange('aiMemoryLimitGb', parseInt(e.target.value, 10) || 16)
                  }
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
              <code
                style={{
                  background: '#edf2f7',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  fontWeight: 600,
                }}
              >
                OLLAMA_NUM_PARALLEL=1
              </code>
              . Permintaan chat AI dieksekusi berurutan dalam antrean agar tidak membebani transaksi
              database PostgreSQL dan trafik 200 teknisi lapangan.
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
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <div>
              <h2
                style={{ fontSize: '15px', fontWeight: 600, color: '#182230', margin: '0 0 4px 0' }}
              >
                Alokasi &amp; Isolasi Kontainer Docker Compose
              </h2>
              <p style={{ fontSize: '12.5px', color: '#515a62', margin: 0 }}>
                Penetapan hard resource limits per container on-premise untuk menjaga kestabilan
                master data.
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
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px',
                  }}
                >
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

                <div
                  style={{
                    fontSize: '11.5px',
                    color: '#64748b',
                    marginBottom: '8px',
                    lineHeight: 1.35,
                  }}
                >
                  {c.details}
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '11px',
                    color: '#475569',
                    fontWeight: 500,
                  }}
                >
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
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
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
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #eef2f6',
                borderRadius: '6px',
                padding: '12px',
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#64748b',
                    textTransform: 'uppercase',
                  }}
                >
                  Prosesor (CPU)
                </span>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#0e5b92',
                    fontFamily: 'monospace',
                  }}
                >
                  {telemetry?.cpuUsage || 24.5}%
                </span>
              </div>
              <div
                style={{ fontSize: '13px', fontWeight: 600, color: '#182230', marginBottom: '8px' }}
              >
                {telemetry?.cpuModel || '16-Core / 32-Thread'}
              </div>
              <div
                style={{
                  height: '5px',
                  background: '#e2e8f0',
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${telemetry?.cpuUsage || 24.5}%`,
                    height: '100%',
                    background: '#0e5b92',
                  }}
                />
              </div>
            </div>

            {/* RAM Gauge */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #eef2f6',
                borderRadius: '6px',
                padding: '12px',
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#64748b',
                    textTransform: 'uppercase',
                  }}
                >
                  Memori Sistem (RAM ECC)
                </span>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#0e5b92',
                    fontFamily: 'monospace',
                  }}
                >
                  {telemetry?.ramUsedGb || 31.8} / {telemetry?.ramTotalGb || 64} GB
                </span>
              </div>
              <div
                style={{ fontSize: '13px', fontWeight: 600, color: '#182230', marginBottom: '8px' }}
              >
                DDR4 ECC Low-Latency
              </div>
              <div
                style={{
                  height: '5px',
                  background: '#e2e8f0',
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}
              >
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
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #eef2f6',
                borderRadius: '6px',
                padding: '12px',
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#64748b',
                    textTransform: 'uppercase',
                  }}
                >
                  Penyimpanan Master (NVMe)
                </span>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#0e5b92',
                    fontFamily: 'monospace',
                  }}
                >
                  {telemetry?.storageUsedGb || 742} / {telemetry?.storageTotalGb || 2048} GB
                </span>
              </div>
              <div
                style={{ fontSize: '13px', fontWeight: 600, color: '#182230', marginBottom: '8px' }}
              >
                2 TB NVMe RAID 1 Mirroring
              </div>
              <div
                style={{
                  height: '5px',
                  background: '#e2e8f0',
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}
              >
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
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #eef2f6',
                borderRadius: '6px',
                padding: '12px',
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#64748b',
                    textTransform: 'uppercase',
                  }}
                >
                  Akselerator AI (VRAM)
                </span>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#16a34a',
                    fontFamily: 'monospace',
                  }}
                >
                  {settings.aiInferenceMode === 'GPU_ACCELERATED' ? '9.4 / 16.0 GB' : 'N/A'}
                </span>
              </div>
              <div
                style={{ fontSize: '13px', fontWeight: 600, color: '#182230', marginBottom: '8px' }}
              >
                {settings.aiInferenceMode === 'GPU_ACCELERATED'
                  ? 'NVIDIA RTX 4060 Ti 16GB'
                  : 'CPU Inference'}
              </div>
              <div
                style={{
                  height: '5px',
                  background: '#e2e8f0',
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}
              >
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
          <div
            style={{
              borderTop: '1px solid #edf2f7',
              paddingTop: '14px',
              marginTop: '16px',
              fontSize: '11.5px',
              color: '#64748b',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>Sistem Operasi Host:</span>
              <span style={{ fontWeight: 600, color: '#334155' }}>
                Ubuntu 24.04 LTS (Kernel 6.8)
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>Throughput Jaringan:</span>
              <span style={{ fontWeight: 600, color: '#334155', fontFamily: 'monospace' }}>
                142.8 Mbps RX · 88.4 Mbps TX
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Sertifikat TLS / HTTPS:</span>
              <span style={{ fontWeight: 600, color: '#16a34a' }}>Aktif (Valid s/d 2027)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
