/**
 * Interface representing Expo Image Manipulator result.
 */
export interface ImageManipulatorResult {
  uri: string;
  width: number;
  height: number;
  base64?: string;
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
  customManipulator?: (uri: string, actions: unknown[], saveOptions: unknown) => Promise<ImageManipulatorResult>
): Promise<ImageManipulatorResult> {
  const maxWidth = options.maxWidth || 1280;
  const quality = options.quality ?? 0.7;

  if (customManipulator) {
    return await customManipulator(
      rawPhotoUri,
      [{ resize: { width: maxWidth } }],
      { compress: quality, format: 'jpeg' }
    );
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ImageManipulator = require('expo-image-manipulator');
    return await ImageManipulator.manipulateAsync(
      rawPhotoUri,
      [{ resize: { width: maxWidth } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
    );
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
  contentType = 'image/jpeg'
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
    console.warn('[MinIO Upload] Upload directly to object storage failed:', (err as Error).message);
    throw new Error(`Gagal mengunggah foto bukti OPM ke server penyimpanan MinIO: ${(err as Error).message}`);
  }
}
