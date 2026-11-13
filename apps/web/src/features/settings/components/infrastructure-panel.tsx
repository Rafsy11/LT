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
    <section
      className="settings-panel-grid"
      aria-label="Pengaturan Infrastruktur & Komputasi AI"
    >
      {/* Left Column: Form Controls & AI Isolation Configuration */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Local AI Engine Box */}
        <article className="settings-card">
          <header
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '16px',
            }}
          >
            <div>
              <h2 className="settings-section-heading" style={{ margin: '0 0 4px 0' }}>
                Mesin Inferensi AI Lokal
              </h2>
              <p className="settings-section-subheading" style={{ margin: 0 }}>
                Konfigurasi model open-weight Qwen 2.5 pada server internal menggunakan runtime
                Ollama atau vLLM.
              </p>
            </div>
            <span className="settings-version-pill">
              Ollama v0.3.14
            </span>
          </header>

          {/* Inference Mode Option Cards */}
          <div
            className="settings-two-col-grid"
            style={{ marginBottom: '18px' }}
          >
            <div
              onClick={() => isSuperAdmin && handleChange('aiInferenceMode', 'GPU_ACCELERATED')}
              className={`settings-option-card ${settings.aiInferenceMode === 'GPU_ACCELERATED' ? 'active' : ''}`}
              style={{
                padding: '14px',
                borderRadius: '6px',
                cursor: isSuperAdmin ? 'pointer' : 'default',
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
                <span className="settings-option-title" style={{ fontWeight: 600, fontSize: '13px' }}>
                  Akselerasi GPU NVIDIA
                </span>
                <span className="settings-status-pill healthy">
                  1–3s Respons
                </span>
              </div>
              <p className="settings-option-desc" style={{ fontSize: '11.5px', margin: 0, lineHeight: 1.4 }}>
                Model 14B / 7B Instruct dengan akselerasi VRAM 16GB penuh untuk respons percakapan
                instan.
              </p>
            </div>

            <div
              onClick={() => isSuperAdmin && handleChange('aiInferenceMode', 'CPU_FALLBACK')}
              className={`settings-option-card ${settings.aiInferenceMode === 'CPU_FALLBACK' ? 'active' : ''}`}
              style={{
                padding: '14px',
                borderRadius: '6px',
                cursor: isSuperAdmin ? 'pointer' : 'default',
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
                <span className="settings-option-title" style={{ fontWeight: 600, fontSize: '13px' }}>
                  Fallback Komputasi CPU
                </span>
                <span className="settings-status-pill warning">
                  8–15s Respons
                </span>
              </div>
              <p className="settings-option-desc" style={{ fontSize: '11.5px', margin: 0, lineHeight: 1.4 }}>
                Model mikro 1.5B / 3B Q4_K_M jika server internal beroperasi tanpa kartu grafis
                khusus.
              </p>
            </div>
          </div>

          {/* Form Inputs Grid */}
          <div
            className="settings-two-col-grid"
            style={{ marginBottom: '18px' }}
          >
            <div>
              <label className="settings-input-label">
                Model AI Aktif
              </label>
              <select
                value={settings.selectedAiModel}
                disabled={!isSuperAdmin}
                onChange={(e) => handleChange('selectedAiModel', e.target.value)}
                className="settings-select"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '12.5px',
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
              <label className="settings-input-label">
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
                  className="settings-number-input"
                  style={{
                    width: '80px',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    fontSize: '12.5px',
                  }}
                />
                <span className="settings-subtext-mono">GB RAM/VRAM</span>
              </div>
            </div>
          </div>

          {/* Hard isolation info strip */}
          <div className="settings-isolation-strip">
            <Icon name="lock" size={16} />
            <span>
              <b>Isolasi Beban AI Aktif:</b> Parameter lingkungan disetel ke{' '}
              <code className="settings-inline-code">
                OLLAMA_NUM_PARALLEL=1
              </code>
              . Permintaan chat AI dieksekusi berurutan dalam antrean agar tidak membebani transaksi
              database PostgreSQL dan trafik 200 teknisi lapangan.
            </span>
          </div>
        </article>

        {/* Docker Compose Container Resource Isolation */}
        <article className="settings-card">
          <header
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <div>
              <h2 className="settings-section-heading" style={{ margin: '0 0 4px 0' }}>
                Alokasi &amp; Isolasi Kontainer Docker Compose
              </h2>
              <p className="settings-section-subheading" style={{ margin: 0 }}>
                Penetapan hard resource limits per container on-premise untuk menjaga kestabilan
                master data.
              </p>
            </div>
            <span className="settings-subtext-mono">
              docker-compose.yml (Enforced)
            </span>
          </header>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {telemetry?.containers.map((c) => (
              <div
                key={c.service}
                className="docker-container-card"
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
                      className={`status-dot ${c.status === 'HEALTHY' ? 'status-dot--ok' : 'status-dot--warn'}`}
                    />
                    <span className="docker-container-name">
                      {c.name}
                    </span>
                  </div>
                  <span className={`settings-status-pill ${c.status === 'HEALTHY' ? 'healthy' : 'warning'}`}>
                    {c.status}
                  </span>
                </div>

                <div className="docker-container-details">
                  {c.details}
                </div>

                <div className="docker-container-specs">
                  <span>CPU: {c.cpuUsagePercent}%</span>
                  <span>
                    RAM: {c.memoryUsageMb} / {c.memoryLimitMb} MB
                  </span>
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>

      {/* Right Column: Server Cockpit HUD & Telemetry */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <aside
          aria-label="Telemetri Server On-Premise"
          className="settings-card"
        >
          <header
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <h3 className="settings-section-heading" style={{ margin: 0 }}>
              Telemetri Server On-Premise
            </h3>
            <span className="settings-uptime-badge">
              UPTIME: 42 Hari 18 Jam
            </span>
          </header>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* CPU Gauge */}
            <div className="settings-gauge-card">
              <div
                style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}
              >
                <span className="settings-gauge-label">
                  Prosesor (CPU)
                </span>
                <span className="settings-gauge-val">
                  {telemetry?.cpuUsage || 24.5}%
                </span>
              </div>
              <div className="settings-gauge-title">
                {telemetry?.cpuModel || '16-Core / 32-Thread'}
              </div>
              <div className="settings-gauge-track">
                <div
                  className="settings-gauge-bar"
                  style={{
                    width: `${telemetry?.cpuUsage || 24.5}%`,
                  }}
                />
              </div>
            </div>

            {/* RAM Gauge */}
            <div className="settings-gauge-card">
              <div
                style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}
              >
                <span className="settings-gauge-label">
                  Memori Sistem (RAM ECC)
                </span>
                <span className="settings-gauge-val">
                  {telemetry?.ramUsedGb || 31.8} / {telemetry?.ramTotalGb || 64} GB
                </span>
              </div>
              <div className="settings-gauge-title">
                DDR4 ECC Low-Latency
              </div>
              <div className="settings-gauge-track">
                <div
                  className="settings-gauge-bar"
                  style={{
                    width: `${((telemetry?.ramUsedGb || 31.8) / (telemetry?.ramTotalGb || 64)) * 100}%`,
                  }}
                />
              </div>
            </div>

            {/* Storage Gauge */}
            <div className="settings-gauge-card">
              <div
                style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}
              >
                <span className="settings-gauge-label">
                  Penyimpanan Master (NVMe)
                </span>
                <span className="settings-gauge-val">
                  {telemetry?.storageUsedGb || 742} / {telemetry?.storageTotalGb || 2048} GB
                </span>
              </div>
              <div className="settings-gauge-title">
                2 TB NVMe RAID 1 Mirroring
              </div>
              <div className="settings-gauge-track">
                <div
                  className="settings-gauge-bar"
                  style={{
                    width: `${((telemetry?.storageUsedGb || 742) / (telemetry?.storageTotalGb || 2048)) * 100}%`,
                  }}
                />
              </div>
            </div>

            {/* GPU VRAM Gauge */}
            <div className="settings-gauge-card">
              <div
                style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}
              >
                <span className="settings-gauge-label">
                  Akselerator AI (VRAM)
                </span>
                <span className="settings-gauge-val gpu">
                  {settings.aiInferenceMode === 'GPU_ACCELERATED' ? '9.4 / 16.0 GB' : 'N/A'}
                </span>
              </div>
              <div className="settings-gauge-title">
                {settings.aiInferenceMode === 'GPU_ACCELERATED'
                  ? 'NVIDIA RTX 4060 Ti 16GB'
                  : 'CPU Inference'}
              </div>
              <div className="settings-gauge-track">
                <div
                  className="settings-gauge-bar gpu"
                  style={{
                    width: settings.aiInferenceMode === 'GPU_ACCELERATED' ? '58.7%' : '0%',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Operating OS & Network Footprint */}
          <div className="settings-footprint-meta">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>Sistem Operasi Host:</span>
              <span className="settings-meta-highlight">
                Ubuntu 24.04 LTS (Kernel 6.8)
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>Throughput Jaringan:</span>
              <span className="settings-meta-highlight mono">
                142.8 Mbps RX · 88.4 Mbps TX
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Sertifikat TLS / HTTPS:</span>
              <span className="settings-tls-status active">Aktif (Valid s/d 2027)</span>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
