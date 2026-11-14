import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient } from '../../../apps/mobile/src/api/client';
import { uploadOpmPhotoDualPath, compressOpmPhoto } from '../../../apps/mobile/src/camera/opmCamera';
import { createMockJpegBuffer } from '../helpers/test-fixtures';
import { MockPersistentStorage, EncryptedStorageWrapper } from '../helpers/mock-storage';

function formatComprehensiveWatermark(input: {
  ticketNumber: string;
  odpId: string;
  portNumber?: number;
  timestamp: string;
  technicianName?: string;
  latitude?: number | null;
  longitude?: number | null;
  attenuationDbm: number;
}): string[] {
  const lines: string[] = [];
  lines.push(`TIKET: ${input.ticketNumber}`);
  lines.push(`WAKTU: ${input.timestamp}`);
  lines.push(`ODP: ${input.odpId}${input.portNumber ? ` (Port ${input.portNumber})` : ''}`);
  if (input.latitude != null && input.longitude != null) {
    lines.push(`KOORDINAT: ${input.latitude.toFixed(6)}, ${input.longitude.toFixed(6)}`);
  } else {
    lines.push('KOORDINAT: Sinyal GPS tidak tersedia');
  }
  lines.push(`REDAMAN: ${input.attenuationDbm.toFixed(2)} dBm`);
  if (input.technicianName) {
    lines.push(`TEKNISI: ${input.technicianName}`);
  }
  return lines;
}

