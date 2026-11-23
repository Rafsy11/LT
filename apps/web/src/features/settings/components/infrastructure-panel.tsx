'use client';

import React, { useMemo } from 'react';
import { Icon } from '@/components/ui/Icon';
import { FieldError } from '@/components/ui/FieldError';
import { SystemSettingsInput, SystemTelemetryData } from '@repo/shared';
import type { SettingsFieldErrors } from '../hooks/use-settings';

export interface InfrastructurePanelProps {
  settings: SystemSettingsInput;
  telemetry: SystemTelemetryData | null;
  fieldErrors: SettingsFieldErrors;
  isSuperAdmin: boolean;
  handleChange: <K extends keyof SystemSettingsInput>(
    field: K,
    value: SystemSettingsInput[K],
  ) => void;
}

const PRESET_AI_MODELS: ReadonlyArray<{ value: string; label: string }> = [
  {
    value: 'qwen2.5:14b-instruct',
    label: 'qwen2.5:14b-instruct (Rekomendasi GPU · Presisi Tinggi)',
  },
  {
    value: 'qwen2.5:7b-instruct',
    label: 'qwen2.5:7b-instruct (Seimbang · 8 GB VRAM)',
  },
  {
    value: 'qwen2.5:7b',
    label: 'qwen2.5:7b (Standar On-Premise)',
  },
  {
    value: 'qwen2.5:3b-q4_k_m',
    label: 'qwen2.5:3b-q4_k_m (Mode CPU)',
  },
  {
    value: 'qwen2.5:1.5b-q4_k_m',
    label: 'qwen2.5:1.5b-q4_k_m (CPU Fallback Ringan)',
  },
];

