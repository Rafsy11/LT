import { ERROR_CODES } from '@repo/shared';

export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION_PX = 8192;
export const MAX_IMAGE_TOTAL_PIXELS = 25_000_000;

const POLYGLOT_PAYLOAD_RE =
  /<\s*(?:script|html|!doctype\s+html|svg|iframe|object|embed)\b|<\?php|javascript\s*:/i;

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

export function extractImageDimensions(
  buf: Buffer,
  mimeType: DetectedImageFormat['mimeType'],
): { width: number; height: number } | null {
  if (mimeType === 'image/png') {
    if (buf.length >= 24 && buf.subarray(12, 16).toString('ascii') === 'IHDR') {
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      return { width, height };
    }
    return null;
  }

  if (mimeType === 'image/jpeg') {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buf[offset + 1] ?? 0;
      if (marker === 0xff) {
        offset++;
        continue;
      }
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const segLength = buf.readUInt16BE(offset + 2);
      if (segLength < 2 || offset + 2 + segLength > buf.length) {
        break;
      }
      if ((marker === 0xc0 || marker === 0xc2) && segLength >= 8) {
        const precision = buf[offset + 4];
        if (precision === 8 || precision === 12) {
          const height = buf.readUInt16BE(offset + 5);
          const width = buf.readUInt16BE(offset + 7);
          return { width, height };
        }
      }
      offset += 2 + segLength;
    }
    return null;
  }

  if (mimeType === 'image/webp') {
    if (buf.length >= 30 && buf.subarray(12, 16).toString('ascii') === 'VP8X') {
      const width = 1 + buf.readUIntLE(24, 3);
      const height = 1 + buf.readUIntLE(27, 3);
      return { width, height };
    }
    return null;
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

  const sampleWindow = buffer.toString('latin1', 0, Math.min(buffer.length, 65536));
  if (POLYGLOT_PAYLOAD_RE.test(sampleWindow)) {
    throw Object.assign(
      new Error('Berkas gambar ditolak karena mengandung muatan skrip atau markup berbahaya.'),
      { statusCode: 415, code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE },
    );
  }

  const dimensions = extractImageDimensions(buffer, detected.mimeType);
  if (dimensions) {
    if (
      dimensions.width <= 0 ||
      dimensions.height <= 0 ||
      dimensions.width > MAX_IMAGE_DIMENSION_PX ||
      dimensions.height > MAX_IMAGE_DIMENSION_PX ||
      dimensions.width * dimensions.height > MAX_IMAGE_TOTAL_PIXELS
    ) {
      throw Object.assign(
        new Error(
          `Resolusi piksel gambar (${dimensions.width}x${dimensions.height}) melebihi batas keamanan maksimal (${MAX_IMAGE_DIMENSION_PX}x${MAX_IMAGE_DIMENSION_PX} piksel).`,
        ),
        { statusCode: 413, code: ERROR_CODES.PAYLOAD_TOO_LARGE },
      );
    }
  }

  return detected;
}
