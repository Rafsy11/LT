import React, { useState, useCallback, useRef } from 'react';
import { ApiClient } from '../api/client';
import { acquireVerifiedLocation, LocationGuardResult } from '../security/locationGuard';
import {
  uploadOpmPhotoDualPath,
  ImageManipulatorResult,
} from '../camera/opmCamera';
import { offlineQueue } from '../sync/offlineQueue';
import { MobileTicketItem, SplitterItem } from './TicketListScreen';
import { OpmCameraModalView } from '../components/OpmCameraModal';
import { getThemeTokens, formatOpticalTelemetryDbm } from '../theme/tokens';
import {
  SubmitTicketInput,
  MAX_GEOFENCE_RADIUS_METERS,
  sanitizeUiErrorMessage,
  classifyDbm,
  OUTDOOR_CONTRAST_TOKENS,
  PALEMBANG_ODP_LIST,
} from '@repo/shared';

export interface TicketSubmitScreenProps {
  ticket: MobileTicketItem;
  splitters: SplitterItem[];
  apiClient: ApiClient;
  onSubmitSuccess: (result: { isOffline: boolean; submissionId: string; message: string }) => void;
  onCancel: () => void;
  themeMode?: 'light' | 'dark' | 'outdoorSunlight';
}

export type GpsState =
  | 'IDLE'
  | 'ACQUIRING'
  | 'MOCK_DETECTED'
  | 'VERIFIED_IN_RANGE'
  | 'FLAGGED_OUT_OF_RANGE';

export type CameraState = 'IDLE' | 'CAPTURING' | 'COMPRESSING_AND_WATERMARKING' | 'READY_URI';

export type SubmitLifecycleState = 'IDLE' | 'SUBMITTING' | 'QUEUED_OFFLINE' | 'COMPLETED';

/**
 * Generates an immutable UUID v4 for ticket submission idempotency (Law 3).
 */
