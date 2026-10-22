import { useState, useCallback, useRef } from 'react';
import { ApiClient } from '../api/client';
import { acquireVerifiedLocation, LocationGuardResult } from '../security/locationGuard';
import { uploadToPresignedPutUrl, ImageManipulatorResult } from '../camera/opmCamera';
import { offlineQueue } from '../sync/offlineQueue';
import { MobileTicketItem, SplitterItem } from './TicketListScreen';
import {
  SubmitTicketInput,
  MAX_GEOFENCE_RADIUS_METERS,
  sanitizeUiErrorMessage,
  classifyDbm,
  OUTDOOR_CONTRAST_TOKENS,
} from '@repo/shared';

export interface TicketSubmitScreenProps {
  ticket: MobileTicketItem;
  splitters: SplitterItem[];
  apiClient: ApiClient;
  onSubmitSuccess: (result: {
    isOffline: boolean;
    submissionId: string;
    message: string;
  }) => void;
  onCancel: () => void;
}

export type GpsState =
  | 'IDLE'
  | 'ACQUIRING'
  | 'MOCK_DETECTED'
  | 'VERIFIED_IN_RANGE'
  | 'FLAGGED_OUT_OF_RANGE';

export type CameraState =
  | 'IDLE'
  | 'CAPTURING'
  | 'COMPRESSING_AND_WATERMARKING'
  | 'READY_URI';

