'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { useToast } from '@/providers';
import { invalidateQueryCache } from '@/lib/query-cache';

export interface ImportSummary {
  totalRows: number;
  uniqueSias: number;
  uniqueSplitters: number;
  clusters: number;
  rowsWithoutOdp: number;
  duplicateSiasMerged: number;
  commaCoordinatesNormalized: number;
  outliersDetected: number;
}

export interface DuplicateSiaAnomaly {
  sia: string;
  keptRow: number;
  droppedRow: number;
  reason: string;
}

export interface OutlierAnomaly {
  sia: string;
  name: string;
  lat: number;
  lng: number;
  locationNote: string;
}

export interface CoordinateFixAnomaly {
  rowNumber: number;
  field: 'customer' | 'odp';
  raw: string;
  parsedLat: number;
  parsedLng: number;
}

export interface ImportAnomalies {
  duplicateSias: DuplicateSiaAnomaly[];
  outliers: OutlierAnomaly[];
  coordinateFixes: CoordinateFixAnomaly[];
}

export interface ImportCounts {
  clustersUpserted: number;
  splittersUpserted: number;
  customersUpserted: number;
}

export interface DatekImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type ImportStep = 'SELECT_FILE' | 'ANALYZING' | 'PREVIEW' | 'APPLYING' | 'SUCCESS';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