function generateUuidV4(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function TicketSubmitScreen({
  ticket,
  splitters,
  apiClient,
  onSubmitSuccess,
  onCancel,
}: TicketSubmitScreenProps) {
  const isPsb = ticket.ticketType === 'PSB';
  const isMaintenance = ticket.ticketType === 'MAINTENANCE';

  const effectiveSplitters = splitters && splitters.length > 0 ? splitters : PALEMBANG_ODP_LIST;

  const defaultSplitter =
    effectiveSplitters.find(
      (s) => s.splitterCode === ticket.customer.splitterCode || s.id === ticket.customer.splitterCode,
    ) ||
    effectiveSplitters.find((s) => s.splitterCode === 'ODP-PLB-001' || s.id === 'ODP-PLB-001') ||
    effectiveSplitters[0];

  const [selectedSplitterId, setSelectedSplitterId] = useState<string>(
    defaultSplitter ? defaultSplitter.id : 'ODP-PLB-001',
  );
  const [selectedPort, setSelectedPort] = useState<number>(ticket.customer.portNumber || 1);
  const [newMutationPort, setNewMutationPort] = useState<number | null>(null);
  const [technicianNotes, setTechnicianNotes] = useState<string>('');

  const [attenuationInput, setAttenuationInput] = useState<string>(
    ticket.customer.currentAttenuation !== null && ticket.customer.currentAttenuation !== undefined
      ? String(ticket.customer.currentAttenuation)
      : '-18.5',
  );

  const last5AttenuationHistory: number[] =
    ticket.customer.attenuationHistory && ticket.customer.attenuationHistory.length > 0
      ? ticket.customer.attenuationHistory.slice(0, 5)
      : ticket.customer.currentAttenuation !== null
        ? [ticket.customer.currentAttenuation]
        : [];

  const [gpsState, setGpsState] = useState<GpsState>('IDLE');
  const [locationResult, setLocationResult] = useState<LocationGuardResult | null>(null);

  const [cameraState, setCameraState] = useState<CameraState>('IDLE');
  const [photoEvidence, setPhotoEvidence] = useState<ImageManipulatorResult | null>(null);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);

  const [submitState, setSubmitState] = useState<SubmitLifecycleState>('IDLE');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLockRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedSplitter =
    effectiveSplitters.find(
      (s) => s.id === selectedSplitterId || s.splitterCode === selectedSplitterId,
    ) || defaultSplitter;

  const handleVerifyLocation = useCallback(async () => {
    try {
      setGpsState('ACQUIRING');
      setErrorMessage(null);

      const targetCoords = selectedSplitter
        ? { latitude: selectedSplitter.lat, longitude: selectedSplitter.lng }
        : undefined;

      const result = await acquireVerifiedLocation(targetCoords);
      setLocationResult(result);

      if (result.isMockLocation) {
        setGpsState('MOCK_DETECTED');
        setErrorMessage('Fake GPS / Mock Location terdeteksi! Pengiriman laporan dinonaktifkan.');
      } else if (
        result.distanceToSplitterMeters !== undefined &&
        result.distanceToSplitterMeters <= MAX_GEOFENCE_RADIUS_METERS
      ) {
        setGpsState('VERIFIED_IN_RANGE');
      } else {
        setGpsState('FLAGGED_OUT_OF_RANGE');
      }

      return result;
    } catch (err) {
      setGpsState('IDLE');
      const sanitized = sanitizeUiErrorMessage(err);
      setErrorMessage(sanitized.message);
      throw err;
    }
  }, [selectedSplitter]);

  const handlePhotoCaptured = (result: ImageManipulatorResult) => {
    setCameraState('COMPRESSING_AND_WATERMARKING');
    setPhotoEvidence(result);
    setCameraState('READY_URI');
    setIsCameraModalOpen(false);
  };

  const handleSubmit = async () => {
    if (submitLockRef.current || gpsState === 'MOCK_DETECTED') return;
    submitLockRef.current = true;

    try {
      setIsSubmitting(true);
      setSubmitState('SUBMITTING');
      setErrorMessage(null);

      const parsedDbm = parseFloat(attenuationInput);
      if (isNaN(parsedDbm)) {
        throw new Error('Nilai redaman optik (dBm) harus berupa angka valid (misal: -18.5).');
      }

      if (!photoEvidence?.uri) {
        throw new Error('Foto bukti pengukuran OPM wajib diambil menggunakan kamera aplikasi.');
      }

      if (!selectedSplitter) {
        throw new Error('Silakan pilih titik ODP Splitter tujuan.');
      }

      const targetPortNumber =
        isMaintenance && newMutationPort !== null ? newMutationPort : selectedPort;

      if (
        selectedSplitter.occupiedPorts.includes(targetPortNumber) &&
        targetPortNumber !== ticket.customer.portNumber
      ) {
        throw new Error(
          `Port ${targetPortNumber} pada ${selectedSplitter.splitterCode} sudah digunakan oleh pelanggan aktif lain.`,
        );
      }

      let activeLocation = locationResult;
      if (!activeLocation) {
        activeLocation = await handleVerifyLocation();
      }

      if (activeLocation.isMockLocation) {
        throw new Error('Perangkat terdeteksi menggunakan Mock Location / Fake GPS.');
      }

      const submissionId = generateUuidV4();
      const recordedAt = activeLocation.clientRecordedAt || new Date().toISOString();

      const payload: SubmitTicketInput = {
        submissionId,
        splitterId: selectedSplitter.splitterCode || selectedSplitter.id || 'ODP-PLB-001',
        portNumber: targetPortNumber,
        attenuationDbm: parsedDbm,
        photoObjectKey: '',
        submittedLat: activeLocation.latitude,
        submittedLng: activeLocation.longitude,
        isMockLocation: activeLocation.isMockLocation,
        clientRecordedAt: recordedAt,
        technicianNotes: technicianNotes.trim() || undefined,
        channel: 'MOBILE',
      };

      try {
        const uploadRes = await uploadOpmPhotoDualPath({
          apiClient,
          ticketId: ticket.id,
          submissionId,
          localPhotoUri: photoEvidence.uri,
          contentType: 'image/jpeg',
        });
        payload.photoObjectKey = uploadRes.photoObjectKey;

        const submitRes = await apiClient.request<unknown>(
          `/api/v1/tech/tickets/${ticket.id}/submit`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
          {
            'X-Idempotency-Key': submissionId,
            'Idempotency-Key': submissionId,
          },
        );

        if (!submitRes.success) {
          throw new Error(submitRes.error?.message || 'Pengiriman laporan gagal');
        }

        setSubmitState('COMPLETED');
        onSubmitSuccess({
          isOffline: false,
          submissionId,
          message: 'Laporan pekerjaan berhasil dikirim ke server pusat.',
        });
      } catch (netErr: unknown) {
        console.warn(
          '[TicketSubmit] Offline/Timeout fallback: storing to offline queue:',
          (netErr as Error).message,
        );

        await offlineQueue.enqueue({
          submissionId,
          ticketId: ticket.id,
          localPhotoUri: photoEvidence.uri,
          payload,
        });

        setSubmitState('QUEUED_OFFLINE');
        onSubmitSuccess({
          isOffline: true,
          submissionId,
          message:
            'Koneksi offline: Laporan tersimpan terenkripsi pada antrean offline HP teknisi dan akan disinkronkan otomatis saat ada sinyal.',
        });
      }
    } catch (err: unknown) {
      setSubmitState('IDLE');
      const sanitized = sanitizeUiErrorMessage(err);
      setErrorMessage(sanitized.message);
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleStartExecution = useCallback(async () => {
    setErrorMessage(null);
    const res = await apiClient.request<unknown>(`/api/v1/tech/tickets/${ticket.id}/start`, {
      method: 'POST',
      body: JSON.stringify({
        channel: 'MOBILE',
        checkInLat: locationResult?.latitude,
        checkInLng: locationResult?.longitude,
      }),
    });
    if (!res.success) {
      const msg = res.error.message || 'Gagal memulai eksekusi lapangan.';
      setErrorMessage(msg);
      throw new Error(msg);
    }
    return res.data;
  }, [apiClient, locationResult?.latitude, locationResult?.longitude, ticket.id]);

  const dbmStatus = classifyDbm(attenuationInput);
  const outdoorTokens =
    OUTDOOR_CONTRAST_TOKENS[dbmStatus.toUpperCase() as keyof typeof OUTDOOR_CONTRAST_TOKENS] ||
    OUTDOOR_CONTRAST_TOKENS.NORMAL;
  const isMockBlocked = gpsState === 'MOCK_DETECTED' || Boolean(locationResult?.isMockLocation);

  return {
    state: {
      ticket,
      ticketType: ticket.ticketType,
      isPsb,
      isMaintenance,
      customerStatus: isPsb ? 'PENDING_INSTALL' : 'ACTIVE',
      dispatchLocation: {
        vendorName: ticket.vendorName || null,
        complaintSummary: ticket.complaintSummary || null,
        customerPhone: ticket.customerPhone || null,
        locationPlace: ticket.locationPlace || null,
        serviceAddress: ticket.serviceAddress || ticket.customer.address,
        targetLat: ticket.targetLat ?? ticket.customer.lat,
        targetLng: ticket.targetLng ?? ticket.customer.lng,
        rejectionReason: ticket.rejectionReason || null,
      },
      maintenanceReadOnly: isMaintenance
        ? {
            siaNumber: ticket.customer.siaNumber,
            customerName: ticket.customer.fullName,
            customerCoordinates: {
              lat: ticket.customer.lat,
              lng: ticket.customer.lng,
            },
            currentOdpSplitter:
              ticket.customer.splitterCode || defaultSplitter?.splitterCode || 'ODP-PLB-001',
            currentPortNumber: ticket.customer.portNumber || 1,
            last5AttenuationHistory,
          }
        : null,
      splitters: effectiveSplitters,
      selectedSplitterId,
      selectedSplitter,
      selectedPort,
      newMutationPort,
      technicianNotes,
      attenuationInput,
      gpsState,
      locationResult,
      cameraState,
      photoEvidence,
      isCameraModalOpen,
      submitState,
      isSubmitting,
      errorMessage,
      isMockBlocked,
      maxGeofenceMeters: MAX_GEOFENCE_RADIUS_METERS,
      dbmStatus,
      outdoorTokens,
    },
    actions: {
      setSelectedSplitterId,
      setSelectedPort,
      setNewMutationPort,
      setTechnicianNotes,
      setAttenuationInput,
      openCamera: () => {
        setCameraState('CAPTURING');
        setIsCameraModalOpen(true);
      },
      closeCamera: () => {
        setCameraState('IDLE');
        setIsCameraModalOpen(false);
      },
      handlePhotoCaptured,
      verifyLocation: handleVerifyLocation,
      startExecution: handleStartExecution,
      submit: handleSubmit,
      cancel: onCancel,
    },
  };
}

/**
 * Interactive Field Validation & OPM Submission View.
 * Provides 5-step guided flow for Palembang ODP selection, port matrix, dBm classification, and camera watermark proof.
 */
export function TicketSubmitView(props: TicketSubmitScreenProps) {
  const { state, actions } = TicketSubmitScreen(props);
  const theme = getThemeTokens(props.themeMode || 'dark');

  const maxPorts = state.selectedSplitter?.maxPorts || 8;
  const portsArray = Array.from({ length: maxPorts }, (_, i) => i + 1);
  const activePort =
    state.isMaintenance && state.newMutationPort !== null
      ? state.newMutationPort
      : state.selectedPort;

  const targetLat = state.dispatchLocation.targetLat ?? state.selectedSplitter?.lat ?? -2.9833;
  const targetLng = state.dispatchLocation.targetLng ?? state.selectedSplitter?.lng ?? 104.7644;
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${targetLat},${targetLng}`;

  const parsedAttenuation = parseFloat(state.attenuationInput);
  const telemetry = formatOpticalTelemetryDbm(isNaN(parsedAttenuation) ? -18.5 : parsedAttenuation);

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '520px',
        margin: '0 auto',
        boxSizing: 'border-box',
        padding: '16px 16px 36px',
        color: theme.textPrimary,
        background: theme.bg,
        fontFamily: theme.typography.fontFamily.sans,
        overflowX: 'clip',
      }}
    >
      <style>{`
        .fiberops-input:focus-visible {
          outline: 2px solid #0284c7;
          outline-offset: 1px;
        }
        .fiberops-action-btn:active {
          transform: scale(0.98);
        }
        .fiberops-action-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .fiberops-action-btn:focus-visible {
          outline: 2px solid #0284c7;
          outline-offset: 2px;
        }
        button, .fiberops-action-btn {
          white-space: nowrap;
        }
      `}</style>

      {/* Top Navigation & Ticket Identity */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '14px',
        }}
      >
        <button
          type="button"
          className="fiberops-action-btn"
          onClick={actions.cancel}
          style={{
            minHeight: '44px',
            padding: '8px 16px',
            background: theme.surfaceElevated,
            color: theme.textPrimary,
            border: `1px solid ${theme.border}`,
            borderRadius: `${theme.radii.button}px`,
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>← Kembali</span>
        </button>

        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontFamily: theme.typography.fontFamily.mono,
              fontSize: '14px',
              fontWeight: 800,
              color: theme.textPrimary,
              letterSpacing: '0.02em',
            }}
          >
            NO. {state.ticket.ticketNumber}
          </div>
          <div style={{ fontSize: '11px', color: theme.textSecondary, marginTop: '2px' }}>
            Tipe: <span style={{ color: state.ticketType === 'MAINTENANCE' ? theme.statusWarning : theme.statusNew, fontWeight: 700 }}>{state.ticketType}</span> | Status: <span style={{ color: theme.accentCyan, fontWeight: 600 }}>{state.ticket.status}</span>
          </div>
        </div>
      </div>

      {/* Error Alert Banner */}
      {state.errorMessage && (
        <div
          role="alert"
          style={{
            padding: '12px 14px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: `${theme.radii.input}px`,
            color: theme.statusCritical,
            fontSize: '12px',
            marginBottom: '14px',
            lineHeight: 1.5,
          }}
        >
          {state.errorMessage}
        </div>
      )}

      {/* NOC Rejection Reason Alert */}
      {state.dispatchLocation.rejectionReason && (
        <div
          style={{
            padding: '12px 14px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: `${theme.radii.input}px`,
            color: theme.statusCritical,
            fontSize: '12px',
            marginBottom: '14px',
            lineHeight: 1.5,
          }}
        >
          <strong>Catatan Revisi NOC:</strong> {state.dispatchLocation.rejectionReason}
        </div>
      )}

      {/* Customer & Dispatch Summary Card */}
      <div
        style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: `${theme.radii.card}px`,
          padding: '16px',
          marginBottom: '14px',
        }}
      >
        <div style={{ fontSize: '16px', fontWeight: 800, color: theme.textPrimary, letterSpacing: '-0.01em' }}>
          {state.ticket.customer.fullName}
        </div>
        <div
          style={{
            fontSize: '12px',
            color: theme.textSecondary,
            fontFamily: theme.typography.fontFamily.mono,
            marginTop: '3px',
          }}
        >
          SIA: <span style={{ color: theme.textPrimary, fontWeight: 600 }}>{state.ticket.customer.siaNumber}</span> | Cluster: {state.ticket.customer.clusterName}
        </div>
        <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '6px', lineHeight: 1.5 }}>
          {state.dispatchLocation.serviceAddress}
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="fiberops-action-btn"
            style={{
              flex: 1,
              minHeight: '44px',
              padding: '8px 12px',
              background: theme.surfaceSecondary,
              color: theme.textPrimary,
              border: `1px solid ${theme.border}`,
              borderRadius: `${theme.radii.button}px`,
              fontSize: '12px',
              fontWeight: 600,
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box',
              textAlign: 'center',
            }}
          >
            Navigasi ke ODP ({targetLat.toFixed(4)}, {targetLng.toFixed(4)})
          </a>

          {state.dispatchLocation.customerPhone && (
            <a
              href={`tel:${state.dispatchLocation.customerPhone}`}
              className="fiberops-action-btn"
              style={{
                minHeight: '44px',
                padding: '8px 14px',
                background: theme.surfaceSecondary,
                color: theme.textPrimary,
                border: `1px solid ${theme.border}`,
                borderRadius: `${theme.radii.button}px`,
                fontSize: '12px',
                fontWeight: 600,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box',
              }}
            >
              Hubungi ({state.dispatchLocation.customerPhone})
            </a>
          )}
        </div>

        {state.ticket.status === 'OPEN' && (
          <button
            type="button"
            className="fiberops-action-btn"
            onClick={() => void actions.startExecution()}
            style={{
              width: '100%',
              minHeight: '44px',
              marginTop: '10px',
              padding: '10px 14px',
              background: theme.primary,
              color: theme.primaryText,
              border: 'none',
              borderRadius: `${theme.radii.button}px`,
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(2, 132, 199, 0.35)',
            }}
          >
            Check-In Mulai Eksekusi Lapangan (Ubah ke IN_PROGRESS)
          </button>
        )}
      </div>

      {/* Maintenance Read-Only Panel */}
      {state.isMaintenance && state.maintenanceReadOnly && (
        <div
          style={{
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: `${theme.radii.card}px`,
            padding: '14px 16px',
            marginBottom: '14px',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: theme.statusWarning, marginBottom: '6px' }}>
            Data Eksisting Pelanggan (Maintenance)
          </div>
          <div style={{ fontSize: '12px', color: theme.textSecondary }}>
            ODP Terdaftar: <strong style={{ color: theme.textPrimary }}>{state.maintenanceReadOnly.currentOdpSplitter}</strong> | Port:{' '}
            <strong style={{ color: theme.textPrimary }}>{state.maintenanceReadOnly.currentPortNumber}</strong>
          </div>
          {state.maintenanceReadOnly.last5AttenuationHistory.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '11px', color: theme.textSecondary, marginBottom: '6px' }}>
                Riwayat 5 Pengukuran Redaman Terakhir:
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {state.maintenanceReadOnly.last5AttenuationHistory.map((val, idx) => (
                  <span
                    key={idx}
                    style={{
                      padding: '4px 8px',
                      background: theme.bg,
                      border: `1px solid ${theme.border}`,
                      borderRadius: `${theme.radii.badge}px`,
                      fontFamily: theme.typography.fontFamily.mono,
                      fontSize: '11px',
                      color: theme.textPrimary,
                      fontWeight: 600,
                    }}
                  >
                    {val} dBm
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 1: GPS & Geofence Verification */}
      <div
        style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: `${theme.radii.card}px`,
          padding: '16px',
          marginBottom: '14px',
        }}
      >
        <div style={{ fontSize: '13px', fontWeight: 700, color: theme.textPrimary, marginBottom: '6px' }}>
          1. Verifikasi Lokasi GPS & Geofence (Maks {state.maxGeofenceMeters}m)
        </div>
        <div style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '10px' }}>
          Status GPS:{' '}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              borderRadius: `${theme.radii.badge}px`,
              fontWeight: 700,
              fontSize: '11px',
              background:
                state.gpsState === 'VERIFIED_IN_RANGE'
                  ? 'rgba(16, 185, 129, 0.15)'
                  : state.gpsState === 'MOCK_DETECTED'
                    ? 'rgba(239, 68, 68, 0.15)'
                    : state.gpsState === 'FLAGGED_OUT_OF_RANGE'
                      ? 'rgba(245, 158, 11, 0.15)'
                      : theme.badgeBg,
              color:
                state.gpsState === 'VERIFIED_IN_RANGE'
                  ? theme.statusOptimal
                  : state.gpsState === 'MOCK_DETECTED'
                    ? theme.statusCritical
                    : state.gpsState === 'FLAGGED_OUT_OF_RANGE'
                      ? theme.statusWarning
                      : theme.textSecondary,
              border: `1px solid ${
                state.gpsState === 'VERIFIED_IN_RANGE'
                  ? 'rgba(16, 185, 129, 0.3)'
                  : state.gpsState === 'MOCK_DETECTED'
                    ? 'rgba(239, 68, 68, 0.35)'
                    : state.gpsState === 'FLAGGED_OUT_OF_RANGE'
                      ? 'rgba(245, 158, 11, 0.3)'
                      : theme.border
              }`,
            }}
          >
            {state.gpsState === 'VERIFIED_IN_RANGE' ? 'VALID (DALAM JANGKAUAN)' : state.gpsState}
          </span>
          {state.locationResult?.distanceToSplitterMeters !== undefined && (
            <span style={{ marginLeft: '6px', fontFamily: theme.typography.fontFamily.mono }}>
              | Jarak ODP: {state.locationResult.distanceToSplitterMeters}m
            </span>
          )}
        </div>

        <button
          type="button"
          className="fiberops-action-btn"
          onClick={() => void actions.verifyLocation()}
          disabled={state.gpsState === 'ACQUIRING'}
          style={{
            width: '100%',
            minHeight: '44px',
            padding: '10px 14px',
            background: theme.surfaceSecondary,
            color: theme.textPrimary,
            border: `1px solid ${theme.border}`,
            borderRadius: `${theme.radii.button}px`,
            fontSize: '12px',
            fontWeight: 600,
            cursor: state.gpsState === 'ACQUIRING' ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          {state.gpsState === 'ACQUIRING' ? 'Membaca Satelit GPS…' : 'Ambil & Verifikasi Koordinat GPS'}
        </button>
      </div>

      {/* Step 2: 90 Palembang ODP Selector & Port Matrix */}
      <div
        style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: `${theme.radii.card}px`,
          padding: '16px',
          marginBottom: '14px',
        }}
      >
        <label
          style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: 700,
            color: theme.textPrimary,
            marginBottom: '6px',
          }}
        >
          2. Pilih Titik ODP Palembang ({state.splitters.length} Titik) & Port
        </label>
        <select
          value={state.selectedSplitterId}
          onChange={(e) => actions.setSelectedSplitterId(e.target.value)}
          className="fiberops-input"
          style={{
            width: '100%',
            minHeight: '44px',
            padding: '10px 12px',
            background: theme.bg,
            color: theme.textPrimary,
            border: `1px solid ${theme.border}`,
            borderRadius: `${theme.radii.input}px`,
            fontSize: '12px',
            fontWeight: 600,
            marginBottom: '8px',
            outline: 'none',
          }}
        >
          {state.splitters.map((odp) => (
            <option key={odp.id} value={odp.id}>
              {odp.splitterCode} [Sisa {odp.availablePorts.length}/{odp.maxPorts} Port] - {odp.clusterName.replace(/^Palembang\s+/i, '')}
            </option>
          ))}
        </select>

        {state.selectedSplitter && (
          <div
            style={{
              padding: '8px 12px',
              background: theme.bg,
              border: `1px solid ${theme.border}`,
              borderRadius: `${theme.radii.input}px`,
              fontSize: '11px',
              color: theme.textSecondary,
              marginBottom: '12px',
              display: 'flex',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '6px',
            }}
          >
            <span>
              Cluster: <strong style={{ color: theme.textPrimary }}>{state.selectedSplitter.clusterName}</strong>
            </span>
            <span style={{ fontFamily: theme.typography.fontFamily.mono }}>
              Kapasitas: <strong style={{ color: theme.statusOptimal }}>{state.selectedSplitter.availablePorts.length} kosong</strong> / {state.selectedSplitter.maxPorts} port
            </span>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '6px',
            marginBottom: '8px',
          }}
        >
          <span style={{ fontSize: '12px', fontWeight: 600, color: theme.textSecondary }}>
            Pilih Port (Aktif: Port {activePort}):
          </span>
          <span style={{ fontSize: '11px', color: theme.textMuted }}>
            [Biru] Dipilih | [Abu] Tersedia | [Merah] Terpakai
          </span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '8px',
          }}
        >
          {portsArray.map((portNum) => {
            const isOccupiedByOther =
              state.selectedSplitter?.occupiedPorts.includes(portNum) &&
              portNum !== state.ticket.customer.portNumber;
            const isSelected = activePort === portNum;

            return (
              <button
                key={portNum}
                type="button"
                className="fiberops-action-btn"
                disabled={isOccupiedByOther}
                onClick={() => {
                  if (state.isMaintenance) {
                    actions.setNewMutationPort(portNum);
                  } else {
                    actions.setSelectedPort(portNum);
                  }
                }}
                style={{
                  minHeight: '44px',
                  padding: '8px',
                  background: isSelected
                    ? theme.primary
                    : isOccupiedByOther
                      ? 'rgba(239, 68, 68, 0.15)'
                      : theme.surfaceSecondary,
                  color: isSelected
                    ? theme.primaryText
                    : isOccupiedByOther
                      ? theme.statusCritical
                      : theme.textPrimary,
                  border: isSelected
                    ? `1px solid ${theme.primary}`
                    : isOccupiedByOther
                      ? '1px solid rgba(239, 68, 68, 0.35)'
                      : `1px solid ${theme.border}`,
                  borderRadius: `${theme.radii.button}px`,
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: isOccupiedByOther ? 'not-allowed' : 'pointer',
                  boxShadow: isSelected ? '0 0 10px rgba(2, 132, 199, 0.35)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                P{portNum} {isOccupiedByOther ? '(Isi)' : ''}
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 3: Optical Attenuation dBm Input */}
      <div
        style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: `${theme.radii.card}px`,
          padding: '16px',
          marginBottom: '14px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px',
          }}
        >
          <label style={{ fontSize: '13px', fontWeight: 700, color: theme.textPrimary }}>
            3. Redaman Optik OPM (dBm)
          </label>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 8px',
              borderRadius: `${theme.radii.badge}px`,
              fontSize: '11px',
              fontWeight: 700,
              background: telemetry.bg,
              color: telemetry.color,
              border: `1px solid ${telemetry.border}`,
              fontFamily: theme.typography.fontFamily.mono,
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: telemetry.color,
                display: 'inline-block',
              }}
            />
            <span>{telemetry.label}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <button
            type="button"
            className="fiberops-action-btn"
            onClick={() => {
              const trimmed = state.attenuationInput.trim();
              if (!trimmed.startsWith('-')) {
                actions.setAttenuationInput(`-${trimmed.replace(/^\+/, '')}`);
              }
            }}
            style={{
              minHeight: '44px',
              padding: '0 16px',
              background: theme.surfaceSecondary,
              color: theme.textPrimary,
              border: `1px solid ${theme.border}`,
              borderRadius: `${theme.radii.button}px`,
              fontFamily: theme.typography.fontFamily.mono,
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            (-) Minus
          </button>
          <input
            type="text"
            inputMode="decimal"
            className="fiberops-input"
            value={state.attenuationInput}
            onChange={(e) => actions.setAttenuationInput(e.target.value)}
            placeholder="-18.5"
            style={{
              flex: 1,
              width: '100%',
              minHeight: '44px',
              padding: '10px 12px',
              fontSize: '15px',
              fontWeight: 700,
              fontFamily: theme.typography.fontFamily.mono,
              background: theme.bg,
              color: theme.textPrimary,
              border: `1px solid ${theme.border}`,
              borderRadius: `${theme.radii.input}px`,
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
          {['-16.5', '-18.5', '-21.0', '-24.5'].map((preset) => {
            const isPresetActive = state.attenuationInput === preset;
            return (
              <button
                key={preset}
                type="button"
                className="fiberops-action-btn"
                onClick={() => actions.setAttenuationInput(preset)}
                style={{
                  minHeight: '44px',
                  padding: '6px',
                  background: isPresetActive ? theme.surfaceElevated : theme.surfaceSecondary,
                  color: isPresetActive ? theme.accentCyan : theme.textSecondary,
                  border: isPresetActive ? `1px solid ${theme.primary}` : `1px solid ${theme.border}`,
                  borderRadius: `${theme.radii.button}px`,
                  fontFamily: theme.typography.fontFamily.mono,
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {preset}
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 4: In-App Watermarked Camera Capture */}
      <div
        style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: `${theme.radii.card}px`,
          padding: '16px',
          marginBottom: '14px',
        }}
      >
        <div style={{ fontSize: '13px', fontWeight: 700, color: theme.textPrimary, marginBottom: '8px' }}>
          4. Bukti Foto OPM Ber-Watermark (&lt; 300 KB)
        </div>

        {state.photoEvidence ? (
          <div
            style={{
              padding: '10px 12px',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: `${theme.radii.input}px`,
              color: theme.statusOptimal,
              fontSize: '12px',
              marginBottom: '10px',
              lineHeight: 1.5,
            }}
          >
            <strong>Foto Terverifikasi:</strong> Resolusi {state.photoEvidence.width}x{state.photoEvidence.height}px
            {state.photoEvidence.watermarkText ? ` | ${state.photoEvidence.watermarkText}` : ''}
          </div>
        ) : (
          <div style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '10px' }}>
            Belum ada foto OPM. Wajib diambil melalui kamera aplikasi.
          </div>
        )}

        <button
          type="button"
          className="fiberops-action-btn"
          onClick={actions.openCamera}
          style={{
            width: '100%',
            minHeight: '44px',
            padding: '10px 14px',
            background: state.photoEvidence ? theme.surfaceSecondary : theme.primary,
            color: theme.primaryText,
            border: state.photoEvidence ? `1px solid ${theme.border}` : 'none',
            borderRadius: `${theme.radii.button}px`,
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: state.photoEvidence ? 'none' : '0 2px 10px rgba(2, 132, 199, 0.35)',
            transition: 'all 0.15s ease',
          }}
        >
          {state.photoEvidence ? 'Ambil Ulang Foto Kamera OPM' : 'Buka Kamera OPM In-App'}
        </button>
      </div>

      {/* Step 5: Technician Notes & Submit */}
      <div
        style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: `${theme.radii.card}px`,
          padding: '16px',
          marginBottom: '20px',
        }}
      >
        <label
          style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: 700,
            color: theme.textPrimary,
            marginBottom: '6px',
          }}
        >
          5. Catatan Teknisi Lapangan (Opsional)
        </label>
        <textarea
          rows={3}
          value={state.technicianNotes}
          onChange={(e) => actions.setTechnicianNotes(e.target.value)}
          placeholder="Contoh: Dropcore 150m terpasang aman, konektor SC-UPC bersih."
          className="fiberops-input"
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: '12px',
            background: theme.bg,
            color: theme.textPrimary,
            border: `1px solid ${theme.border}`,
            borderRadius: `${theme.radii.input}px`,
            boxSizing: 'border-box',
            marginBottom: '12px',
            fontFamily: theme.typography.fontFamily.sans,
            outline: 'none',
          }}
        />

        <button
          type="button"
          className="fiberops-action-btn"
          disabled={state.isSubmitting || state.isMockBlocked}
          onClick={() => void actions.submit()}
          style={{
            width: '100%',
            minHeight: '48px',
            padding: '12px 16px',
            background: state.isMockBlocked ? theme.statusDanger : theme.primary,
            color: theme.primaryText,
            border: 'none',
            borderRadius: `${theme.radii.button}px`,
            fontSize: '14px',
            fontWeight: 700,
            cursor: state.isSubmitting || state.isMockBlocked ? 'not-allowed' : 'pointer',
            opacity: state.isSubmitting ? 0.75 : 1,
            boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)',
            transition: 'all 0.15s ease',
          }}
        >
          {state.isMockBlocked
            ? 'Diblokir: Fake GPS Terdeteksi'
            : state.isSubmitting
              ? 'Mengirim & Mengenkripsi Laporan…'
              : 'Kirim Laporan Validasi'}
        </button>
      </div>

      <OpmCameraModalView
        visible={state.isCameraModalOpen}
        onClose={actions.closeCamera}
        onPhotoCaptured={actions.handlePhotoCaptured}
        ticketNumber={state.ticket.ticketNumber}
        odpId={state.selectedSplitter?.splitterCode || 'ODP-PLB-001'}
        latitude={state.locationResult?.latitude ?? targetLat}
        longitude={state.locationResult?.longitude ?? targetLng}
        attenuationDbm={state.attenuationInput}
        themeMode={props.themeMode}
      />
    </div>
  );
}
