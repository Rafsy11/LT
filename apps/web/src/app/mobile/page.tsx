'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useTheme } from '@/providers';
import { Icon } from '@/components/ui/Icon';
import App from '../../../../mobile/App';
import '@/styles/features/mobile-simulator.css';

const DEDICATED_MOBILE_ORIGIN = process.env.NEXT_PUBLIC_MOBILE_ORIGIN?.trim() || '';

type DevicePreset = 'samsung' | 'rugged' | 'compact';
type NetworkMode = 'online' | 'flaky' | 'offline';
type GpsMode = 'valid' | 'outOfRange' | 'mock';
type ZoomScale = 1 | 0.9 | 0.85 | 0.75;

interface DevicePresetConfig {
  id: DevicePreset;
  name: string;
  sub: string;
  width: number;
  height: number;
}

const DEVICE_PRESETS: DevicePresetConfig[] = [
  { id: 'samsung', name: 'Standar A-Series', sub: '390 × 844 px', width: 390, height: 844 },
  { id: 'rugged', name: 'Rugged Handheld', sub: '412 × 915 px', width: 412, height: 915 },
  { id: 'compact', name: 'Pocket Phone', sub: '360 × 780 px', width: 360, height: 780 },
];

export default function MobileFieldAppPage() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  // Redirect to dedicated mobile host if configured
  useEffect(() => {
    if (
      DEDICATED_MOBILE_ORIGIN &&
      typeof window !== 'undefined' &&
      window.location.origin !== DEDICATED_MOBILE_ORIGIN
    ) {
      window.location.replace(`${DEDICATED_MOBILE_ORIGIN}/mobile`);
    }
  }, []);

  // Simulator state
  const [devicePreset, setDevicePreset] = useState<DevicePreset>('samsung');
  const [scale, setScale] = useState<ZoomScale>(1);
  const [isOutdoorMode, setIsOutdoorMode] = useState<boolean>(false);
  const [networkMode, setNetworkMode] = useState<NetworkMode>('online');
  const [gpsMode, setGpsMode] = useState<GpsMode>('valid');
  const [deviceId, setDeviceId] = useState<string>('Memuat ID...');
  const [copiedId, setCopiedId] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<string>('09:41');
  const [serverOrigin, setServerOrigin] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location?.origin) {
      setServerOrigin(window.location.origin);
    }
  }, []);

  // Clock tick for simulated status bar
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      setCurrentTime(`${hours}:${minutes}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  const activePreset = useMemo(
    () => DEVICE_PRESETS.find((p) => p.id === devicePreset) || DEVICE_PRESETS[0],
    [devicePreset]
  );

  const handleCopyDeviceId = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(deviceId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  }, [deviceId]);

  const handleFullReset = useCallback(() => {
    if (typeof window !== 'undefined' && window.confirm('Reset seluruh sesi lokal dan cache offline simulator?')) {
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
      } catch {
        // ignore storage errors
      }
      window.location.reload();
    }
  }, []);

  return (
    <main
      className="mobile-shell-root"
      data-mobile-theme={resolvedTheme}
      style={
        {
          '--sim-scale': scale,
          '--sim-phone-width': `${activePreset.width}px`,
          '--sim-phone-height': `${activePreset.height}px`,
        } as React.CSSProperties
      }
    >
      <div className="mobile-sim-workbench">
        {/* Workbench Top Bar (Visible on Desktop) */}
        <header className="mobile-sim-topbar">
          <div className="mobile-sim-branding">
            <div className="mobile-sim-logo-icon" aria-hidden="true">
              <Icon name="smartphone" size={18} />
            </div>
            <div className="mobile-sim-title-group">
              <h1 className="mobile-sim-title">FiberOps Field Mobile Simulator</h1>
              <p className="mobile-sim-subtitle">
                Palembang Regional FTTH Operations • v1.4.0 • {activePreset.name} ({activePreset.width}×{activePreset.height}px)
              </p>
            </div>
          </div>

          <div className="mobile-sim-topbar-actions">
            <div className="mobile-sim-badge">
              <span className="mobile-sim-badge-dot" aria-hidden="true" />
              <span>SIMULATOR AKTIF</span>
            </div>

            <Link href="/dashboard" className="mobile-sim-nav-back" title="Kembali ke Dashboard Portal NOC">
              <Icon name="arrowRight" size={14} style={{ transform: 'rotate(180deg)' }} />
              <span>Portal NOC</span>
            </Link>
          </div>
        </header>

        {/* Simulator Stage (Phone Bezel + Control Deck) */}
        <div className="mobile-sim-stage">
          {/* Hardware Phone Bezel Container */}
          <div className="mobile-sim-device-container">
            <div
              className="mobile-device-bezel"
              data-theme={resolvedTheme}
              data-outdoor={isOutdoorMode ? 'true' : 'false'}
            >
              {/* Simulated Native Hardware Status Bar */}
              <div className="mobile-sim-statusbar" aria-hidden="true">
                <div className="mobile-sim-status-left">
                  <span>{currentTime}</span>
                  <span style={{ fontSize: '10px', opacity: 0.75 }}>WIB</span>
                </div>

                <div className="mobile-sim-status-center">
                  <div className="mobile-sim-island">
                    <div className="mobile-sim-island-lens" />
                  </div>
                </div>

                <div className="mobile-sim-status-right">
                  <span className="mobile-sim-carrier">
                    {networkMode === 'offline' ? 'Tanpa Sinyal' : 'Lintasarta 4G'}
                  </span>

                  <div className="mobile-sim-signal-group">
                    <div className={`mobile-sim-signal-bar ${networkMode !== 'offline' ? 'is-active' : ''}`} />
                    <div className={`mobile-sim-signal-bar ${networkMode !== 'offline' ? 'is-active' : ''}`} />
                    <div className={`mobile-sim-signal-bar ${networkMode === 'online' ? 'is-active' : ''}`} />
                    <div className={`mobile-sim-signal-bar ${networkMode === 'online' ? 'is-active' : ''}`} />
                  </div>

                  <div className="mobile-sim-battery-icon">
                    <div className="mobile-sim-battery-cell">
                      <div className="mobile-sim-battery-fill" />
                    </div>
                    <div className="mobile-sim-battery-tip" />
                  </div>
                </div>
              </div>

              {/* Viewport Hosting Real Mobile App (feat-23 contract compliance) */}
              <div
                className="mobile-shell-viewport"
                data-mobile-theme={resolvedTheme}
                data-outdoor={isOutdoorMode ? 'true' : 'false'}
              >
                <App
                  initialThemeMode={resolvedTheme}
                  themePreference={theme}
                  onThemePreferenceChange={setTheme}
                  outdoorModeOverride={isOutdoorMode}
                  simulatedNetwork={networkMode}
                  simulatedGpsPreset={gpsMode}
                  onDeviceIdLoaded={setDeviceId}
                />
              </div>

              {/* Simulated Native Home Bar */}
              <div className="mobile-sim-homebar" aria-hidden="true">
                <div className="mobile-sim-homebar-pill" />
              </div>
            </div>
          </div>

          {/* Simulator Control Deck */}
          <aside className="mobile-sim-dock" aria-label="Simulator Control Deck">
            {/* 1. Device Viewport Presets */}
            <div className="mobile-sim-dock-section">
              <h2 className="mobile-sim-dock-heading">Profil Perangkat Lapangan</h2>
              <div className="mobile-sim-button-grid-3">
                {DEVICE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setDevicePreset(preset.id)}
                    className={`mobile-sim-btn ${devicePreset === preset.id ? 'is-active' : ''}`}
                  >
                    <span>{preset.name.split(' ')[0]}</span>
                    <span className="mobile-sim-btn-sub">{preset.width}p</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Zoom Scale Slider */}
            <div className="mobile-sim-dock-section">
              <h2 className="mobile-sim-dock-heading">Skala Tampilan Monitor</h2>
              <div className="mobile-sim-button-grid">
                {([1, 0.9, 0.85, 0.75] as ZoomScale[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScale(s)}
                    className={`mobile-sim-btn ${scale === s ? 'is-active' : ''}`}
                  >
                    <span>{Math.round(s * 100)}%</span>
                    <span className="mobile-sim-btn-sub">
                      {s === 1 ? 'Ukuran Penuh' : s === 0.75 ? 'Layar Laptop' : 'Kompak'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <hr className="mobile-sim-divider" />

            {/* 3. Field Condition Emulation (Outdoor Mode) */}
            <div className="mobile-sim-dock-section">
              <h2 className="mobile-sim-dock-heading">Mode Terik Lapangan (Outdoor)</h2>
              <div className="mobile-sim-button-grid">
                <button
                  type="button"
                  onClick={() => setIsOutdoorMode(false)}
                  className={`mobile-sim-btn ${!isOutdoorMode ? 'is-active' : ''}`}
                >
                  <span>Tema Normal</span>
                  <span className="mobile-sim-btn-sub">{resolvedTheme === 'dark' ? 'Gelap' : 'Terang'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsOutdoorMode(true)}
                  className={`mobile-sim-btn ${isOutdoorMode ? 'is-active' : ''}`}
                  title="Aktifkan kontras tinggi 7:1+ untuk pembacaan di bawah sinar matahari"
                >
                  <span>Terik Matahari</span>
                  <span className="mobile-sim-btn-sub">Kontras ≥ 7:1</span>
                </button>
              </div>
            </div>

            {/* 4. Network Simulation */}
            <div className="mobile-sim-dock-section">
              <h2 className="mobile-sim-dock-heading">Kondisi Jaringan Seluler</h2>
              <div className="mobile-sim-button-grid-3">
                <button
                  type="button"
                  onClick={() => setNetworkMode('online')}
                  className={`mobile-sim-btn ${networkMode === 'online' ? 'is-active' : ''}`}
                >
                  <span>4G Normal</span>
                  <span className="mobile-sim-btn-sub">Lancar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNetworkMode('flaky')}
                  className={`mobile-sim-btn ${networkMode === 'flaky' ? 'is-active' : ''}`}
                >
                  <span>3G Lemah</span>
                  <span className="mobile-sim-btn-sub">Latency</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNetworkMode('offline')}
                  className={`mobile-sim-btn ${networkMode === 'offline' ? 'is-active' : ''}`}
                >
                  <span>Offline</span>
                  <span className="mobile-sim-btn-sub">Antrean</span>
                </button>
              </div>
            </div>

            {/* 5. GPS Geofence Simulation */}
            <div className="mobile-sim-dock-section">
              <h2 className="mobile-sim-dock-heading">Simulasi Satelit GPS</h2>
              <div className="mobile-sim-button-grid-3">
                <button
                  type="button"
                  onClick={() => setGpsMode('valid')}
                  className={`mobile-sim-btn ${gpsMode === 'valid' ? 'is-active' : ''}`}
                  title="Koordinat valid di tiang ODP (< 50 meter)"
                >
                  <span>ODP Valid</span>
                  <span className="mobile-sim-btn-sub">&lt; 50m</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGpsMode('outOfRange')}
                  className={`mobile-sim-btn ${gpsMode === 'outOfRange' ? 'is-active' : ''}`}
                  title="Di luar radius geofence (> 200 meter)"
                >
                  <span>Luar Radius</span>
                  <span className="mobile-sim-btn-sub">&gt; 200m</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGpsMode('mock')}
                  className={`mobile-sim-btn ${gpsMode === 'mock' ? 'is-active' : ''}`}
                  title="Simulasi deteksi Fake GPS / Mock Location"
                >
                  <span>Fake GPS</span>
                  <span className="mobile-sim-btn-sub">Law 4 Alert</span>
                </button>
              </div>
            </div>

            <hr className="mobile-sim-divider" />

            {/* 6. Diagnostic Information */}
            <div className="mobile-sim-dock-section">
              <h2 className="mobile-sim-dock-heading">Informasi Diagnostik</h2>
              <div className="mobile-sim-info-box">
                <div>ID Perangkat Terpasang:</div>
                <div className="mobile-sim-copy-row">
                  <code className="mobile-sim-copy-code" title={deviceId}>
                    {deviceId.length > 22 ? `${deviceId.slice(0, 19)}...` : deviceId}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyDeviceId}
                    className="mobile-sim-mini-btn"
                  >
                    {copiedId ? 'Tersalin!' : 'Salin'}
                  </button>
                </div>
                {serverOrigin && (
                  <div style={{ marginTop: '8px', borderTop: '1px solid var(--color-border)', paddingTop: '6px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Origin Server Aktif:</div>
                    <code
                      className="mobile-sim-copy-code"
                      style={{ fontSize: '11px', width: '100%', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={serverOrigin}
                    >
                      {serverOrigin}
                    </code>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleFullReset}
                className="mobile-sim-btn"
                style={{ width: '100%', borderColor: '#EF4444', color: '#DC2626' }}
              >
                <span>Reset Cache & Sesi</span>
                <span className="mobile-sim-btn-sub">Hapus token lokal & reload</span>
              </button>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