export function DatekImportModal({ isOpen, onClose, onSuccess }: DatekImportModalProps) {
  const { showError, showSuccess } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>('SELECT_FILE');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Preview & execution state
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [anomalies, setAnomalies] = useState<ImportAnomalies | null>(null);
  const [counts, setCounts] = useState<ImportCounts | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  // Collapsible panels state for step 2
  const [expandedAnomalies, setExpandedAnomalies] = useState<{
    duplicates: boolean;
    coordinates: boolean;
    outliers: boolean;
    noOdp: boolean;
  }>({
    duplicates: false,
    coordinates: false,
    outliers: false,
    noOdp: false,
  });

  const resetState = useCallback(() => {
    setStep('SELECT_FILE');
    setSelectedFile(null);
    setIsDragging(false);
    setErrorMessage(null);
    setSummary(null);
    setAnomalies(null);
    setCounts(null);
    setDurationMs(null);
    setExpandedAnomalies({
      duplicates: false,
      coordinates: false,
      outliers: false,
      noOdp: false,
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleClose = useCallback(() => {
    if (step === 'APPLYING') return; // Do not dismiss while applying transaction
    resetState();
    onClose();
  }, [step, resetState, onClose]);

  const processFile = useCallback(
    async (file: File) => {
      const lowerName = file.name.toLowerCase();
      const isAllowed = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
      if (!isAllowed) {
        setErrorMessage('Format file tidak didukung. Harap unggah lembar kerja .xlsx, .xls, atau .csv.');
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        setErrorMessage('Ukuran file melebihi batas maksimum 10MB.');
        return;
      }

      setSelectedFile(file);
      setErrorMessage(null);
      setStep('ANALYZING');

      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/v1/admin/network/import?dryRun=true', {
          method: 'POST',
          body: formData,
        });

        const json = await response.json();
        if (!response.ok || !json.success) {
          throw new Error(json.error?.message || 'Gagal memproses pratinjau lembar kerja datek.');
        }

        setSummary(json.data.summary);
        setAnomalies(json.data.anomalies);
        setStep('PREVIEW');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Terjadi kesalahan saat menganalisis file.';
        setErrorMessage(msg);
        setStep('SELECT_FILE');
        showError(msg);
      }
    },
    [showError],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file) {
          void processFile(file);
        }
      }
    },
    [processFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        const file = e.target.files[0];
        if (file) {
          void processFile(file);
        }
      }
    },
    [processFile],
  );

  const handleConfirmImport = async () => {
    if (!selectedFile) return;

    setStep('APPLYING');
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/v1/admin/network/import?dryRun=false', {
        method: 'POST',
        body: formData,
      });

      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message || 'Gagal menerapkan sinkronisasi master data datek.');
      }

      setCounts(json.data.counts);
      setDurationMs(json.data.durationMs);
      setSummary(json.data.summary);
      setAnomalies(json.data.anomalies);
      setStep('SUCCESS');

      // Invalidate relevant query caches across views
      invalidateQueryCache(
        '/api/v1/admin/clusters',
        '/api/v1/admin/clusters/options',
        '/api/v1/admin/customers',
        '/api/v1/admin/overview',
      );

      // Dispatch global refresh event for any mounted listeners
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('app:refresh-data'));
      }

      showSuccess('Master data Palembang GPON & ODP berhasil disinkronisasi ke PostgreSQL!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan master data datek ke database.';
      setErrorMessage(msg);
      setStep('PREVIEW');
      showError(msg);
    }
  };

  const handleFinish = () => {
    onSuccess?.();
    handleClose();
  };

  if (!isOpen) return null;

  return (
    <ModalOverlay onClose={handleClose} labelledBy="datek-import-modal-title">
      <article
        className="modal datek-import-modal-container"
        style={{ maxWidth: '640px', width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="panel-heading datek-import-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="modal-icon-wrap">
              <Icon name="upload" size={18} />
            </div>
            <div>
              <h2 id="datek-import-modal-title" className="modal-heading">
                Import Datek Master GPON & ODP
              </h2>
              <p className="modal-subheading">
                Unggah lembar kerja .xlsx atau .csv untuk sinkronisasi master data Palembang
              </p>
            </div>
          </div>
          {step !== 'APPLYING' && (
            <button className="dots" type="button" onClick={handleClose} aria-label="Tutup modal">
              ×
            </button>
          )}
        </header>

        {/* Modal Body */}
        <div className="modal-body datek-import-body">
          {errorMessage && (
            <div className="datek-alert-box is-error" role="alert">
              <div className="datek-alert-icon">
                <Icon name="alert" size={16} />
              </div>
              <div className="datek-alert-content">
                <span className="datek-alert-title">Kesalahan Pemrosesan</span>
                <p className="datek-alert-text">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* STEP 1: SELECT FILE / DROPZONE */}
          {step === 'SELECT_FILE' && (
            <div className="datek-step-content">
              <div
                className={`datek-dropzone ${isDragging ? 'is-dragging' : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                aria-label="Pilih atau seret lembar kerja datek Palembang"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileInputChange}
                  style={{ display: 'none' }}
                />
                <div className="datek-dropzone-icon">
                  <Icon name="upload" size={32} />
                </div>
                <div className="datek-dropzone-titles">
                  <span className="datek-dropzone-label">
                    Tarik & letakkan file datek di sini, atau <b>jelajahi file</b>
                  </span>
                  <span className="datek-dropzone-hint">
                    Format didukung: <b>.xlsx, .xls, .csv</b> (Maksimum 10MB)
                  </span>
                </div>
                <div className="datek-dropzone-tags">
                  <span className="datek-tag-chip">Sheet: GPON PLB</span>
                  <span className="datek-tag-chip">Auto-mapping Kolom</span>
                  <span className="datek-tag-chip">Deteksi Outlier</span>
                </div>
              </div>

              <div className="datek-info-guide">
                <div className="datek-guide-title">
                  <Icon name="spark" size={14} />
                  <span>Petunjuk Format Integrasi Palembang</span>
                </div>
                <p className="datek-guide-text">
                  Sistem otomatis mendeteksi header standar (SIA, Customer Name, Lat/Long Customer, Nama ODP, Lat/Long ODP, Port ODP, Node Akses GPON, SN Modem ONT, Slot OLT, Redaman, Catatan).
                  Format koordinat koma (mis. <code>-2,987</code>) akan dinormalisasi ke desimal titik secara otomatis.
                </p>
              </div>
            </div>
          )}

          {/* STEP: ANALYZING SPINNER */}
          {step === 'ANALYZING' && (
            <div className="datek-loading-state">
              <div className="datek-spinner" />
              <span className="datek-loading-title">Menganalisis Lembar Kerja Datek...</span>
              <p className="datek-loading-subtitle">
                Memverifikasi 4 cluster GPON, deduplikasi koordinat ODP, normalisasi SIA, dan memfilter outlier wilayah.
              </p>
            </div>
          )}

          {/* STEP 2: DRY-RUN PREVIEW */}
          {step === 'PREVIEW' && summary && (
            <div className="datek-step-content">
              {/* File Info Bar */}
              <div className="datek-file-meta-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Icon name="fileText" size={16} />
                  <span className="datek-file-name">{selectedFile?.name || 'lembar-kerja.xlsx'}</span>
                  <span className="datek-file-size">
                    {selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : ''}
                  </span>
                </div>
                <span className="datek-badge-preview">Pratinjau Dry-Run</span>
              </div>

              {/* 4-Card Summary Grid */}
              <div className="datek-summary-grid">
                <div className="datek-summary-card">
                  <span className="datek-card-label">Total Baris</span>
                  <span className="datek-card-value mono">{summary.totalRows}</span>
                  <span className="datek-card-desc">Baris diproses</span>
                </div>
                <div className="datek-summary-card">
                  <span className="datek-card-label">SIA Unik</span>
                  <span className="datek-card-value mono">{summary.uniqueSias}</span>
                  <span className="datek-card-desc">Pelanggan aktif</span>
                </div>
                <div className="datek-summary-card">
                  <span className="datek-card-label">ODP Unik</span>
                  <span className="datek-card-value mono">{summary.uniqueSplitters}</span>
                  <span className="datek-card-desc">Titik splitter ODP</span>
                </div>
                <div className="datek-summary-card">
                  <span className="datek-card-label">Cluster GPON</span>
                  <span className="datek-card-value mono">{summary.clusters}</span>
                  <span className="datek-card-desc">Node akses FTTH</span>
                </div>
              </div>

              {/* Anomaly Notification Panels */}
              <div className="datek-anomalies-deck">
                {/* 1. SIA Duplikat */}
                <div className="datek-anomaly-panel">
                  <button
                    type="button"
                    className="datek-anomaly-header"
                    onClick={() =>
                      setExpandedAnomalies((prev) => ({ ...prev, duplicates: !prev.duplicates }))
                    }
                    aria-expanded={expandedAnomalies.duplicates}
                  >
                    <div className="datek-anomaly-summary-line">
                      <span className="datek-anomaly-indicator is-info" />
                      <div className="datek-anomaly-titles">
                        <span className="datek-anomaly-title">
                          {summary.duplicateSiasMerged} SIA Duplikat Digabung
                        </span>
                        <span className="datek-anomaly-desc">
                          Data teknis terlengkap (ODP, Port, Redaman) diprioritaskan otomatis.
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="datek-chip-status is-info">Auto-Merge</span>
                      <Icon
                        name={expandedAnomalies.duplicates ? 'chevron' : 'chevronRight'}
                        size={14}
                      />
                    </div>
                  </button>

                  {expandedAnomalies.duplicates && anomalies?.duplicateSias && (
                    <div className="datek-anomaly-detail-table-wrap">
                      <table className="datek-anomaly-table">
                        <thead>
                          <tr>
                            <th>No. SIA</th>
                            <th>Baris Terpilih</th>
                            <th>Baris Dilewati</th>
                            <th>Alasan Prioritas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {anomalies.duplicateSias.map((d) => (
                            <tr key={d.sia}>
                              <td className="mono">{d.sia}</td>
                              <td className="mono">Baris {d.keptRow}</td>
                              <td className="mono">Baris {d.droppedRow}</td>
                              <td>{d.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 2. Format Koordinat Desimal Koma */}
                <div className="datek-anomaly-panel">
                  <button
                    type="button"
                    className="datek-anomaly-header"
                    onClick={() =>
                      setExpandedAnomalies((prev) => ({ ...prev, coordinates: !prev.coordinates }))
                    }
                    aria-expanded={expandedAnomalies.coordinates}
                  >
                    <div className="datek-anomaly-summary-line">
                      <span className="datek-anomaly-indicator is-success" />
                      <div className="datek-anomaly-titles">
                        <span className="datek-anomaly-title">
                          {summary.commaCoordinatesNormalized} Koordinat Format Koma Dinormalisasi
                        </span>
                        <span className="datek-anomaly-desc">
                          Format desimal koma (mis. -2,987) dinormalisasi ke float desimal standar titik.
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="datek-chip-status is-success">Normalisasi Float</span>
                      <Icon
                        name={expandedAnomalies.coordinates ? 'chevron' : 'chevronRight'}
                        size={14}
                      />
                    </div>
                  </button>

                  {expandedAnomalies.coordinates && anomalies?.coordinateFixes && (
                    <div className="datek-anomaly-detail-table-wrap">
                      <table className="datek-anomaly-table">
                        <thead>
                          <tr>
                            <th>Baris</th>
                            <th>Bidang</th>
                            <th>Teks Asli</th>
                            <th>Koordinat Normalisasi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {anomalies.coordinateFixes.map((c, idx) => (
                            <tr key={idx}>
                              <td className="mono">#{c.rowNumber}</td>
                              <td>{c.field === 'customer' ? 'Pelanggan' : 'Splitter ODP'}</td>
                              <td className="mono">{c.raw}</td>
                              <td className="mono">
                                {c.parsedLat.toFixed(6)}, {c.parsedLng.toFixed(6)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 3. Outlier Luar Wilayah */}
                <div className="datek-anomaly-panel">
                  <button
                    type="button"
                    className="datek-anomaly-header"
                    onClick={() =>
                      setExpandedAnomalies((prev) => ({ ...prev, outliers: !prev.outliers }))
                    }
                    aria-expanded={expandedAnomalies.outliers}
                  >
                    <div className="datek-anomaly-summary-line">
                      <span className="datek-anomaly-indicator is-warning" />
                      <div className="datek-anomaly-titles">
                        <span className="datek-anomaly-title">
                          {summary.outliersDetected} Outlier Koordinat Luar Wilayah Terdeteksi
                        </span>
                        <span className="datek-anomaly-desc">
                          Koordinat di luar Sumsel (Tangerang, Bandung, Lampung) dikecualikan dari bounding box peta Palembang.
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="datek-chip-status is-warning">Eksklusi Peta</span>
                      <Icon
                        name={expandedAnomalies.outliers ? 'chevron' : 'chevronRight'}
                        size={14}
                      />
                    </div>
                  </button>

                  {expandedAnomalies.outliers && anomalies?.outliers && (
                    <div className="datek-anomaly-detail-table-wrap">
                      <table className="datek-anomaly-table">
                        <thead>
                          <tr>
                            <th>SIA</th>
                            <th>Nama Pelanggan</th>
                            <th>Koordinat</th>
                            <th>Catatan Lokasi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {anomalies.outliers.map((o) => (
                            <tr key={o.sia}>
                              <td className="mono">{o.sia}</td>
                              <td>{o.name}</td>
                              <td className="mono">
                                {o.lat.toFixed(6)}, {o.lng.toFixed(6)}
                              </td>
                              <td>{o.locationNote}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 4. Pelanggan Tanpa ODP */}
                <div className="datek-anomaly-panel">
                  <div className="datek-anomaly-header" style={{ cursor: 'default' }}>
                    <div className="datek-anomaly-summary-line">
                      <span className="datek-anomaly-indicator is-neutral" />
                      <div className="datek-anomaly-titles">
                        <span className="datek-anomaly-title">
                          {summary.rowsWithoutOdp} Pelanggan Tanpa ODP Terdaftar
                        </span>
                        <span className="datek-anomaly-desc">
                          Tersimpan sebagai pelanggan aktif dengan splitter dan port bernilai null tanpa kehilangan data.
                        </span>
                      </div>
                    </div>
                    <span className="datek-chip-status is-neutral">Port Null</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP: APPLYING SPINNER */}
          {step === 'APPLYING' && (
            <div className="datek-loading-state">
              <div className="datek-spinner" />
              <span className="datek-loading-title">Menyimpan Master Data ke PostgreSQL...</span>
              <p className="datek-loading-subtitle">
                Mengeksekusi upsert transaksional untuk 4 cluster, {summary?.uniqueSplitters || '~90'} splitter ODP, dan {summary?.uniqueSias || '401'} pelanggan dengan audit log.
              </p>
            </div>
          )}

          {/* STEP 3: SUCCESS COMPLETION */}
          {step === 'SUCCESS' && counts && (
            <div className="datek-success-state">
              <div className="datek-success-icon-wrap">
                <Icon name="check" size={32} />
              </div>
              <h3 className="datek-success-title">Sinkronisasi Master Data Palembang Berhasil</h3>
              <p className="datek-success-subtitle">
                Data master topologi FTTH GPON & ODP Palembang telah berhasil disimpan ke database PostgreSQL.
              </p>

              <div className="datek-success-grid">
                <div className="datek-success-card">
                  <span className="datek-success-label">Cluster GPON</span>
                  <span className="datek-success-val mono">{counts.clustersUpserted}</span>
                  <span className="datek-success-sub">Tersinkronisasi</span>
                </div>
                <div className="datek-success-card">
                  <span className="datek-success-label">Splitter ODP</span>
                  <span className="datek-success-val mono">{counts.splittersUpserted}</span>
                  <span className="datek-success-sub">Terpetakan</span>
                </div>
                <div className="datek-success-card">
                  <span className="datek-success-label">Pelanggan (SIA)</span>
                  <span className="datek-success-val mono">{counts.customersUpserted}</span>
                  <span className="datek-success-sub">Data master</span>
                </div>
                <div className="datek-success-card">
                  <span className="datek-success-label">Waktu Eksekusi</span>
                  <span className="datek-success-val mono">
                    {durationMs != null ? `${durationMs} ms` : '—'}
                  </span>
                  <span className="datek-success-sub">Transaksional</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <footer className="panel-footer datek-import-footer">
          {step === 'SELECT_FILE' && (
            <div className="datek-footer-row is-right">
              <button type="button" className="button secondary" onClick={handleClose}>
                Tutup
              </button>
            </div>
          )}

          {step === 'PREVIEW' && (
            <div className="datek-footer-row is-between">
              <button
                type="button"
                className="button secondary"
                onClick={resetState}
              >
                <Icon name="refresh" size={14} />
                <span>Ganti File / Batal</span>
              </button>
              <button
                type="button"
                className="button primary"
                onClick={handleConfirmImport}
              >
                <Icon name="check" size={14} />
                <span>Konfirmasi & Terapkan Impor</span>
              </button>
            </div>
          )}

          {step === 'SUCCESS' && (
            <div className="datek-footer-row is-right">
              <button
                type="button"
                className="button primary"
                onClick={handleFinish}
              >
                <Icon name="check" size={14} />
                <span>Selesai</span>
              </button>
            </div>
          )}
        </footer>
      </article>
    </ModalOverlay>
  );
}
