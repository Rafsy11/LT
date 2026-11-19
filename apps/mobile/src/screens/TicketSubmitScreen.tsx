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
 * Generates an immutable UUID v4 for ticket submission idempotency.
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
              ticket.customer.splitterCode || defaultSplitter?.splitterCode || 'ODP-PLB-034',
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

function ArrowLeftIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function MapPinIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function PhoneIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function CameraIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function CheckCircleIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function CompassIcon({ size = 15, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}

/**
 * Redesigned Industrial Field Validation & OPM Submission View.
 * Clean, high contrast, zero AI slop, reliable single-handed field operation.
 */
export function TicketSubmitView(props: TicketSubmitScreenProps) {
  const { state, actions } = TicketSubmitScreen(props);
  const theme = getThemeTokens(props.themeMode || 'light');
  const isDark = props.themeMode === 'dark';

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

  const assignedOdpCode =
    props.ticket.customer.splitterCode ||
    state.selectedSplitter?.splitterCode ||
    'ODP-PLB-034';
  const clusterRaw =
    state.selectedSplitter?.clusterName ||
    props.ticket.customer.clusterName ||
    'H. R. Agam';
  const cleanCluster = clusterRaw.replace(/^Palembang\s+/i, '');
  const assignedOdpDisplay = `${assignedOdpCode} - ${cleanCluster}`;

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '520px',
        margin: '0 auto',
        boxSizing: 'border-box',
        padding: '16px 16px 36px',
        color: theme.textPrimary,
        background: isDark ? '#080E1A' : '#F8FAFC',
        fontFamily: theme.typography.fontFamily.sans,
        overflowX: 'clip',
      }}
    >
      <style>{`
        .fiberops-input:focus-visible {
          outline: 2px solid #1B5CA2;
          outline-offset: 1px;
        }
        .fiberops-input {
          background-color: #FFFFFF !important;
          color: #0F172A !important;
          color-scheme: light;
        }
        .fiberops-input:-webkit-autofill {
          -webkit-box-shadow: 0 0 0 1000px #FFFFFF inset !important;
          -webkit-text-fill-color: #0F172A !important;
        }
        .fiberops-action-btn:active {
          transform: scale(0.98);
        }
        .fiberops-action-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .fiberops-action-btn:focus-visible {
          outline: 2px solid #1B5CA2;
          outline-offset: 2px;
        }
      `}</style>

      {/* Top Navigation & Ticket Number Bar */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          paddingBottom: '14px',
          borderBottom: `1px solid ${theme.border}`,
          marginBottom: '14px',
        }}
      >
        <button
          type="button"
          className="fiberops-action-btn"
          onClick={actions.cancel}
          aria-label="Kembali ke daftar tiket"
          style={{
            height: '38px',
            minHeight: '38px',
            padding: '0 12px',
            background: isDark ? '#10192D' : '#FFFFFF',
            color: theme.textPrimary,
            border: `1px solid ${theme.border}`,
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <ArrowLeftIcon size={14} color="currentColor" />
          <span>Kembali</span>
        </button>

        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontFamily: theme.typography.fontFamily.mono,
              fontSize: '13px',
              fontWeight: 800,
              color: theme.textPrimary,
              letterSpacing: '0.02em',
            }}
          >
            #{state.ticket.ticketNumber}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', marginTop: '2px' }}>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: '3px',
                color: '#FFFFFF',
                background: state.ticketType === 'MAINTENANCE' ? '#D97706' : '#1B5CA2',
              }}
            >
              {state.ticketType === 'MAINTENANCE' ? 'GANGGUAN' : 'PASANG BARU'}
            </span>
          </div>
        </div>
      </header>

      {/* Error Alert Banner */}
      {state.errorMessage && (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            background: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
            border: `1px solid ${isDark ? 'rgba(239, 68, 68, 0.35)' : '#FECACA'}`,
            borderRadius: '6px',
            color: isDark ? '#FCA5A5' : '#B91C1C',
            fontSize: '12px',
            marginBottom: '12px',
            lineHeight: 1.45,
          }}
        >
          {state.errorMessage}
        </div>
      )}

      {/* NOC Rejection Notice if applicable */}
      {state.dispatchLocation.rejectionReason && (
        <div
          style={{
            padding: '10px 14px',
            background: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
            border: `1px solid ${isDark ? 'rgba(239, 68, 68, 0.35)' : '#FECACA'}`,
            borderRadius: '6px',
            color: isDark ? '#FCA5A5' : '#B91C1C',
            fontSize: '12px',
            marginBottom: '12px',
            lineHeight: 1.45,
          }}
        >
          <strong>Catatan Revisi NOC:</strong> {state.dispatchLocation.rejectionReason}
        </div>
      )}

      {/* Customer & Ticket Overview Card */}
      <section
        style={{
          background: isDark ? '#10192D' : '#FFFFFF',
          border: `1px solid ${theme.border}`,
          borderRadius: '8px',
          padding: '14px',
          marginBottom: '12px',
        }}
      >
        <div
          style={{
            fontSize: '16px',
            fontWeight: 800,
            color: theme.textPrimary,
            letterSpacing: '-0.01em',
            marginBottom: '4px',
          }}
        >
          {state.ticket.customer.fullName}
        </div>

        <div
          style={{
            fontSize: '12px',
            fontFamily: theme.typography.fontFamily.mono,
            color: theme.textSecondary,
            marginBottom: '6px',
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '6px',
          }}
        >
          <span>SIA: <strong style={{ color: theme.textPrimary }}>{state.ticket.customer.siaNumber}</strong></span>
          <span style={{ color: theme.border }}>•</span>
          <span>Cluster: <strong style={{ color: theme.textPrimary }}>{state.ticket.customer.clusterName}</strong></span>
        </div>

        <div style={{ fontSize: '12px', color: theme.textSecondary, lineHeight: 1.45, marginBottom: '10px' }}>
          {state.dispatchLocation.serviceAddress}
        </div>

        {/* Action Row: Map navigation & Customer Phone */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="fiberops-action-btn"
            style={{
              flex: 1,
              height: '38px',
              minHeight: '38px',
              padding: '0 12px',
              background: isDark ? '#1E293B' : '#E2E8F0',
              color: theme.textPrimary,
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxSizing: 'border-box',
            }}
          >
            <MapPinIcon size={13} color="currentColor" />
            <span>Rute Peta ODP</span>
          </a>

          {state.dispatchLocation.customerPhone && (
            <a
              href={`tel:${state.dispatchLocation.customerPhone}`}
              className="fiberops-action-btn"
              style={{
                height: '38px',
                minHeight: '38px',
                padding: '0 14px',
                background: isDark ? '#1E293B' : '#E2E8F0',
                color: theme.textPrimary,
                border: `1px solid ${theme.border}`,
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxSizing: 'border-box',
              }}
            >
              <PhoneIcon size={13} color="currentColor" />
              <span>Telepon</span>
            </a>
          )}
        </div>

        {/* Check-In Action when status is OPEN */}
        {state.ticket.status === 'OPEN' && (
          <button
            type="button"
            className="fiberops-action-btn"
            onClick={() => void actions.startExecution()}
            style={{
              width: '100%',
              height: '42px',
              minHeight: '42px',
              marginTop: '10px',
              padding: '0 14px',
              background: '#1B5CA2',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Check-In Mulai Kerja (IN_PROGRESS)
          </button>
        )}
      </section>

      {/* 1. Alokasi ODP Palembang & Port Splitter */}
      <section
        style={{
          background: isDark ? '#10192D' : '#FFFFFF',
          border: `1px solid ${theme.border}`,
          borderRadius: '8px',
          padding: '14px',
          marginBottom: '12px',
        }}
      >
        <label
          style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: 700,
            color: theme.textPrimary,
            marginBottom: '8px',
          }}
        >
          1. Titik ODP & Alokasi Port
        </label>

        {/* Titik ODP Ditugaskan (Fixed / Non-filter) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px',
            background: isDark ? '#080E1A' : '#F1F5F9',
            border: `1px solid ${isDark ? '#1E293B' : '#CBD5E1'}`,
            borderRadius: '6px',
            marginBottom: '10px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 800,
                fontFamily: theme.typography.fontFamily.mono,
                color: theme.textPrimary,
                letterSpacing: '0.01em',
              }}
            >
              {assignedOdpDisplay}
            </span>
            <span style={{ fontSize: '11px', color: theme.textSecondary }}>
              Cluster: {cleanCluster}
            </span>
          </div>
          {state.selectedSplitter && (
            <span
              style={{
                fontSize: '11px',
                fontFamily: theme.typography.fontFamily.mono,
                fontWeight: 700,
                color: isDark ? '#4ADE80' : '#15803D',
              }}
            >
              {state.selectedSplitter.availablePorts.length} Kosong / {state.selectedSplitter.maxPorts} Port
            </span>
          )}
        </div>

        <div style={{ fontSize: '12px', fontWeight: 600, color: theme.textSecondary, marginBottom: '6px' }}>
          Pilih Port (Aktif: Port {activePort}):
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '6px',
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
                  height: '40px',
                  minHeight: '40px',
                  padding: '4px',
                  background: isSelected
                    ? '#1B5CA2'
                    : isOccupiedByOther
                      ? isDark
                        ? 'rgba(239, 68, 68, 0.15)'
                        : '#FEF2F2'
                      : isDark
                        ? '#1E293B'
                        : '#E2E8F0',
                  color: isSelected
                    ? '#FFFFFF'
                    : isOccupiedByOther
                      ? isDark
                        ? '#FCA5A5'
                        : '#DC2626'
                      : theme.textPrimary,
                  border: isSelected
                    ? '1px solid #1B5CA2'
                    : isOccupiedByOther
                      ? `1px solid ${isDark ? 'rgba(239, 68, 68, 0.35)' : '#FECACA'}`
                      : `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: isOccupiedByOther ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.15s ease',
                }}
              >
                P{portNum} {isOccupiedByOther ? '(Isi)' : ''}
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Redaman Optik OPM (dBm) */}
      <section
        style={{
          background: isDark ? '#10192D' : '#FFFFFF',
          border: `1px solid ${theme.border}`,
          borderRadius: '8px',
          padding: '14px',
          marginBottom: '12px',
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
            2. Redaman Optik OPM (dBm)
          </label>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 700,
              background: telemetry.bg,
              color: telemetry.color,
              border: `1px solid ${telemetry.border}`,
              fontFamily: theme.typography.fontFamily.mono,
            }}
          >
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
            title="Tanda minus (-)"
            aria-label="Set nilai minus"
            style={{
              width: '42px',
              height: '42px',
              minHeight: '42px',
              padding: 0,
              background: isDark ? '#1E293B' : '#E2E8F0',
              color: theme.textPrimary,
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
              fontFamily: theme.typography.fontFamily.mono,
              fontSize: '15px',
              fontWeight: 800,
              cursor: 'pointer',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            (-)
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
              height: '42px',
              minHeight: '42px',
              padding: '0 12px',
              fontSize: '15px',
              fontWeight: 700,
              fontFamily: theme.typography.fontFamily.mono,
              background: isDark ? '#080E1A' : '#F8FAFC',
              color: theme.textPrimary,
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
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
                  height: '34px',
                  minHeight: '34px',
                  padding: '2px',
                  background: isPresetActive
                    ? isDark
                      ? '#1E3A8A'
                      : '#DBEAFE'
                    : isDark
                      ? '#1E293B'
                      : '#E2E8F0',
                  color: isPresetActive ? (isDark ? '#93C5FD' : '#1D4ED8') : theme.textSecondary,
                  border: isPresetActive
                    ? '1px solid #1B5CA2'
                    : `1px solid ${theme.border}`,
                  borderRadius: '4px',
                  fontFamily: theme.typography.fontFamily.mono,
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {preset}
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. Verifikasi Lapangan: Lokasi GPS & Foto OPM Ber-Watermark */}
      <section
        style={{
          background: isDark ? '#10192D' : '#FFFFFF',
          border: `1px solid ${theme.border}`,
          borderRadius: '8px',
          padding: '14px',
          marginBottom: '12px',
        }}
      >
        <div style={{ fontSize: '13px', fontWeight: 700, color: theme.textPrimary, marginBottom: '8px' }}>
          3. Verifikasi Lokasi & Bukti Foto OPM
        </div>

        {/* GPS Verification Subcard */}
        <div
          style={{
            padding: '10px 12px',
            background: isDark ? '#080E1A' : '#F8FAFC',
            border: `1px solid ${theme.border}`,
            borderRadius: '6px',
            marginBottom: '10px',
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
            <span style={{ fontSize: '12px', fontWeight: 600, color: theme.textSecondary }}>
              Satelit GPS & Geofence (Maks {state.maxGeofenceMeters}m):
            </span>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: '3px',
                background:
                  state.gpsState === 'VERIFIED_IN_RANGE'
                    ? isDark
                      ? 'rgba(34, 197, 94, 0.15)'
                      : '#F0FDF4'
                    : state.gpsState === 'MOCK_DETECTED'
                      ? isDark
                        ? 'rgba(239, 68, 68, 0.15)'
                        : '#FEF2F2'
                      : state.gpsState === 'FLAGGED_OUT_OF_RANGE'
                        ? isDark
                          ? 'rgba(245, 158, 11, 0.15)'
                          : '#FEF3C7'
                        : isDark
                          ? 'rgba(255, 255, 255, 0.06)'
                          : '#F1F5F9',
                color:
                  state.gpsState === 'VERIFIED_IN_RANGE'
                    ? isDark
                      ? '#4ADE80'
                      : '#15803D'
                    : state.gpsState === 'MOCK_DETECTED'
                      ? isDark
                        ? '#FCA5A5'
                        : '#DC2626'
                      : state.gpsState === 'FLAGGED_OUT_OF_RANGE'
                        ? isDark
                          ? '#FCD34D'
                          : '#B45309'
                        : theme.textSecondary,
                border: `1px solid ${
                  state.gpsState === 'VERIFIED_IN_RANGE'
                    ? isDark
                      ? 'rgba(34, 197, 94, 0.3)'
                      : '#BBF7D0'
                    : state.gpsState === 'MOCK_DETECTED'
                      ? isDark
                        ? 'rgba(239, 68, 68, 0.35)'
                        : '#FECACA'
                      : state.gpsState === 'FLAGGED_OUT_OF_RANGE'
                        ? isDark
                          ? 'rgba(245, 158, 11, 0.3)'
                          : '#FDE68A'
                        : theme.border
                }`,
              }}
            >
              {state.gpsState === 'VERIFIED_IN_RANGE'
                ? 'VALID'
                : state.gpsState === 'MOCK_DETECTED'
                  ? 'FAKE GPS DETECTED'
                  : state.gpsState === 'FLAGGED_OUT_OF_RANGE'
                    ? 'DI LUAR RADIUS'
                    : 'BELUM DIVERIFIKASI'}
            </span>
          </div>

          {state.locationResult?.distanceToSplitterMeters !== undefined && (
            <div style={{ fontSize: '11px', color: theme.textSecondary, marginBottom: '8px', fontFamily: theme.typography.fontFamily.mono }}>
              Jarak ke titik ODP: <strong>{state.locationResult.distanceToSplitterMeters} meter</strong>
            </div>
          )}

          <button
            type="button"
            className="fiberops-action-btn"
            onClick={() => void actions.verifyLocation()}
            disabled={state.gpsState === 'ACQUIRING'}
            style={{
              width: '100%',
              height: '38px',
              minHeight: '38px',
              padding: '0 12px',
              background: isDark ? '#1E293B' : '#E2E8F0',
              color: theme.textPrimary,
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: state.gpsState === 'ACQUIRING' ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <CompassIcon size={14} color="currentColor" />
            <span>{state.gpsState === 'ACQUIRING' ? 'Membaca Satelit GPS...' : 'Verifikasi Koordinat GPS'}</span>
          </button>
        </div>

        {/* OPM Photo Evidence Subcard */}
        <div
          style={{
            padding: '10px 12px',
            background: isDark ? '#080E1A' : '#F8FAFC',
            border: `1px solid ${theme.border}`,
            borderRadius: '6px',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 600, color: theme.textSecondary, marginBottom: '6px' }}>
            Bukti Foto Layar OPM (Watermark Otomatis):
          </div>

          {state.photoEvidence ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 10px',
                background: isDark ? 'rgba(34, 197, 94, 0.15)' : '#F0FDF4',
                border: `1px solid ${isDark ? 'rgba(34, 197, 94, 0.3)' : '#BBF7D0'}`,
                borderRadius: '4px',
                color: isDark ? '#4ADE80' : '#15803D',
                fontSize: '11px',
                marginBottom: '8px',
              }}
            >
              <CheckCircleIcon size={14} color="currentColor" />
              <span>
                Foto Terverifikasi: {state.photoEvidence.width}×{state.photoEvidence.height}px
              </span>
            </div>
          ) : (
            <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>
              Wajib menyertakan foto alat ukur OPM via kamera aplikasi.
            </div>
          )}

          <button
            type="button"
            className="fiberops-action-btn"
            onClick={actions.openCamera}
            style={{
              width: '100%',
              height: '38px',
              minHeight: '38px',
              padding: '0 12px',
              background: state.photoEvidence ? (isDark ? '#1E293B' : '#E2E8F0') : '#1B5CA2',
              color: state.photoEvidence ? theme.textPrimary : '#FFFFFF',
              border: state.photoEvidence ? `1px solid ${theme.border}` : 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <CameraIcon size={15} color="currentColor" />
            <span>{state.photoEvidence ? 'Ambil Ulang Foto Kamera OPM' : 'Buka Kamera OPM In-App'}</span>
          </button>
        </div>
      </section>

      {/* 4. Catatan Teknisi & Tombol Kirim */}
      <section
        style={{
          background: isDark ? '#10192D' : '#FFFFFF',
          border: `1px solid ${theme.border}`,
          borderRadius: '8px',
          padding: '14px',
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
          4. Catatan Teknisi Lapangan (Opsional)
        </label>
        <textarea
          rows={3}
          value={state.technicianNotes}
          onChange={(e) => actions.setTechnicianNotes(e.target.value)}
          placeholder="Contoh: Dropcore 150m terpasang aman, redaman ODP normal (-18.5 dBm)."
          className="fiberops-input"
          style={{
            width: '100%',
            padding: '8px 10px',
            fontSize: '12px',
            background: isDark ? '#080E1A' : '#F8FAFC',
            color: theme.textPrimary,
            border: `1px solid ${theme.border}`,
            borderRadius: '6px',
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
            height: '46px',
            minHeight: '46px',
            padding: '0 16px',
            background: state.isMockBlocked ? (isDark ? '#991B1B' : '#DC2626') : '#1B5CA2',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 700,
            cursor: state.isSubmitting || state.isMockBlocked ? 'not-allowed' : 'pointer',
            opacity: state.isSubmitting ? 0.75 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            letterSpacing: '0.01em',
          }}
        >
          {state.isMockBlocked
            ? 'Diblokir: Fake GPS Terdeteksi'
            : state.isSubmitting
              ? 'Mengirim Laporan...'
              : 'Kirim Laporan Validasi'}
        </button>
      </section>

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
