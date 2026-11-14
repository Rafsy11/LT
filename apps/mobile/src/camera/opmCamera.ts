import type { ApiClient } from '../api/client';

export interface WatermarkData {
  ticketNumber: string;
  odpId: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  attenuationDbm: number;
}

export interface ExtendedWatermarkInput {
  ticketNumber: string;
  odpId: string;
  portNumber?: number;
  timestamp: string;
  technicianName?: string;
  latitude?: number | null;
  longitude?: number | null;
  attenuationDbm: number;
}

export type AttenuationCategory = 'GOOD' | 'WARNING' | 'CRITICAL' | 'INVALID';

export function categorizeAttenuation(dbm: number): {
  category: AttenuationCategory;
  label: string;
  colorHex: string;
} {
  if (typeof dbm !== 'number' || isNaN(dbm) || !isFinite(dbm)) {
    return { category: 'INVALID', label: 'Tidak Valid', colorHex: '#94A3B8' };
  }
  if (dbm > 0 || dbm < -50) {
    return { category: 'INVALID', label: 'Di Luar Rentang', colorHex: '#EF4444' };
  }
  if (dbm >= -22.0 && dbm <= -15.0) {
    return { category: 'GOOD', label: 'Baik', colorHex: '#10B981' };
  }
  if (dbm >= -25.0 && dbm < -22.0) {
    return { category: 'WARNING', label: 'Peringatan', colorHex: '#F59E0B' };
  }
  return { category: 'CRITICAL', label: 'Kritis', colorHex: '#EF4444' };
}

export function formatOpmWatermarkLines(data: WatermarkData): string[] {
  return [
    `TIKET: ${data.ticketNumber}`,
    `WAKTU: ${data.timestamp}`,
    `ODP: ${data.odpId}`,
    `KOORDINAT: ${data.latitude.toFixed(6)}, ${data.longitude.toFixed(6)}`,
    `REDAMAN: ${data.attenuationDbm.toFixed(2)} dBm`,
  ];
}

export function formatComprehensiveWatermark(input: ExtendedWatermarkInput): string[] {
  const lines: string[] = [];

  const ticketStr = (input.ticketNumber || 'TKT-UNKNOWN').trim();
  const truncatedTicket = ticketStr.length > 36 ? `${ticketStr.slice(0, 33)}...` : ticketStr;
  lines.push(`TIKET: ${truncatedTicket}`);

  lines.push(`WAKTU: ${input.timestamp || new Date().toISOString()}`);

  const odpStr = (input.odpId || 'ODP-PLB-001').trim();
  const portStr = input.portNumber ? ` (Port ${input.portNumber})` : '';
  lines.push(`ODP: ${odpStr}${portStr}`);

  if (
    typeof input.latitude === 'number' &&
    typeof input.longitude === 'number' &&
    !isNaN(input.latitude) &&
    !isNaN(input.longitude)
  ) {
    lines.push(`KOORDINAT: ${input.latitude.toFixed(6)}, ${input.longitude.toFixed(6)}`);
  } else {
    lines.push('KOORDINAT: Sinyal GPS tidak tersedia');
  }

  if (typeof input.attenuationDbm === 'number' && !isNaN(input.attenuationDbm) && isFinite(input.attenuationDbm)) {
    const cat = categorizeAttenuation(input.attenuationDbm);
    lines.push(`REDAMAN: ${input.attenuationDbm.toFixed(2)} dBm [${cat.label}]`);
  } else {
    lines.push('REDAMAN: N/A (Nilai Tidak Valid)');
  }

  if (input.technicianName) {
    const techStr = input.technicianName.trim();
    const truncatedTech = techStr.length > 30 ? `${techStr.slice(0, 27)}...` : techStr;
    lines.push(`TEKNISI: ${truncatedTech}`);
  }

  return lines;
}

export const MAX_PHOTO_BYTES = 300 * 1024; // 307,200 bytes

export function validatePhotoSize(
  bufferOrLength: Buffer | Uint8Array | number | { length?: number; byteLength?: number },
): { valid: boolean; error?: string } {
  let length: number;
  if (typeof bufferOrLength === 'number') {
    length = bufferOrLength;
  } else if ('length' in bufferOrLength && typeof bufferOrLength.length === 'number') {
    length = bufferOrLength.length;
  } else if ('byteLength' in bufferOrLength && typeof bufferOrLength.byteLength === 'number') {
    length = bufferOrLength.byteLength;
  } else {
    length = 0;
  }

  if (length > MAX_PHOTO_BYTES) {
    return {
      valid: false,
      error: `Ukuran foto ${Math.round(length / 1024)}KB melebihi batas maksimal 300KB.`,
    };
  }
  return { valid: true };
}

export function validateNonEmptyPhoto(buffer: Buffer | Uint8Array): boolean {
  return buffer.length > 0 && buffer[0] === 0xff && buffer[1] === 0xd8;
}

/**
 * Interface representing Expo Image Manipulator result.
 */
export interface ImageManipulatorResult {
  uri: string;
  width: number;
  height: number;
  base64?: string;
  watermarkText?: string;
}

export interface CompressPhotoOptions {
  maxWidth?: number;
  quality?: number;
}

export interface OpmProofUploadResult {
  objectKey: string;
  localCompressedUri: string;
  uploadedSuccessfully: boolean;
}

