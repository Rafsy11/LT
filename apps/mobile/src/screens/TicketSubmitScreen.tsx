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
import { getThemeTokens } from '../theme/tokens';
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
  const theme = getThemeTokens(props.themeMode || 'light');

  const maxPorts = state.selectedSplitter?.maxPorts || 8;
  const portsArray = Array.from({ length: maxPorts }, (_, i) => i + 1);
  const activePort =
    state.isMaintenance && state.newMutationPort !== null
      ? state.newMutationPort
      : state.selectedPort;

  const targetLat = state.dispatchLocation.targetLat ?? state.selectedSplitter?.lat ?? -2.9833;
  const targetLng = state.dispatchLocation.targetLng ?? state.selectedSplitter?.lng ?? 104.7644;
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${targetLat},${targetLng}`;

  return (
    <div
      style={{
        maxWidth: '520px',
        margin: '0 auto',
        padding: '16px',
        color: theme.textPrimary,
        fontFamily: theme.typography.fontFamily.sans,
      }}
    >
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
          onClick={actions.cancel}
          style={{
            minHeight: '44px',
            padding: '8px 14px',
            background: theme.surface,
            color: theme.textPrimary,
            border: `1px solid ${theme.border}`,
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          ← Kembali
        </button>

        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontFamily: theme.typography.fontFamily.mono,
              fontSize: '14px',
              fontWeight: 700,
              color: theme.textPrimary,
            }}
          >
            {state.ticket.ticketNumber}
          </div>
          <div style={{ fontSize: '11px', color: theme.textSecondary }}>
            Tipe: {state.ticketType} | Status: {state.ticket.status}
          </div>
        </div>
      </div>

      {/* Error Alert Banner */}
      {state.errorMessage && (
        <div
          role="alert"
          style={{
            padding: '12px',
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '6px',
            color: '#991B1B',
            fontSize: '12px',
            marginBottom: '14px',
          }}
        >
          {state.errorMessage}
        </div>
      )}

      {/* NOC Rejection Reason Alert */}
      {state.dispatchLocation.rejectionReason && (
        <div
          style={{
            padding: '12px',
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '6px',
            color: '#991B1B',
            fontSize: '12px',
            marginBottom: '14px',
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
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '14px',
        }}
      >
        <div style={{ fontSize: '15px', fontWeight: 700, color: theme.textPrimary }}>
          {state.ticket.customer.fullName}
        </div>
        <div
          style={{
            fontSize: '12px',
            color: theme.textSecondary,
            fontFamily: theme.typography.fontFamily.mono,
            marginTop: '2px',
          }}
        >
          SIA: {state.ticket.customer.siaNumber} | Cluster: {state.ticket.customer.clusterName}
        </div>
        <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '6px', lineHeight: 1.5 }}>
          {state.dispatchLocation.serviceAddress}
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1,
              minHeight: '44px',
              padding: '8px 12px',
              background: theme.bg,
              color: theme.textPrimary,
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box',
            }}
          >
            Navigasi ke ODP ({targetLat.toFixed(4)}, {targetLng.toFixed(4)})
          </a>

          {state.dispatchLocation.customerPhone && (
            <a
              href={`tel:${state.dispatchLocation.customerPhone}`}
              style={{
                minHeight: '44px',
                padding: '8px 12px',
                background: theme.bg,
                color: theme.textPrimary,
                border: `1px solid ${theme.border}`,
                borderRadius: '6px',
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
            onClick={() => void actions.startExecution()}
            style={{
              width: '100%',
              minHeight: '44px',
              marginTop: '10px',
              padding: '8px 12px',
              background: theme.badgeBg,
              color: theme.textPrimary,
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
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
            borderRadius: '8px',
            padding: '14px',
            marginBottom: '14px',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: theme.textPrimary, marginBottom: '6px' }}>
            Data Eksisting Pelanggan (Maintenance)
          </div>
          <div style={{ fontSize: '12px', color: theme.textSecondary }}>
            ODP Terdaftar: <strong>{state.maintenanceReadOnly.currentOdpSplitter}</strong> | Port:{' '}
            <strong>{state.maintenanceReadOnly.currentPortNumber}</strong>
          </div>
          {state.maintenanceReadOnly.last5AttenuationHistory.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              <div style={{ fontSize: '11px', color: theme.textSecondary, marginBottom: '4px' }}>
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
                      borderRadius: '4px',
                      fontFamily: theme.typography.fontFamily.mono,
                      fontSize: '11px',
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
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '14px',
        }}
      >
        <div style={{ fontSize: '13px', fontWeight: 700, color: theme.textPrimary, marginBottom: '6px' }}>
          1. Verifikasi Lokasi GPS & Geofence (Maks {state.maxGeofenceMeters}m)
        </div>
        <div style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '10px' }}>
          Status GPS:{' '}
          <strong
            style={{
              color:
                state.gpsState === 'VERIFIED_IN_RANGE'
                  ? '#16A34A'
                  : state.gpsState === 'MOCK_DETECTED'
                    ? '#DC2626'
                    : state.gpsState === 'FLAGGED_OUT_OF_RANGE'
                      ? '#D97706'
                      : theme.textPrimary,
            }}
          >
            {state.gpsState}
          </strong>
          {state.locationResult?.distanceToSplitterMeters !== undefined && (
            <span> | Jarak ke ODP: {state.locationResult.distanceToSplitterMeters} meter</span>
          )}
        </div>

        <button
          type="button"
          onClick={() => void actions.verifyLocation()}
          disabled={state.gpsState === 'ACQUIRING'}
          style={{
            width: '100%',
            minHeight: '44px',
            padding: '10px 14px',
            background: theme.badgeBg,
            color: theme.textPrimary,
            border: `1px solid ${theme.border}`,
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: state.gpsState === 'ACQUIRING' ? 'not-allowed' : 'pointer',
          }}
        >
          {state.gpsState === 'ACQUIRING' ? 'Membaca Satelit GPS...' : 'Ambil & Verifikasi Koordinat GPS'}
        </button>
      </div>

      {/* Step 2: 90 Palembang ODP Selector & Port Matrix */}
      <div
        style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: '8px',
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
          style={{
            width: '100%',
            minHeight: '44px',
            padding: '10px 12px',
            background: theme.bg,
            color: theme.textPrimary,
            border: `1px solid ${theme.border}`,
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
            marginBottom: '8px',
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
              padding: '8px 10px',
              background: theme.bg,
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
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
              Kapasitas: <strong style={{ color: theme.textPrimary }}>{state.selectedSplitter.availablePorts.length} kosong / {state.selectedSplitter.maxPorts} port</strong>
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
          <span style={{ fontSize: '11px', color: theme.textSecondary }}>
            [Biru] Dipilih | [Kosong] Tersedia | [(Isi)] Terpakai
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
                      ? '#FEE2E2'
                      : theme.bg,
                  color: isSelected
                    ? theme.primaryText
                    : isOccupiedByOther
                      ? '#991B1B'
                      : theme.textPrimary,
                  border: `1px solid ${isSelected ? theme.primary : theme.border}`,
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: isOccupiedByOther ? 'not-allowed' : 'pointer',
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
          borderRadius: '8px',
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
          <span
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 700,
              background: state.outdoorTokens.badgeBg,
              color: state.outdoorTokens.badgeText,
              border: `1px solid ${state.outdoorTokens.outdoorBorder}`,
            }}
          >
            Status Sinyal: {state.dbmStatus}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <button
            type="button"
            onClick={() => {
              const trimmed = state.attenuationInput.trim();
              if (!trimmed.startsWith('-')) {
                actions.setAttenuationInput(`-${trimmed.replace(/^\+/, '')}`);
              }
            }}
            style={{
              minHeight: '44px',
              padding: '0 14px',
              background: theme.badgeBg,
              color: theme.textPrimary,
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
              fontFamily: theme.typography.fontFamily.mono,
              fontSize: '14px',
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
              borderRadius: '6px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
          {['-16.5', '-18.5', '-21.0', '-24.5'].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => actions.setAttenuationInput(preset)}
              style={{
                minHeight: '44px',
                padding: '6px',
                background: theme.bg,
                color: theme.textPrimary,
                border: `1px solid ${theme.border}`,
                borderRadius: '6px',
                fontFamily: theme.typography.fontFamily.mono,
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Step 4: In-App Watermarked Camera Capture */}
      <div
        style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: '8px',
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
              background: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: '6px',
              color: '#166534',
              fontSize: '12px',
              marginBottom: '10px',
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
          onClick={actions.openCamera}
          style={{
            width: '100%',
            minHeight: '44px',
            padding: '10px 14px',
            background: theme.badgeBg,
            color: theme.textPrimary,
            border: `1px solid ${theme.border}`,
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
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
          borderRadius: '8px',
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
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: '12px',
            background: theme.bg,
            color: theme.textPrimary,
            border: `1px solid ${theme.border}`,
            borderRadius: '6px',
            boxSizing: 'border-box',
            marginBottom: '12px',
            fontFamily: theme.typography.fontFamily.sans,
          }}
        />

        <button
          type="button"
          disabled={state.isSubmitting || state.isMockBlocked}
          onClick={() => void actions.submit()}
          style={{
            width: '100%',
            minHeight: '44px',
            padding: '12px 16px',
            background: state.isMockBlocked ? '#DC2626' : theme.primary,
            color: state.isMockBlocked ? '#FFFFFF' : theme.primaryText,
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 700,
            cursor: state.isSubmitting || state.isMockBlocked ? 'not-allowed' : 'pointer',
            opacity: state.isSubmitting ? 0.75 : 1,
          }}
        >
          {state.isMockBlocked
            ? 'Diblokir: Fake GPS Terdeteksi'
            : state.isSubmitting
              ? 'Mengirim & Mengenkripsi Laporan...'
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