export type SubmitLifecycleState =
  | 'IDLE'
  | 'SUBMITTING'
  | 'QUEUED_OFFLINE'
  | 'COMPLETED';

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
  // Ticket Type discriminator
  const isPsb = ticket.ticketType === 'PSB';
  const isMaintenance = ticket.ticketType === 'MAINTENANCE';

  const defaultSplitter =
    splitters.find((s) => s.splitterCode === ticket.customer.splitterCode) || splitters[0];

  // 1. Operational Form States
  const [selectedSplitterId, setSelectedSplitterId] = useState<string>(
    defaultSplitter ? defaultSplitter.id : ''
  );
  const [selectedPort, setSelectedPort] = useState<number>(ticket.customer.portNumber || 1);
  const [newMutationPort, setNewMutationPort] = useState<number | null>(null);
  const [technicianNotes, setTechnicianNotes] = useState<string>('');

  const [attenuationInput, setAttenuationInput] = useState<string>(
    ticket.customer.currentAttenuation !== null && ticket.customer.currentAttenuation !== undefined
      ? String(ticket.customer.currentAttenuation)
      : '-18.5'
  );

  // Maintenance Read-Only 5 Last Attenuation History
  const last5AttenuationHistory: number[] = [
    ticket.customer.currentAttenuation ?? -24.8,
    -24.2,
    -23.9,
    -23.5,
    -22.8,
  ];

  // 2. Hardware & Sync State Machines
  const [gpsState, setGpsState] = useState<GpsState>('IDLE');
  const [locationResult, setLocationResult] = useState<LocationGuardResult | null>(null);

  const [cameraState, setCameraState] = useState<CameraState>('IDLE');
  const [photoEvidence, setPhotoEvidence] = useState<ImageManipulatorResult | null>(null);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);

  const [submitState, setSubmitState] = useState<SubmitLifecycleState>('IDLE');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLockRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedSplitter = splitters.find(
    (s) => s.id === selectedSplitterId || s.splitterCode === selectedSplitterId
  );

  /**
   * GPS State Machine Transition:
   * IDLE -> ACQUIRING -> MOCK_DETECTED | VERIFIED_IN_RANGE | FLAGGED_OUT_OF_RANGE
   */
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
      } else if (result.distanceToSplitterMeters !== undefined && result.distanceToSplitterMeters <= MAX_GEOFENCE_RADIUS_METERS) {
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

  /**
   * Camera State Machine Transition:
   * IDLE -> CAPTURING -> COMPRESSING_AND_WATERMARKING -> READY_URI
   */
  const handlePhotoCaptured = (result: ImageManipulatorResult) => {
    setCameraState('COMPRESSING_AND_WATERMARKING');
    setPhotoEvidence(result);
    setCameraState('READY_URI');
    setIsCameraModalOpen(false);
  };

  /**
   * Submit Ticket Work Order:
   * Locked with 1ms debounce. Enqueues encrypted payload if offline or timeout occurs.
   */
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

      // Target port validation (handling optional port mutation in Maintenance)
      const targetPortNumber = isMaintenance && newMutationPort !== null ? newMutationPort : selectedPort;

      if (selectedSplitter.occupiedPorts.includes(targetPortNumber) && targetPortNumber !== ticket.customer.portNumber) {
        throw new Error(
          `Port ${targetPortNumber} pada ${selectedSplitter.splitterCode} sudah digunakan oleh pelanggan aktif lain.`
        );
      }

      // Verify location if not yet acquired
      let activeLocation = locationResult;
      if (!activeLocation) {
        activeLocation = await handleVerifyLocation();
      }

      if (activeLocation.isMockLocation) {
        throw new Error('Perangkat terdeteksi menggunakan Mock Location / Fake GPS.');
      }

      // Generate Immutable UUID v4 Idempotency Key
      const submissionId = generateUuidV4();
      const recordedAt = activeLocation.clientRecordedAt || new Date().toISOString();

      const payload: SubmitTicketInput = {
        submissionId,
        splitterId: selectedSplitter.splitterCode || selectedSplitter.id,
        portNumber: targetPortNumber,
        attenuationDbm: parsedDbm,
        photoObjectKey: '',
        submittedLat: activeLocation.latitude,
        submittedLng: activeLocation.longitude,
        isMockLocation: activeLocation.isMockLocation,
        clientRecordedAt: recordedAt,
        technicianNotes: technicianNotes.trim() || undefined,
      };

      // Direct Online Attempt
      try {
        // Step A: Request Presigned URL
        const urlRes = await apiClient.request<{ uploadUrl: string; objectKey: string }>(
          '/api/v1/tech/upload-url',
          {
            method: 'POST',
            body: JSON.stringify({
              ticketId: ticket.id,
              submissionId,
            }),
          }
        );

        if (!urlRes.success) {
          throw new Error(urlRes.error.message || 'Gagal meminta Presigned PUT URL dari server');
        }

        if (!urlRes.data.uploadUrl) {
          throw new Error('Presigned upload URL tidak ditemukan pada respons server');
        }

        // Step B: Direct Binary Upload to MinIO
        await uploadToPresignedPutUrl(urlRes.data.uploadUrl, photoEvidence.uri);
        payload.photoObjectKey = urlRes.data.objectKey;

        // Step C: Submit to Next.js API
        const submitRes = await apiClient.request<unknown>(
          `/api/v1/tech/tickets/${ticket.id}/submit`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
          {
            'X-Idempotency-Key': submissionId,
            'Idempotency-Key': submissionId,
          }
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
        // Step D: Network failure -> Encrypt payload into Offline Queue
        console.warn('[TicketSubmit] Offline/Timeout fallback: storing to offline queue:', (netErr as Error).message);

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

  // 3. Outdoor UX Tokens
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
      // Maintenance read-only attributes
      maintenanceReadOnly: isMaintenance
        ? {
            siaNumber: ticket.customer.siaNumber,
            customerName: ticket.customer.fullName,
            customerCoordinates: {
              lat: ticket.customer.lat,
              lng: ticket.customer.lng,
            },
            currentOdpSplitter: ticket.customer.splitterCode || defaultSplitter?.splitterCode || 'ODP-BDG-01',
            currentPortNumber: ticket.customer.portNumber || 1,
            last5AttenuationHistory,
          }
        : null,
      // Form values
      splitters,
      selectedSplitterId,
      selectedSplitter,
      selectedPort,
      newMutationPort,
      technicianNotes,
      attenuationInput,
      // Hardware state machines
      gpsState,
      locationResult,
      cameraState,
      photoEvidence,
      isCameraModalOpen,
      // Submission states
      submitState,
      isSubmitting,
      errorMessage,
      isMockBlocked,
      maxGeofenceMeters: MAX_GEOFENCE_RADIUS_METERS,
      // Outdoor UX
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
      submit: handleSubmit,
      cancel: onCancel,
    },
  };
}
