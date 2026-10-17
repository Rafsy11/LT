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
  // 1. Form state
  const defaultSplitter =
    splitters.find((s) => s.splitterCode === ticket.customer.splitterCode) ||
    splitters[0];

  const [selectedSplitterId, setSelectedSplitterId] = useState<string>(
    defaultSplitter ? defaultSplitter.id : ''
  );
  const [selectedPort, setSelectedPort] = useState<number>(
    ticket.customer.portNumber || 1
  );
  const [attenuationInput, setAttenuationInput] = useState<string>(
    ticket.customer.currentAttenuation !== null && ticket.customer.currentAttenuation !== undefined
      ? String(ticket.customer.currentAttenuation)
      : '-18.5'
  );

  // 2. Hardware guards & evidence
  const [locationResult, setLocationResult] = useState<LocationGuardResult | null>(null);
  const [isVerifyingLocation, setIsVerifyingLocation] = useState(false);
  const [photoEvidence, setPhotoEvidence] = useState<ImageManipulatorResult | null>(null);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);

  // 3. Execution status & Debounce Guard (Requirement 2)
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLockRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedSplitter = splitters.find(
    (s) => s.id === selectedSplitterId || s.splitterCode === selectedSplitterId
  );

  /**
   * Verifies GPS coordinates, detects Fake GPS, and computes Haversine distance to ODP.
   */
  const handleVerifyLocation = useCallback(async () => {
    try {
      setIsVerifyingLocation(true);
      setErrorMessage(null);

      const targetCoords = selectedSplitter
        ? { latitude: selectedSplitter.lat, longitude: selectedSplitter.lng }
        : undefined;

      const result = await acquireVerifiedLocation(targetCoords);
      setLocationResult(result);
      return result;
    } catch (err) {
      // Sanitasi Pesan Error di UI (Anti-Information Leakage - Requirement 1)
      const sanitized = sanitizeUiErrorMessage(err);
      setErrorMessage(sanitized.message);
      throw err;
    } finally {
      setIsVerifyingLocation(false);
    }
  }, [selectedSplitter]);

  /**
   * Handles photo captured and compressed by OpmCameraModal.
   */
  const handlePhotoCaptured = (result: ImageManipulatorResult) => {
    setPhotoEvidence(result);
    setIsCameraModalOpen(false);
  };

  /**
   * Submits ticket work order either directly online or queued into MMKV/SQLite offline queue.
   * State disabled & Debounce pada Tombol Kritis (Requirement 2):
   * Kunci tombol tepat pada milidetik klik pertama sebelum request jaringan selesai.
   */
  const handleSubmit = async () => {
    // 1. Debounce guard cepat: tolak jika tombol sedang aktif atau terkunci
    if (submitLockRef.current) return;
    submitLockRef.current = true;

    try {
      setIsSubmitting(true);
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

      // Check port availability
      if (selectedSplitter.occupiedPorts.includes(selectedPort)) {
        throw new Error(
          `Port ${selectedPort} pada ${selectedSplitter.splitterCode} sudah digunakan oleh pelanggan lain.`
        );
      }

      // Verify location if not yet verified
      let activeLocation = locationResult;
      if (!activeLocation) {
        activeLocation = await handleVerifyLocation();
      }

      // Immutable submissionId generated on client (Law 3: Idempotency Key)
      const submissionId = generateUuidV4();
      const recordedAt = activeLocation.clientRecordedAt || new Date().toISOString();

      const payload: SubmitTicketInput = {
        submissionId,
        splitterId: selectedSplitter.splitterCode || selectedSplitter.id,
        portNumber: selectedPort,
        attenuationDbm: parsedDbm,
        photoObjectKey: '', // Will be set after MinIO upload or synced by queue
        submittedLat: activeLocation.latitude,
        submittedLng: activeLocation.longitude,
        isMockLocation: activeLocation.isMockLocation,
        clientRecordedAt: recordedAt,
      };

      // Attempt immediate online transmission
      try {
        // Step A: Request Presigned PUT URL
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
          throw new Error(urlRes.error.message || 'Gagal meminta upload URL');
        }

        if (!urlRes.data?.uploadUrl) {
          throw new Error('Presigned upload URL tidak ditemukan dalam respon server');
        }

        // Step B: Direct Binary PUT Upload to MinIO
        await uploadToPresignedPutUrl(urlRes.data.uploadUrl, photoEvidence.uri);
        payload.photoObjectKey = urlRes.data.objectKey;

        // Step C: Submit Ticket to Next.js API
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
          throw new Error(submitRes.error.message || 'Pengiriman laporan gagal');
        }

        onSubmitSuccess({
          isOffline: false,
          submissionId,
          message: 'Laporan pekerjaan berhasil dikirim ke server pusat.',
        });
      } catch (networkOrApiErr) {
        // Step D: Network failure fallback -> Enqueue into Offline Queue (Law 3)
        console.warn(
          '[TicketSubmit] Jaringan offline/gagal, menyimpan ke offline queue:',
          (networkOrApiErr as Error).message
        );

        await offlineQueue.enqueue({
          submissionId,
          ticketId: ticket.id,
          localPhotoUri: photoEvidence.uri,
          payload,
        });

        onSubmitSuccess({
          isOffline: true,
          submissionId,
          message:
            'Koneksi offline: Laporan berhasil disimpan dalam antrean offline HP teknisi dan akan disinkronkan otomatis saat ada sinyal.',
        });
      }
    } catch (err) {
      // Sanitasi Pesan Error di UI (Anti-Information Leakage - Requirement 1)
      const sanitized = sanitizeUiErrorMessage(err);
      setErrorMessage(sanitized.message);
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  // 4. Visibilitas Lapangan (Outdoor UX - Requirement 4)
  const dbmStatus = classifyDbm(attenuationInput);
  const outdoorTokens =
    OUTDOOR_CONTRAST_TOKENS[dbmStatus.toUpperCase() as keyof typeof OUTDOOR_CONTRAST_TOKENS] ||
    OUTDOOR_CONTRAST_TOKENS.NORMAL;
  const isMockBlocked = Boolean(locationResult?.isMockLocation);
  const isGeofenceWarning = Boolean(
    locationResult?.distanceToSplitterMeters !== undefined &&
      locationResult.distanceToSplitterMeters > MAX_GEOFENCE_RADIUS_METERS
  );

  return {
    state: {
      ticket,
      splitters,
      selectedSplitterId,
      selectedSplitter,
      selectedPort,
      attenuationInput,
      photoEvidence,
      locationResult,
      isVerifyingLocation,
      isCameraModalOpen,
      isSubmitting,
      errorMessage,
      maxGeofenceMeters: MAX_GEOFENCE_RADIUS_METERS,
      // Outdoor UX Contrast & Integrity indicators
      dbmStatus,
      outdoorTokens,
      isMockBlocked,
      isGeofenceWarning,
    },
    actions: {
      setSelectedSplitterId,
      setSelectedPort,
      setAttenuationInput,
      openCamera: () => setIsCameraModalOpen(true),
      closeCamera: () => setIsCameraModalOpen(false),
      handlePhotoCaptured,
      verifyLocation: handleVerifyLocation,
      submit: handleSubmit,
      cancel: onCancel,
    },
  };
}