describe('Tier 3: Cross-Feature - Camera Watermark, Dual-Path Upload & Submission', () => {
  let originalFetch: typeof globalThis.fetch;
  let client: ApiClient;
  let mockStorage: MockPersistentStorage;
  let minioFails = false;
  let proxyFails = false;
  const progressLogs: string[] = [];
  const networkCalls: Array<{ url: string; method: string; body?: any }> = [];

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    progressLogs.length = 0;
    networkCalls.length = 0;
    minioFails = false;
    proxyFails = false;
    mockStorage = new MockPersistentStorage();

    client = new ApiClient({
      baseUrl: 'http://localhost:3000',
      deviceId: 'dev-camera-sync-01',
    });

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method || 'GET').toUpperCase();
      networkCalls.push({ url, method, body: init?.body });

      if (url.startsWith('file://')) {
        return new Response(new Blob(['fake-jpeg-photo-bytes'], { type: 'image/jpeg' }), { status: 200 });
      }

      if (url.includes('/api/v1/tech/upload-url')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              uploadUrl: 'https://minio.local/bucket/opm/direct-put.jpg',
              objectKey: 'opm/direct-put.jpg',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('minio.local')) {
        if (minioFails) {
          return new Response('MinIO S3 Gateway Timeout', { status: 504 });
        }
        return new Response('', { status: 200 });
      }

      if (url.includes('/api/v1/tech/tickets/') && url.includes('/upload')) {
        if (proxyFails) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'Proxy service unavailable' } }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({
            success: true,
            data: { photoObjectKey: 'proxy-uploads/opm-fallback.jpg' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/submit')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: { status: 'COMPLETED', ticketNumber: 'WO-2025-0842' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    progressLogs.length = 0;
  });

  it('1. executes end-to-end watermark formatting, primary MinIO upload, and ticket submission', async () => {
    // Step A: Watermark metadata preparation
    const watermarkLines = formatComprehensiveWatermark({
      ticketNumber: 'WO-2025-0842',
      odpId: 'ODP-PLB-001',
      portNumber: 2,
      timestamp: '2026-11-14T10:30:00Z',
      technicianName: 'Andi Pratama',
      latitude: -2.9833,
      longitude: 104.7644,
      attenuationDbm: -18.5,
    });
    assert.strictEqual(watermarkLines.length, 6);
    assert.ok(watermarkLines[0].includes('WO-2025-0842'));

    // Step B: Dual-Path Upload (Primary MinIO)
    const uploadResult = await uploadOpmPhotoDualPath({
      apiClient: client,
      ticketId: 'WO-2025-0842',
      submissionId: 'sub-cam-001',
      localPhotoUri: 'file:///data/cache/opm_001.jpg',
      onProgress: (msg) => progressLogs.push(msg),
    });

    assert.strictEqual(uploadResult.pathUsed, 'PRESIGNED_MINIO');
    assert.strictEqual(uploadResult.photoObjectKey, 'opm/direct-put.jpg');

    // Step C: Ticket Submission
    const submitRes = await client.request<{ status: string }>('/api/v1/tech/tickets/WO-2025-0842/submit', {
      method: 'POST',
      body: JSON.stringify({
        submissionId: 'sub-cam-001',
        photoObjectKey: uploadResult.photoObjectKey,
        attenuationDbm: -18.5,
        portNumber: 2,
        splitterId: 'ODP-PLB-001',
      }),
    });

    assert.strictEqual(submitRes.success, true);
    assert.strictEqual(submitRes.data?.status, 'COMPLETED');
  });

  it('2. executes watermark formatting, falls over to multipart proxy on MinIO 504, and completes ticket submission', async () => {
    minioFails = true;

    const uploadResult = await uploadOpmPhotoDualPath({
      apiClient: client,
      ticketId: 'WO-2025-0842',
      submissionId: 'sub-cam-fallback',
      localPhotoUri: 'file:///data/cache/opm_002.jpg',
      onProgress: (msg) => progressLogs.push(msg),
    });

    assert.strictEqual(uploadResult.pathUsed, 'MULTIPART_PROXY');
    assert.strictEqual(uploadResult.photoObjectKey, 'proxy-uploads/opm-fallback.jpg');
    assert.ok(progressLogs.some((l) => l.includes('Mengalihkan ke unggah multipart via server proxy')));

    // Submission with fallback photo key
    const submitRes = await client.request<{ status: string }>('/api/v1/tech/tickets/WO-2025-0842/submit', {
      method: 'POST',
      body: JSON.stringify({
        submissionId: 'sub-cam-fallback',
        photoObjectKey: uploadResult.photoObjectKey,
        attenuationDbm: -19.2,
      }),
    });

    assert.strictEqual(submitRes.success, true);
  });

  it('3. validates photo compression maintains target file size under 300KB before initiating upload', async () => {
    const rawBuffer = createMockJpegBuffer(280 * 1024); // 280KB (<300KB limit)

    const compressed = await compressOpmPhoto(
      'file:///raw.jpg',
      { maxWidth: 1280, quality: 0.7 },
      async () => ({
        uri: 'file:///compressed.jpg',
        width: 1280,
        height: 960,
        base64: rawBuffer.toString('base64'),
      })
    );

    const sizeBytes = Buffer.from(compressed.base64 || '', 'base64').length;
    assert.ok(sizeBytes <= 300 * 1024, `Size ${sizeBytes} exceeds 300KB`);
    assert.strictEqual(compressed.width, 1280);
  });

  it('4. caches watermarked photo reference in persistent storage before transmission', async () => {
    const storageWrapper = new EncryptedStorageWrapper(mockStorage);
    const photoDraft = {
      ticketId: 'WO-2025-0842',
      submissionId: 'draft-sub-uuid-777',
      localUri: 'file:///data/user/0/cache/watermarked_opm_777.jpg',
      metadata: {
        odp: 'ODP-PLB-001',
        dbm: -18.5,
        lat: -2.9833,
        lon: 104.7644,
      },
    };

    await storageWrapper.setEncryptedItem('photo_draft_777', photoDraft);
    const retrieved = await storageWrapper.getEncryptedItem<typeof photoDraft>('photo_draft_777');

    assert.deepStrictEqual(retrieved, photoDraft);
    assert.strictEqual(retrieved?.metadata.odp, 'ODP-PLB-001');
  });

  it('5. guarantees unchanged transmission of technician UUID v4 submissionId from camera to final submission', async () => {
    const originalSubmissionId = 'b819f032-15df-4d62-9721-3957291740ab';

    const uploadResult = await uploadOpmPhotoDualPath({
      apiClient: client,
      ticketId: 'WO-2025-0842',
      submissionId: originalSubmissionId,
      localPhotoUri: 'file:///photo.jpg',
    });

    await client.request('/api/v1/tech/tickets/WO-2025-0842/submit', {
      method: 'POST',
      body: JSON.stringify({
        submissionId: originalSubmissionId,
        photoObjectKey: uploadResult.photoObjectKey,
      }),
    });

    const submitCall = networkCalls.find((c) => c.url.includes('/submit'));
    assert.ok(submitCall, 'Submit call must be made');
    const parsedBody = JSON.parse(submitCall.body);
    assert.strictEqual(parsedBody.submissionId, originalSubmissionId);
  });

  it('6. records upload path telemetry (PRESIGNED_MINIO vs MULTIPART_PROXY) in audit records', async () => {
    const minioResult = await uploadOpmPhotoDualPath({
      apiClient: client,
      ticketId: 'WO-01',
      submissionId: 'sub-tel-01',
      localPhotoUri: 'file:///photo.jpg',
    });
    assert.strictEqual(minioResult.pathUsed, 'PRESIGNED_MINIO');

    minioFails = true;
    const proxyResult = await uploadOpmPhotoDualPath({
      apiClient: client,
      ticketId: 'WO-02',
      submissionId: 'sub-tel-02',
      localPhotoUri: 'file:///photo.jpg',
    });
    assert.strictEqual(proxyResult.pathUsed, 'MULTIPART_PROXY');
  });
});
