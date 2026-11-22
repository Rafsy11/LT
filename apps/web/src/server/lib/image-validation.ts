import { ERROR_CODES } from '@repo/shared';

export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export type DetectedImageFormat = {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  ext: 'jpg' | 'png' | 'webp';
};

export function detectImageFromMagicBytes(buf: Buffer): DetectedImageFormat | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mimeType: 'image/jpeg', ext: 'jpg' };
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return { mimeType: 'image/png', ext: 'png' };
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mimeType: 'image/webp', ext: 'webp' };
  }
  return null;
}

export function validateImageUploadBuffer(file: File, buffer: Buffer): DetectedImageFormat {
  if (file.size <= 0 || buffer.length <= 0) {
    throw Object.assign(
      new Error('Berkas foto kosong. Ambil ulang foto yang valid lalu unggah kembali.'),
      { statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR },
    );
  }

  if (file.size > MAX_IMAGE_UPLOAD_BYTES || buffer.length > MAX_IMAGE_UPLOAD_BYTES) {
    throw Object.assign(
      new Error('Ukuran foto melebihi batas maksimal 5 MB. Perkecil gambar lalu unggah kembali.'),
      { statusCode: 413, code: ERROR_CODES.PAYLOAD_TOO_LARGE },
    );
  }

  const declaredMime = (file.type || '').toLowerCase().trim();
  if (!ALLOWED_IMAGE_MIME_TYPES.has(declaredMime)) {
    throw Object.assign(
      new Error(
        'Format berkas foto belum didukung. Gunakan gambar berformat JPG, PNG, atau WEBP (maksimal 5 MB).',
      ),
      { statusCode: 415, code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE },
    );
  }

  const detected = detectImageFromMagicBytes(buffer);
  if (!detected) {
    throw Object.assign(
      new Error('Isi berkas bukan gambar JPG, PNG, atau WEBP yang valid.'),
      { statusCode: 415, code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE },
    );
  }

  const normalizedDeclared = declaredMime === 'image/jpg' ? 'image/jpeg' : declaredMime;
  if (normalizedDeclared !== detected.mimeType) {
    throw Object.assign(
      new Error('Tipe berkas tidak sesuai dengan format gambar sebenarnya.'),
      { statusCode: 415, code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE },
    );
  }

  return detected;
}
