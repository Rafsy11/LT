'use client';

import React, { useState, useRef } from 'react';
import {
  ATTENUATION_THRESHOLDS,
  classifyDbm,
  OUTDOOR_CONTRAST_TOKENS,
  MAX_GEOFENCE_RADIUS_METERS,
  sanitizeUiErrorMessage,
  ERROR_CODES,
} from '@repo/shared';
import { useToast } from '@/components/ui/ToastProvider';

export default function FieldSimulatorPage() {
  const { showSuccess, showError, showWarning } = useToast();

  // 1. Outdoor Mode Settings
  const [displayMode, setDisplayMode] = useState<'oled_black' | 'sunlight_white' | 'normal'>('oled_black');
  const [dbmInput, setDbmInput] = useState<number>(-18.4);
  const [distanceMeters, setDistanceMeters] = useState<number>(38);
  const [isFakeGpsActive, setIsFakeGpsActive] = useState<boolean>(false);
  const [selectedSplitter, setSelectedSplitter] = useState<string>('ODP-CL01-08');
  const [selectedPort, setSelectedPort] = useState<number>(3);
  const [offlineQueueCount, setOfflineQueueCount] = useState<number>(3);
  const [offlineItems, setOfflineItems] = useState([
    { id: 'sub-01', sia: '100241', type: 'PSB', dbm: -18.2, time: '14:22' },
    { id: 'sub-02', sia: '100242', type: 'MAINTENANCE', dbm: -23.1, time: '14:35' },
    { id: 'sub-03', sia: '100243', type: 'PSB', dbm: -19.0, time: '14:48' },
  ]);

  // 2. Critical Button Debounce & Submit Lock (Requirement 2)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionFeedback, setSubmissionFeedback] = useState<string | null>(null);
  const submitLockRef = useRef<boolean>(false);

  // 3. Outdoor UX computations (Requirement 4)
  const dbmStatus = classifyDbm(dbmInput);
  const tokens = OUTDOOR_CONTRAST_TOKENS[dbmStatus.toUpperCase() as keyof typeof OUTDOOR_CONTRAST_TOKENS];
  const isGeofenceViolation = distanceMeters > MAX_GEOFENCE_RADIUS_METERS;
  const isSubmitLocked = isFakeGpsActive;

  /**
   * Debounce & Instant 1-Millisecond Lock (Requirement 2)
   */
  const handleSimulateSubmit = async () => {
    // Instant guard before any async processing
    if (submitLockRef.current || isSubmitLocked) return;
    submitLockRef.current = true;
    setIsSubmitting(true);
    setSubmissionFeedback(null);

    const idempotencyKey = `uuid-v4-${Date.now()}`;

    try {
      // Simulate cryptographic check & network delay
      await new Promise((resolve) => setTimeout(resolve, 1400));

      if (isGeofenceViolation) {
        showWarning(
          `Laporan terkirim dengan catatan: LOCATION_MISMATCH_WARNING (${distanceMeters}m > ${MAX_GEOFENCE_RADIUS_METERS}m ODP). Memerlukan verifikasi Admin NOC.`
        );
      } else {
        showSuccess(`Laporan OPM berhasil dikirim! (Idempotency Key: ${idempotencyKey.slice(0, 15)}...)`);
      }

      setSubmissionFeedback(
        `✓ Laporan terkirim ke Next.js API & tersimpan di attenuation_histories (Server Time UTC+7)`
      );
    } catch (err: unknown) {
      showError(err);
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  /**
   * Sync Offline Queue Simulator (Requirement 4)
   */
  const handleSyncOfflineQueue = async () => {
    if (offlineQueueCount === 0) {
      showSuccess('Seluruh antrean laporan telah tersinkronisasi.');
      return;
    }

    setIsSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    setOfflineQueueCount(0);
    setOfflineItems([]);
    setIsSubmitting(false);
    showSuccess('Berhasil: 3 Laporan di antrean offline telah terkirim ke server pusat.');
  };

  /**
   * Simulate Raw Server Error -> Verify Sanitization (Requirement 1)
   */
  const handleSimulateLeakAttack = () => {
    // Raw Prisma / PostgreSQL error with table names and stack traces
    const dangerousPrismaError = {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
      clientVersion: '6.1.0',
      message:
        'Unique constraint failed on the constraint: customers_sia_number_key in table public.customers at line 42 of prisma/schema.prisma SELECT * FROM "customers" WHERE "sia_number" = \'100245\'',
      stack:
        'Error: Unique constraint failed at PrismaClient.execute (/apps/web/node_modules/@prisma/client/runtime/library.js:12:45)\n  at CustomerService.createCustomer (/apps/web/src/services/customer.service.ts:88:14)',
    };

    // Trigger toast using sanitized error mapping
    showError(dangerousPrismaError, ERROR_CODES.PORT_OCCUPIED);
  };

  return (
    <main>
      <div className="page-heading">
        <div>
          <h1>Field Simulator & Outdoor UX</h1>
          <p>
            Laboratorium pengujian kontras lapangan terik matahari, deteksi Mock Location, toleransi Geofence ODP, dan antrean offline.
          </p>
        </div>
        <div className="heading-actions">
          <div style={{ display: 'flex', background: '#e2e8f0', padding: '3px', borderRadius: '8px', gap: '3px' }}>
            <button
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                background: displayMode === 'oled_black' ? '#000000' : 'transparent',
                color: displayMode === 'oled_black' ? '#facc15' : '#475569',
                border: displayMode === 'oled_black' ? '1px solid #ca8a04' : 'none',
              }}
              onClick={() => setDisplayMode('oled_black')}
            >
              ☀ OLED Sun Glare (Black)
            </button>
            <button
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                background: displayMode === 'sunlight_white' ? '#ffffff' : 'transparent',
                color: displayMode === 'sunlight_white' ? '#0f172a' : '#475569',
                boxShadow: displayMode === 'sunlight_white' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
              onClick={() => setDisplayMode('sunlight_white')}
            >
              Terik Putih (High Contrast)
            </button>
            <button
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                background: displayMode === 'normal' ? '#1e293b' : 'transparent',
                color: displayMode === 'normal' ? '#f8fafc' : '#475569',
              }}
              onClick={() => setDisplayMode('normal')}
            >
              NOC Indoor
            </button>
          </div>
          <button className="button" onClick={handleSimulateLeakAttack}>
            Uji Sanitasi Error (Anti-Leak)
          </button>
        </div>
      </div>

      <div className="simulator-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '24px', marginTop: '20px' }}>
        {/* Kolom Kiri: Kontrol Pengujian & Keamanan */}
        <div className="simulator-controls" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Card 1: Pengaturan Parameter Lingkungan Lapangan */}
          <section className="panel">
            <div className="panel-heading">
              <h2>Parameter Lingkungan & Hasil Ukur OPM</h2>
              <span className="badge blue">Simulasi Lapangan</span>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>
                  Nilai Ukur Redaman Optik (dBm): <b>{dbmInput} dBm</b>
                </label>
                <input
                  type="range"
                  min="-32.0"
                  max="-8.0"
                  step="0.1"
                  value={dbmInput}
                  onChange={(e) => setDbmInput(parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                  <span>-32.0 dBm (Kritis Drop)</span>
                  <span>-25.0 dBm (Batas Warning)</span>
                  <span>-22.0 dBm (Batas Normal)</span>
                  <span>-15.0 dBm</span>
                  <span>-8.0 dBm (Overpower)</span>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>
                  Jarak GPS Teknisi ke Titik ODP Splitter: <b>{distanceMeters} meter</b>
                </label>
                <input
                  type="range"
                  min="5"
                  max="200"
                  step="1"
                  value={distanceMeters}
                  onChange={(e) => setDistanceMeters(parseInt(e.target.value, 10))}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                  <span>0m (Tepat di tiang ODP)</span>
                  <span style={{ color: '#059669', fontWeight: 600 }}>Toleransi Maks. 100m</span>
                  <span style={{ color: '#dc2626', fontWeight: 600 }}>200m (Geofence Mismatch)</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <div>
                  <b style={{ display: 'block', fontSize: '14px' }}>Simulasikan Fake GPS / Mock Location</b>
                  <small style={{ color: '#64748b' }}>Memeriksa atribut location.mocked dari sistem operasi perangkat</small>
                </div>
                <input
                  type="checkbox"
                  checked={isFakeGpsActive}
                  onChange={(e) => setIsFakeGpsActive(e.target.checked)}
                  style={{ width: '20px', height: '20px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>Pilih Splitter ODP</label>
                  <select value={selectedSplitter} onChange={(e) => setSelectedSplitter(e.target.value)}>
                    <option value="ODP-CL01-08">ODP-CL01-08 (Bandung Utara)</option>
                    <option value="ODP-CL02-16">ODP-CL02-16 (Bandung Timur)</option>
                    <option value="ODP-CL03-08">ODP-CL03-08 (Bandung Barat)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>Nomor Port Fisik</label>
                  <select value={selectedPort} onChange={(e) => setSelectedPort(parseInt(e.target.value, 10))}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
                      <option key={p} value={p}>
                        Port {p} {p === 1 || p === 2 ? '(Terisi - Occupied)' : '(Tersedia)'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* Card 2: Penjelasan Audit & Hardening 4 Detail Antarmuka */}
          <section className="panel">
            <div className="panel-heading">
              <h2>Verifikasi Kepatuhan 4 Detail Antarmuka</h2>
              <span className="badge green">Cybersecurity Ready</span>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
              <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: '6px', borderLeft: '3px solid #0284c7' }}>
                <b>1. Sanitasi Pesan Error (Anti-Information Leakage):</b>
                <p style={{ margin: '4px 0 0', color: '#475569' }}>
                  Seluruh exception dari Prisma ORM dan query PostgreSQL disaring melalui <code>sanitizeUiErrorMessage</code>. Nama tabel, relasi, dan stack trace tidak pernah sampai ke layar pengguna.
                </p>
              </div>

              <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: '6px', borderLeft: '3px solid #0284c7' }}>
                <b>2. State disabled & Debounce pada Tombol Kritis:</b>
                <p style={{ margin: '4px 0 0', color: '#475569' }}>
                  Tombol Submit Laporan dan [Setujui & Eksekusi] dikunci seketika (milidetik ke-0) menggunakan flag <code>disabled={'{isSubmitting}'}</code> dan lock ref sebelum request jaringan selesai.
                </p>
              </div>

              <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: '6px', borderLeft: '3px solid #0284c7' }}>
                <b>3. Conditional Rendering Berdasarkan Permission Matrix:</b>
                <p style={{ margin: '4px 0 0', color: '#475569' }}>
                  Komponen sensitif (Force Logout Teknisi, Buat Tiket, Role Editor) otomatis tersembunyi atau terkunci jika array <code>user.permissions</code> tidak memiliki izin sah. Gunakan bar simulasi di atas untuk menguji.
                </p>
              </div>

              <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: '6px', borderLeft: '3px solid #0284c7' }}>
                <b>4. Visibilitas Lapangan (Outdoor UX):</b>
                <p style={{ margin: '4px 0 0', color: '#475569' }}>
                  Kontras tinggi & rasio WCAG AAA terpasang pada meter redaman, status Fake GPS, peringatan radius Geofence 100m, dan badge Offline Queue teknisi di bawah terik matahari tiang ODP.
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Kolom Kanan: Simulator Layar Ponsel Teknisi (Outdoor Mobile View) */}
        {(() => {
          const isOled = displayMode === 'oled_black';
          const isSunWhite = displayMode === 'sunlight_white';

          return (
            <div className="mobile-phone-frame" style={{
              background: isOled ? '#000000' : isSunWhite ? '#ffffff' : '#0f172a',
              color: isOled ? '#ffffff' : isSunWhite ? '#0f172a' : '#f8fafc',
              border: isOled ? '4px solid #ca8a04' : isSunWhite ? '3px solid #0f172a' : '3px solid #334155',
              borderRadius: '32px',
              padding: '18px 14px',
              boxShadow: isOled ? '0 0 0 2px #000000, 0 20px 40px rgba(0,0,0,0.5)' : '0 20px 40px rgba(0,0,0,0.15)',
              display: 'flex',
              flexDirection: 'column',
              height: 'fit-content',
            }}>
              {/* Header HP Teknisi */}
              <div style={{ textAlign: 'center', borderBottom: isOled ? '2px solid #262626' : isSunWhite ? '2px solid #e2e8f0' : '2px solid #334155', paddingBottom: '12px' }}>
                <div style={{ width: '60px', height: '4px', background: isOled ? '#ca8a04' : isSunWhite ? '#cbd5e1' : '#475569', borderRadius: '2px', margin: '0 auto 8px' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px', color: isOled ? '#facc15' : 'inherit' }}>FIBEROPS MOBILE (FIELD)</span>
                  <span style={{ fontSize: '10px', background: isOled ? '#ca8a04' : isSunWhite ? '#e2e8f0' : '#334155', color: isOled ? '#000000' : 'inherit', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>v1.0.0</span>
                </div>
              </div>

              {/* Badge Offline Queue (Requirement 4) */}
              <div style={{
                marginTop: '12px',
                padding: '10px 12px',
                background: offlineQueueCount > 0 ? (isOled ? '#facc15' : isSunWhite ? '#0284c7' : '#0369a1') : '#10b981',
                color: offlineQueueCount > 0 && isOled ? '#000000' : '#ffffff',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontWeight: 800,
                fontSize: '12px',
              }}>
                <span>
                  {offlineQueueCount > 0
                    ? `⚡ ${offlineQueueCount} Laporan di Offline Queue`
                    : '✓ Semua Laporan Tersinkron'}
                </span>
                {offlineQueueCount > 0 && (
                  <button
                    onClick={handleSyncOfflineQueue}
                    style={{
                      background: isOled ? '#000000' : '#ffffff',
                      color: isOled ? '#facc15' : '#0284c7',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '3px 8px',
                      fontWeight: 800,
                      fontSize: '11px',
                    }}
                  >
                    Sinkron
                  </button>
                )}
              </div>

              {/* Alert Peringatan Fake GPS / Mock Location (Requirement 4) */}
              {isFakeGpsActive && (
                <div style={{
                  marginTop: '10px',
                  padding: '10px 12px',
                  background: '#991b1b',
                  color: '#ffffff',
                  borderRadius: '8px',
                  border: '2px solid #ef4444',
                  fontSize: '12px',
                  fontWeight: 800,
                  lineHeight: 1.3,
                }}>
                  🚨 PERINGATAN INTEGRITAS: Mock Location / Fake GPS Terdeteksi! Tombol Submit Laporan dikunci seketika.
                </div>
              )}

              {/* Alert Peringatan Geofence Radius (Requirement 4) */}
              {isGeofenceViolation && !isFakeGpsActive && (
                <div style={{
                  marginTop: '10px',
                  padding: '10px 12px',
                  background: isOled ? '#451a03' : '#92400e',
                  color: isOled ? '#fef08a' : '#ffffff',
                  borderRadius: '8px',
                  border: isOled ? '2px solid #eab308' : 'none',
                  fontSize: '11px',
                  fontWeight: 800,
                }}>
                  ⚠️ GEOFENCE WARNING: {distanceMeters}m dari ODP (Maks 100m)
                </div>
              )}

              {/* Card Info Tiket Kerja */}
              <div style={{
                marginTop: '12px',
                padding: '12px',
                background: isOled ? '#0a0a0a' : isSunWhite ? '#f8fafc' : '#1e293b',
                borderRadius: '10px',
                border: isOled ? '1px solid #262626' : isSunWhite ? '1px solid #cbd5e1' : '1px solid #334155',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: isOled ? '#38bdf8' : '#0284c7' }}>TIKET #WO-2025-001</span>
                  <span style={{ fontSize: '10px', background: isOled ? '#14532d' : '#dcfce7', color: isOled ? '#86efac' : '#166534', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>PSB</span>
                </div>
                <b style={{ display: 'block', fontSize: '15px', marginTop: '4px' }}>Budi Santoso (SIA: 100245)</b>
                <small style={{ color: isOled ? '#a3a3a3' : isSunWhite ? '#475569' : '#94a3b8', fontSize: '12px' }}>Jl. Dago Asri No. 12, Bandung Utara</small>
              </div>

              {/* INDIKATOR HASIL UKUR REDAMAN (OUTDOOR UX - KONTRAS TINGGI TROPIS) */}
              <div style={{
                marginTop: '14px',
                padding: '18px 12px',
                background: tokens.outdoorBg,
                color: tokens.outdoorText,
                border: `3px solid ${tokens.outdoorBorder}`,
                borderRadius: '14px',
                textAlign: 'center',
                boxShadow: isOled ? `0 0 16px ${tokens.outdoorBorder}44` : 'none',
              }}>
                <span style={{
                  display: 'inline-block',
                  padding: '3px 10px',
                  background: '#ffffff',
                  color: tokens.outdoorBg,
                  borderRadius: '20px',
                  fontSize: '11px',
                  fontWeight: 900,
                  letterSpacing: '1px',
                  marginBottom: '6px',
                }}>
                  STATUS KUALITAS OPTIK: {tokens.label}
                </span>
                <div style={{ fontSize: '42px', fontWeight: 900, letterSpacing: '-1.5px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {dbmInput.toFixed(1)} <span style={{ fontSize: '20px', fontWeight: 700 }}>dBm</span>
                </div>
                <small style={{ display: 'block', marginTop: '8px', fontSize: '11px', opacity: 0.95, fontWeight: 700 }}>
                  Rentang acuan: {tokens.range}
                </small>
              </div>

              {/* Rincian Port Splitter */}
              <div style={{
                marginTop: '12px',
                padding: '10px',
                background: isOled ? '#0a0a0a' : isSunWhite ? '#f8fafc' : '#1e293b',
                borderRadius: '8px',
                border: isOled ? '1px solid #262626' : 'none',
                fontSize: '12px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
              }}>
                <div>
                  <span style={{ color: isOled ? '#a3a3a3' : '#64748b', fontSize: '10px', fontWeight: 600 }}>TITIK ODP:</span>
                  <b style={{ display: 'block' }}>{selectedSplitter}</b>
                </div>
                <div>
                  <span style={{ color: isOled ? '#a3a3a3' : '#64748b', fontSize: '10px', fontWeight: 600 }}>PORT FISIK:</span>
                  <b style={{ display: 'block' }}>Port #{selectedPort}</b>
                </div>
              </div>

              {/* TOMBOL SUBMIT LAPORAN KRITIS (Requirement 2 & 4) */}
              <div style={{ marginTop: '16px' }}>
                <button
                  onClick={handleSimulateSubmit}
                  disabled={isSubmitting || isSubmitLocked}
                  style={{
                    width: '100%',
                    padding: '16px',
                    background: isSubmitLocked
                      ? '#475569'
                      : isSubmitting
                      ? '#0369a1'
                      : isOled
                      ? '#facc15'
                      : isSunWhite
                      ? '#0284c7'
                      : '#2563eb',
                    color: isOled && !isSubmitLocked && !isSubmitting ? '#000000' : '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    fontWeight: 900,
                    fontSize: '15px',
                    letterSpacing: '0.3px',
                    cursor: isSubmitLocked || isSubmitting ? 'not-allowed' : 'pointer',
                    opacity: isSubmitLocked ? 0.6 : 1,
                    boxShadow: isOled && !isSubmitLocked ? '0 0 12px rgba(250, 204, 21, 0.4)' : '0 4px 12px rgba(2, 132, 199, 0.3)',
                    transition: 'all 0.1s ease',
                  }}
                >
                  {isSubmitting
                    ? 'Mengunci & Mengirim Laporan... [1ms Lock]'
                    : isSubmitLocked
                    ? '🔒 Submit Terkunci (Fake GPS)'
                    : 'Kunci & Submit Laporan 🔒'}
                </button>
                <small style={{ display: 'block', textAlign: 'center', marginTop: '8px', fontSize: '10px', color: isOled ? '#a3a3a3' : '#64748b' }}>
                  Dilengkapi Idempotency Key & Kunci 1-Milidetik (Anti-Double Submit)
                </small>
              </div>

              {submissionFeedback && (
                <div style={{
                  marginTop: '10px',
                  padding: '8px',
                  background: isOled ? '#064e3b' : '#dcfce7',
                  color: isOled ? '#6ee7b7' : '#166534',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  textAlign: 'center',
                }}>
                  {submissionFeedback}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </main>
  );
}
