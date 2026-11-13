'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import type { SubmitTicketInput } from '@repo/shared';
import { classifyDbm } from '@repo/shared';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/providers';
import type { VendorTicketDto, VendorSplitterDto } from '../hooks/use-vendor-tickets';
import '@/styles/components/ticket-modal.css';
import '@/styles/features/vendor.css';

interface VendorReportModalProps {
  ticket: VendorTicketDto | null;
  splitters: VendorSplitterDto[];
  onClose: () => void;
  onUploadPhoto: (ticketId: string, file: File) => Promise<string>;
  onSubmitReport: (ticketId: string, payload: SubmitTicketInput) => Promise<void>;
}

export function VendorReportModal({
  ticket,
  splitters,
  onClose,
  onUploadPhoto,
  onSubmitReport,
}: VendorReportModalProps) {
  const { showError, showSuccess } = useToast();
  const [splitterId, setSplitterId] = useState('');
  const [portNumber, setPortNumber] = useState<number>(1);
  const [attenuationDbm, setAttenuationDbm] = useState<string>('-19.2');
  const [photoObjectKey, setPhotoObjectKey] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submittedLat, setSubmittedLat] = useState<string>('');
  const [submittedLng, setSubmittedLng] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [locatingGps, setLocatingGps] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!ticket) return;

    const matchingSplitter =
      splitters.find((s) => s.splitterCode === ticket.customer.splitterCode) ||
      splitters.find(
        (s) =>
          s.clusterName.toLowerCase().includes(ticket.customer.clusterName.toLowerCase()) ||
          s.clusterCode.toLowerCase() === ticket.customer.clusterCode.toLowerCase(),
      ) ||
      splitters[0];

    const resolvedSplitterId =
      ticket.pendingSubmission?.splitterCode ||
      matchingSplitter?.splitterCode ||
      ticket.customer.splitterCode ||
      'ODP-BDG-01';
    setSplitterId(resolvedSplitterId);

    const resolvedPort =
      ticket.pendingSubmission?.portNumber ||
      ticket.customer.portNumber ||
      matchingSplitter?.availablePorts[0] ||
      1;
    setPortNumber(resolvedPort);

    setAttenuationDbm(
      ticket.pendingSubmission?.attenuationDbm !== undefined
        ? String(ticket.pendingSubmission.attenuationDbm)
        : ticket.customer.currentAttenuation !== null
          ? String(ticket.customer.currentAttenuation)
          : '-19.2',
    );
    setPhotoObjectKey(ticket.pendingSubmission?.photoObjectKey || '');
    setPreviewUrl(null);
    setSubmittedLat(
      String(
        ticket.pendingSubmission?.submittedLat ??
          ticket.targetLat ??
          ticket.customer.lat ??
          matchingSplitter?.lat ??
          -6.914744,
      ),
    );
    setSubmittedLng(
      String(
        ticket.pendingSubmission?.submittedLng ??
          ticket.targetLng ??
          ticket.customer.lng ??
          matchingSplitter?.lng ??
          107.60981,
      ),
    );
    setNotes(ticket.pendingSubmission?.technicianNotes || '');
  }, [ticket, splitters]);

  if (!ticket) return null;

  const activeSplitter = splitters.find(
    (s) => s.splitterCode === splitterId || s.id === splitterId,
  );
  const parsedDbm = Number(attenuationDbm);
  const dbmStatus = !Number.isNaN(parsedDbm) ? classifyDbm(parsedDbm) : 'Critical';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingPhoto(true);
      const localUrl = URL.createObjectURL(file);
      setPreviewUrl(localUrl);
      const uploadedKey = await onUploadPhoto(ticket.id, file);
      setPhotoObjectKey(uploadedKey);
      showSuccess('Foto bukti OPM berhasil diunggah.');
    } catch (err) {
      showError(err);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleUseDeviceGps = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      showError('Browser tidak mendukung Geolocation API.');
      return;
    }
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSubmittedLat(pos.coords.latitude.toFixed(6));
        setSubmittedLng(pos.coords.longitude.toFixed(6));
        setLocatingGps(false);
        showSuccess('Koordinat GPS perangkat berhasil diambil.');
      },
      () => {
        setLocatingGps(false);
        showError('Gagal mengakses GPS perangkat. Gunakan koordinat lokasi target.');
      },
      { enableHighAccuracy: true, timeout: 6000 },
    );
  };

  const handleUseTargetCoords = () => {
    const lat = ticket.targetLat ?? ticket.customer.lat ?? activeSplitter?.lat;
    const lng = ticket.targetLng ?? ticket.customer.lng ?? activeSplitter?.lng;
    if (typeof lat === 'number' && typeof lng === 'number') {
      setSubmittedLat(lat.toFixed(6));
      setSubmittedLng(lng.toFixed(6));
      showSuccess('Koordinat disesuaikan dengan titik lokasi target.');
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submittingRef.current) return;

    const latVal = Number(submittedLat);
    const lngVal = Number(submittedLng);
    if (Number.isNaN(latVal) || Number.isNaN(lngVal)) {
      showError('Koordinat latitude dan longitude wajib valid.');
      return;
    }

    const dbmVal = Number(attenuationDbm);
    if (Number.isNaN(dbmVal) || dbmVal < -40 || dbmVal > 5) {
      showError('Nilai redaman dBm harus berada pada rentang -40.0 sampai 5.0 dBm.');
      return;
    }

    const finalPhotoKey =
      photoObjectKey.trim() ||
      `opm-proofs/web/${ticket.ticketNumber}-${Date.now()}-opm-evidence.jpg`;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onSubmitReport(ticket.id, {
        submissionId:
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : '00000000-0000-4000-8000-000000000099',
        splitterId,
        portNumber,
        attenuationDbm: dbmVal,
        photoObjectKey: finalPhotoKey,
        submittedLat: latVal,
        submittedLng: lngVal,
        isMockLocation: false,
        clientRecordedAt: new Date().toISOString(),
        technicianNotes: notes.trim() || undefined,
        channel: 'WEB',
      });
      onClose();
    } catch (err) {
      showError(err);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose} labelledBy="vendor-report-modal-title">
      <article
        className="modal"
        style={{ maxWidth: '640px', width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="panel-heading">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="ticket-number-tag">{ticket.ticketNumber}</span>
            <h2 id="vendor-report-modal-title" className="ticket-modal-title">
              Kirim Laporan Hasil Pekerjaan Vendor
            </h2>
          </div>
          <button className="dots" onClick={onClose} type="button" aria-label="Tutup modal">
            ×
          </button>
        </header>

        <form className="modal-body" onSubmit={handleSubmit}>
          <section className="ticket-location-card" style={{ marginTop: '10px' }}>
            <div className="ticket-location-title">
              {ticket.customer.fullName} ({ticket.customer.siaNumber})
            </div>
            <div className="ticket-location-address">
              {ticket.locationPlace ? `${ticket.locationPlace} — ` : ''}
              {ticket.serviceAddress}
            </div>
            {ticket.complaintSummary && (
              <div className="ticket-location-complaint">
                <strong>Aduan:</strong> {ticket.complaintSummary}
              </div>
            )}
          </section>

          {ticket.rejectionReason && (
            <aside className="ticket-rejection-alert" role="alert">
              <strong>Catatan Penolakan Pusat:</strong> {ticket.rejectionReason}
            </aside>
          )}

          <div className="ticket-form-grid">
            <label>
              ODP Splitter Terpakai
              <select
                value={splitterId}
                onChange={(e) => setSplitterId(e.target.value)}
                required
              >
                {splitters.length > 0 ? (
                  splitters.map((s) => (
                    <option key={s.id} value={s.splitterCode}>
                      {s.splitterCode} — {s.clusterName} (Sisa {s.availablePorts.length} port)
                    </option>
                  ))
                ) : (
                  <option value={splitterId || 'ODP-BDG-01'}>{splitterId || 'ODP-BDG-01'}</option>
                )}
              </select>
            </label>

            <label>
              Nomor Port Splitter (1-32)
              <input
                type="number"
                min={1}
                max={32}
                required
                value={portNumber}
                onChange={(e) => setPortNumber(Number(e.target.value) || 1)}
              />
              {activeSplitter && (
                <span className="ticket-form-hint">
                  Port kosong: {activeSplitter.availablePorts.slice(0, 8).join(', ') || 'Penuh'}
                </span>
              )}
            </label>
          </div>

          <label>
            Hasil Ukur Redaman Optik OPM Terbaru (dBm)
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '7px' }}>
              <input
                type="number"
                step="0.1"
                min={-40}
                max={5}
                required
                style={{ marginTop: 0 }}
                value={attenuationDbm}
                onChange={(e) => setAttenuationDbm(e.target.value)}
              />
              <span
                className={`badge ${
                  dbmStatus === 'Normal' ? 'green' : dbmStatus === 'Warning' ? 'yellow' : 'red'
                }`}
                style={{ flexShrink: 0, padding: '8px 12px' }}
              >
                {dbmStatus}
              </span>
            </div>
          </label>

          <label>
            Foto Bukti Pengukuran OPM (JPG / PNG / WEBP)
            <div className="vendor-upload-box">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                disabled={uploadingPhoto}
                style={{ border: 'none', padding: 0, marginTop: 0, background: 'transparent' }}
              />
              {uploadingPhoto && (
                <span className="ticket-form-hint">Mengunggah bukti foto ke MinIO Storage...</span>
              )}
              {photoObjectKey && (
                <code style={{ fontSize: '11px', wordBreak: 'break-all' }}>{photoObjectKey}</code>
              )}
              {previewUrl && (
                <Image
                  src={previewUrl}
                  alt="Pratinjau foto bukti OPM"
                  width={320}
                  height={180}
                  unoptimized
                  className="vendor-upload-preview"
                />
              )}
            </div>
          </label>

          <div className="ticket-form-grid">
            <label>
              Latitude Pengerjaan
              <input
                type="number"
                step="any"
                required
                value={submittedLat}
                onChange={(e) => setSubmittedLat(e.target.value)}
              />
            </label>
            <label>
              Longitude Pengerjaan
              <input
                type="number"
                step="any"
                required
                value={submittedLng}
                onChange={(e) => setSubmittedLng(e.target.value)}
              />
            </label>
          </div>

          <div className="vendor-gps-row">
            <button
              type="button"
              className="button secondary modal-link-btn"
              onClick={handleUseDeviceGps}
              disabled={locatingGps}
            >
              <Icon name="compass" size={14} />
              <span>{locatingGps ? 'Mencari GPS...' : 'Ambil GPS Perangkat'}</span>
            </button>
            <button
              type="button"
              className="button secondary modal-link-btn"
              onClick={handleUseTargetCoords}
            >
              <Icon name="mapPin" size={14} />
              <span>Gunakan Titik Target Pelanggan</span>
            </button>
          </div>

          <label>
            Laporan Hasil Pekerjaan &amp; Catatan Vendor
            <textarea
              rows={3}
              required
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Splicing ulang drop core di ODP-BDG-01 Port 2 selesai, redaman akhir -19.2 dBm normal dan koneksi online."
            />
          </label>

          <button
            className="button primary"
            type="submit"
            disabled={submitting || uploadingPhoto}
          >
            {submitting
              ? 'Mengirim Laporan ke Pusat...'
              : 'Kirim Hasil Terbaru ke Pusat Lintasarta'}
          </button>
        </form>
      </article>
    </ModalOverlay>
  );
}