/**
 * Compresses raw captured OPM proof photo on-device.
 * Enforces AGENT.md Section 4: max width 1280px, quality 0.7, target size < 300KB.
 */
export async function compressOpmPhoto(
  rawPhotoUri: string,
  options: CompressPhotoOptions = { maxWidth: 1280, quality: 0.7 },
  customManipulator?: (
    uri: string,
    actions: unknown[],
    saveOptions: unknown,
  ) => Promise<ImageManipulatorResult>,
): Promise<ImageManipulatorResult> {
  const maxWidth = options.maxWidth || 1280;
  const quality = options.quality ?? 0.7;

  if (customManipulator) {
    return await customManipulator(rawPhotoUri, [{ resize: { width: maxWidth } }], {
      compress: quality,
      format: 'jpeg',
    });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ImageManipulator = require('expo-image-manipulator');
    return await ImageManipulator.manipulateAsync(rawPhotoUri, [{ resize: { width: maxWidth } }], {
      compress: quality,
      format: ImageManipulator.SaveFormat.JPEG,
    });
  } catch {
    // Fallback if running outside native Expo container
    return {
      uri: rawPhotoUri,
      width: maxWidth,
      height: Math.round((maxWidth * 3) / 4),
    };
  }
}

/**
 * Uploads compressed image file directly to MinIO S3-compatible Object Storage via Presigned PUT URL.
 * Enforces Law 5: Upload directly to MinIO, never write files into Next.js local filesystem.
 */
export async function uploadToPresignedPutUrl(
  presignedPutUrl: string,
  localPhotoUri: string,
  contentType = 'image/jpeg',
): Promise<boolean> {
  try {
    // Read local file as blob
    const response = await fetch(localPhotoUri);
    const blob = await response.blob();

    const uploadRes = await fetch(presignedPutUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      body: blob,
    });

    return uploadRes.ok;
  } catch (err) {
    console.warn(
      '[MinIO Upload] Upload directly to object storage failed:',
      (err as Error).message,
    );
    throw new Error(
      `Gagal mengunggah foto bukti OPM ke server penyimpanan MinIO: ${(err as Error).message}`,
    );
  }
}

export interface DualPathUploadResult {
  photoObjectKey: string;
  pathUsed: 'PRESIGNED_MINIO' | 'MULTIPART_PROXY';
}

export interface DualPathUploadOptions {
  apiClient: ApiClient;
  ticketId: string;
  submissionId: string;
  localPhotoUri: string;
  contentType?: string;
  onProgress?: (message: string) => void;
}

/**
 * Resilient dual-path photo upload:
 * Primary path: direct presigned PUT to MinIO (/api/v1/tech/upload-url).
 * Fallback path: multipart upload to Next.js proxy route (/api/v1/tech/tickets/:id/upload).
 */
export async function uploadOpmPhotoDualPath(
  options: DualPathUploadOptions,
): Promise<DualPathUploadResult> {
  const {
    apiClient,
    ticketId,
    submissionId,
    localPhotoUri,
    contentType = 'image/jpeg',
    onProgress,
  } = options;

  // Path 1: Presigned PUT directly to MinIO
  try {
    onProgress?.('Mencoba unggah langsung ke MinIO via Presigned URL...');
    const urlRes = await apiClient.request<{ uploadUrl: string; objectKey: string }>(
      '/api/v1/tech/upload-url',
      {
        method: 'POST',
        body: JSON.stringify({ ticketId, submissionId, contentType }),
      },
    );

    if (urlRes.success && urlRes.data?.uploadUrl && urlRes.data.objectKey) {
      const uploadOk = await uploadToPresignedPutUrl(
        urlRes.data.uploadUrl,
        localPhotoUri,
        contentType,
      );
      if (uploadOk) {
        return {
          photoObjectKey: urlRes.data.objectKey,
          pathUsed: 'PRESIGNED_MINIO',
        };
      }
    }
  } catch (err) {
    console.warn(
      '[DualPathUpload] Primary MinIO presigned upload failed, falling back to multipart proxy...',
      err,
    );
  }

  // Path 2: Fallback Multipart Upload to Next.js API route
  onProgress?.('Mengalihkan ke unggah multipart via server proxy...');
  const formData = new FormData();
  const filename = `opm_${ticketId}_${submissionId}.jpg`;

  try {
    const res = await fetch(localPhotoUri);
    const blob = await res.blob();
    formData.append('file', blob, filename);
  } catch {
    // React Native container fallback
    formData.append('file', {
      uri: localPhotoUri,
      type: contentType,
      name: filename,
    } as any);
  }

  const multipartRes = await apiClient.uploadMultipart<{ photoObjectKey: string }>(
    `/api/v1/tech/tickets/${ticketId}/upload`,
    formData,
  );

  if (multipartRes.success && multipartRes.data?.photoObjectKey) {
    return {
      photoObjectKey: multipartRes.data.photoObjectKey,
      pathUsed: 'MULTIPART_PROXY',
    };
  }

  const errorMsg = !multipartRes.success ? multipartRes.error?.message : undefined;
  throw new Error(
    errorMsg ||
      'Gagal mengunggah foto bukti OPM melalui kedua jalur (MinIO langsung dan server proxy).',
  );
}