function formatUptime(seconds?: number): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    return 'Tidak tersedia';
  }
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} Hari ${hours} Jam`;
  if (hours > 0) return `${hours} Jam ${mins} Menit`;
  return `${Math.max(1, mins)} Menit`;
}

function clampPct(used: number, total: number): number {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((used / total) * 100)));
}

export function InfrastructurePanel({
  settings,
  telemetry,
  fieldErrors,
  isSuperAdmin,
  handleChange,
}: InfrastructurePanelProps) {
  const modelOptions = useMemo(() => {
    const exists = PRESET_AI_MODELS.some((m) => m.value === settings.selectedAiModel);
    if (exists || !settings.selectedAiModel) return PRESET_AI_MODELS;
    return [
      { value: settings.selectedAiModel, label: `${settings.selectedAiModel} (Aktif di Server)` },
      ...PRESET_AI_MODELS,
    ];
  }, [settings.selectedAiModel]);

  const cpuUsagePct = telemetry ? Math.max(0, Math.min(100, telemetry.cpuUsage)) : 0;
  const ramPct = telemetry ? clampPct(telemetry.ramUsedGb, telemetry.ramTotalGb) : 0;
  const storagePct = telemetry ? clampPct(telemetry.storageUsedGb, telemetry.storageTotalGb) : 0;
  const hasVramTelemetry =
    settings.aiInferenceMode === 'GPU_ACCELERATED' &&
    typeof telemetry?.gpuVramUsedGb === 'number' &&
    typeof telemetry?.gpuVramTotalGb === 'number' &&
    telemetry.gpuVramTotalGb > 0;
  const vramPct = hasVramTelemetry
    ? clampPct(telemetry!.gpuVramUsedGb!, telemetry!.gpuVramTotalGb!)
    : 0;

  return (
    <section
      className="settings-panel-grid"
      aria-label="Pengaturan Infrastruktur & Komputasi AI"
    >
      {/* Left Column: AI Inference & Service Health */}
      <div className="settings-col-stack">
        {/* Local AI Engine Card */}
        <article className="settings-card">
          <header className="settings-card-header">
            <div>
              <h2 className="settings-section-heading">Mesin Inferensi AI Lokal</h2>
              <p className="settings-section-subheading">
                Konfigurasi model Qwen 2.5 pada server internal melalui runtime Ollama tanpa
                mengirim data keluar jaringan.
              </p>
            </div>
            <span
              className={`settings-status-pill ${
                telemetry?.ollamaHealthy ? 'healthy' : 'warning'
              }`}
            >
              {telemetry?.ollamaHealthy
                ? telemetry.ollamaActiveModel
                  ? `Ollama Aktif · ${telemetry.ollamaActiveModel}`
                  : 'Ollama Aktif'
                : 'Ollama Offline'}
            </span>
          </header>

          {/* Inference Mode Accessible Radio Cards */}
          <fieldset className="settings-fieldset" disabled={!isSuperAdmin}>
            <legend className="settings-fieldset-legend">Mode Komputasi Inferensi</legend>
            <div className="settings-two-col-grid">
              {[
                {
                  value: 'GPU_ACCELERATED' as const,
                  title: 'Akselerasi GPU',
                  badge: 'Prioritas Kecepatan',
                  badgeTone: 'healthy',
                  desc: 'Menjalankan model 7B / 14B pada memori VRAM GPU untuk respons analitik lebih cepat.',
                },
                {
                  value: 'CPU_FALLBACK' as const,
                  title: 'Fallback Komputasi CPU',
                  badge: 'Tanpa GPU',
                  badgeTone: 'warning',
                  desc: 'Menjalankan model terkuantisasi ringan (1.5B / 3B) jika server beroperasi tanpa akselerator GPU.',
                },
              ].map((opt) => {
                const selected = settings.aiInferenceMode === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`settings-option-card ${selected ? 'active' : ''} ${!isSuperAdmin ? 'is-readonly' : ''}`}
                  >
                    <input
                      type="radio"
                      name="aiInferenceMode"
                      value={opt.value}
                      checked={selected}
                      disabled={!isSuperAdmin}
                      onChange={() => handleChange('aiInferenceMode', opt.value)}
                      className="sr-only"
                    />
                    <div className="settings-option-card-top">
                      <span className="settings-option-title">
                        {selected && <Icon name="check" size={13} />}
                        <span>{opt.title}</span>
                      </span>
                      <span className={`settings-status-pill ${opt.badgeTone}`}>{opt.badge}</span>
                    </div>
                    <span className="settings-option-desc">{opt.desc}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* Form Inputs Grid */}
          <div className="settings-three-col-grid settings-form-row">
            <div className="settings-field-group">
              <label htmlFor="settings-ai-model" className="settings-input-label">
                Model AI Aktif
              </label>
              <select
                id="settings-ai-model"
                name="selectedAiModel"
                value={settings.selectedAiModel}
                disabled={!isSuperAdmin}
                onChange={(e) => handleChange('selectedAiModel', e.target.value)}
                className="settings-select"
              >
                {modelOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="settings-field-group">
              <label htmlFor="settings-ai-memory" className="settings-input-label">
                Batas Memori AI (GB)
              </label>
              <div className="settings-input-unit-row">
                <input
                  id="settings-ai-memory"
                  name="aiMemoryLimitGb"
                  type="number"
                  min={4}
                  max={64}
                  value={Number.isNaN(settings.aiMemoryLimitGb) ? '' : settings.aiMemoryLimitGb}
                  disabled={!isSuperAdmin}
                  aria-invalid={Boolean(fieldErrors.aiMemoryLimitGb)}
                  aria-describedby={
                    fieldErrors.aiMemoryLimitGb ? 'settings-ai-memory-err' : undefined
                  }
                  onChange={(e) => {
                    const parsed = Number.parseInt(e.target.value, 10);
                    handleChange('aiMemoryLimitGb', Number.isNaN(parsed) ? 0 : parsed);
                  }}
                  className={`settings-number-input ${fieldErrors.aiMemoryLimitGb ? 'ui-input-invalid' : ''}`}
                />
                <span className="settings-subtext-mono">GB (4–64)</span>
              </div>
              <FieldError id="settings-ai-memory-err" message={fieldErrors.aiMemoryLimitGb} />
            </div>

            <div className="settings-field-group">
              <label htmlFor="settings-ai-concurrency" className="settings-input-label">
                Antrean Paralel AI
              </label>
              <select
                id="settings-ai-concurrency"
                name="maxConcurrentAiQueries"
                value={settings.maxConcurrentAiQueries}
                disabled={!isSuperAdmin}
                aria-invalid={Boolean(fieldErrors.maxConcurrentAiQueries)}
                onChange={(e) =>
                  handleChange('maxConcurrentAiQueries', Number.parseInt(e.target.value, 10) || 1)
                }
                className="settings-select"
              >
                <option value={1}>1 Permintaan (Isolasi Ketat)</option>
                <option value={2}>2 Permintaan Paralel</option>
                <option value={3}>3 Permintaan Paralel</option>
                <option value={4}>4 Permintaan Paralel</option>
              </select>
              <FieldError message={fieldErrors.maxConcurrentAiQueries} />
            </div>
          </div>

          <div className="settings-isolation-strip">
            <Icon name="lock" size={16} />
            <span>
              <b>Isolasi Beban AI:</b> Konfigurasi antrean disetel ke{' '}
              <code className="settings-inline-code">
                OLLAMA_NUM_PARALLEL={settings.maxConcurrentAiQueries}
              </code>{' '}
              agar inferensi LLM tidak mengganggu respons transaksi operasional utama.
            </span>
          </div>
        </article>

        {/* Service Health Cards */}
        <article className="settings-card">
          <header className="settings-card-header">
            <div>
              <h2 className="settings-section-heading">Kesehatan Layanan On-Premise</h2>
              <p className="settings-section-subheading">
                Hasil pemeriksaan konektivitas langsung dari server aplikasi terhadap seluruh
                dependensi lokal.
              </p>
            </div>
            <span className="settings-subtext-mono">Live Probe</span>
          </header>

          <div className="settings-two-col-grid">
            {(telemetry?.containers ?? []).map((c) => {
              const statusTone =
                c.status === 'HEALTHY'
                  ? 'healthy'
                  : c.status === 'CRITICAL'
                    ? 'critical'
                    : 'warning';
              const dotTone =
                c.status === 'HEALTHY'
                  ? 'status-dot--ok'
                  : c.status === 'CRITICAL'
                    ? 'status-dot--danger'
                    : 'status-dot--warn';
              const statusLabel =
                c.status === 'HEALTHY'
                  ? 'NORMAL'
                  : c.status === 'CRITICAL'
                    ? 'KRITIS'
                    : 'PERINGATAN';

              return (
                <div key={c.service} className="docker-container-card">
                  <div className="docker-container-top">
                    <div className="docker-container-title-wrap">
                      <span className={`status-dot ${dotTone}`} aria-hidden="true" />
                      <span className="docker-container-name">{c.name}</span>
                    </div>
                    <span className={`settings-status-pill ${statusTone}`}>{statusLabel}</span>
                  </div>

                  <div className="docker-container-details">{c.details}</div>

                  <div className="docker-container-specs">
                    <span>
                      {c.memoryUsageMb > 0
                        ? `RAM: ${c.memoryUsageMb} / ${c.memoryLimitMb} MB`
                        : `Batas RAM: ${c.memoryLimitMb} MB`}
                    </span>
                    {c.cpuUsagePercent > 0 && <span>CPU: {c.cpuUsagePercent}%</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      </div>

      {/* Right Column: Real Server Telemetry HUD */}
      <div className="settings-col-stack">
        <aside aria-label="Telemetri Server On-Premise" className="settings-card">
          <header className="settings-card-header">
            <div>
              <h3 className="settings-section-heading">Telemetri Host Server</h3>
              <p className="settings-section-subheading">
                Pembacaan langsung dari sistem operasi host saat halaman dimuat atau disegarkan.
              </p>
            </div>
            {typeof telemetry?.uptimeSeconds === 'number' && (
              <span className="settings-uptime-badge">
                UPTIME: {formatUptime(telemetry.uptimeSeconds)}
              </span>
            )}
          </header>

          <div className="settings-gauge-stack">
            {/* CPU Gauge */}
            <div className="settings-gauge-card">
              <div className="settings-gauge-row">
                <span className="settings-gauge-label">Prosesor (CPU)</span>
                <span className="settings-gauge-val">
                  {telemetry ? `${cpuUsagePct}%` : 'Memuat...'}
                </span>
              </div>
              <div className="settings-gauge-title">
                {telemetry
                  ? `${telemetry.cpuModel} (${telemetry.cpuCores} Core)`
                  : 'Memeriksa spesifikasi prosesor...'}
              </div>
              <div className="settings-gauge-track" aria-hidden="true">
                <div className="settings-gauge-bar" style={{ width: `${cpuUsagePct}%` }} />
              </div>
            </div>

            {/* RAM Gauge */}
            <div className="settings-gauge-card">
              <div className="settings-gauge-row">
                <span className="settings-gauge-label">Memori Sistem (RAM)</span>
                <span className="settings-gauge-val">
                  {telemetry ? `${telemetry.ramUsedGb} / ${telemetry.ramTotalGb} GB` : 'Memuat...'}
                </span>
              </div>
              <div className="settings-gauge-title">
                {telemetry ? `Terpakai ${ramPct}% dari total memori host` : 'Memeriksa memori...'}
              </div>
              <div className="settings-gauge-track" aria-hidden="true">
                <div className="settings-gauge-bar" style={{ width: `${ramPct}%` }} />
              </div>
            </div>

            {/* Storage Gauge */}
            <div className="settings-gauge-card">
              <div className="settings-gauge-row">
                <span className="settings-gauge-label">Penyimpanan Volume Kerja</span>
                <span className="settings-gauge-val">
                  {telemetry && telemetry.storageTotalGb > 0
                    ? `${telemetry.storageUsedGb} / ${telemetry.storageTotalGb} GB`
                    : 'Tidak terukur'}
                </span>
              </div>
              <div className="settings-gauge-title">
                {telemetry && telemetry.storageTotalGb > 0
                  ? `Terpakai ${storagePct}% pada partisi aktif`
                  : 'Statistik partisi tidak tersedia di host'}
              </div>
              <div className="settings-gauge-track" aria-hidden="true">
                <div className="settings-gauge-bar" style={{ width: `${storagePct}%` }} />
              </div>
            </div>

            {/* GPU VRAM Gauge */}
            <div className="settings-gauge-card">
              <div className="settings-gauge-row">
                <span className="settings-gauge-label">Memori Model AI (VRAM)</span>
                <span className={`settings-gauge-val ${hasVramTelemetry ? 'gpu' : ''}`}>
                  {hasVramTelemetry
                    ? `${telemetry!.gpuVramUsedGb} / ${telemetry!.gpuVramTotalGb} GB`
                    : settings.aiInferenceMode === 'CPU_FALLBACK'
                      ? 'Mode CPU'
                      : 'Tidak aktif'}
                </span>
              </div>
              <div className="settings-gauge-title">
                {telemetry?.gpuModel
                  ? telemetry.gpuModel
                  : settings.aiInferenceMode === 'CPU_FALLBACK'
                    ? 'Inferensi berjalan pada CPU'
                    : 'Belum ada model termuat di VRAM Ollama'}
              </div>
              <div className="settings-gauge-track" aria-hidden="true">
                <div
                  className={`settings-gauge-bar ${hasVramTelemetry ? 'gpu' : ''}`}
                  style={{ width: `${vramPct}%` }}
                />
              </div>
            </div>
          </div>

          <dl className="settings-footprint-meta">
            <div className="settings-footprint-row">
              <dt>Platform Host</dt>
              <dd className="settings-meta-highlight">
                {telemetry?.hostPlatform || 'Tidak tersedia'}
              </dd>
            </div>
            <div className="settings-footprint-row">
              <dt>Model Terkonfigurasi</dt>
              <dd className="settings-meta-highlight mono">{settings.selectedAiModel}</dd>
            </div>
            <div className="settings-footprint-row">
              <dt>Zona Waktu Server</dt>
              <dd className="settings-meta-highlight">{settings.serverTimezone}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </section>
  );
}
