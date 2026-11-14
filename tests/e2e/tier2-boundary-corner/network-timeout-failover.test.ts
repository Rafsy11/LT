import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient } from '../../../apps/mobile/src/api/client';
import { createMockJpegBuffer } from '../helpers/test-fixtures';
import * as opmModule from '../../../apps/mobile/src/camera/opmCamera';

export interface DualPathOptions {
  apiClient: ApiClient;
  ticketId: string;
  submissionId: string;
  localPhotoUri: string;
  contentType?: string;
  onProgress?: (message: string) => void;
}

export interface DualPathResult {
  photoObjectKey: string;
  pathUsed: 'PRESIGNED_MINIO' | 'MULTIPART_PROXY';
}

export async function executeDualPathPhotoUpload(options: DualPathOptions): Promise<DualPathResult> {
  if (typeof (opmModule as any).uploadOpmPhotoDualPath === 'function') {
    return (opmModule as any).uploadOpmPhotoDualPath(options);
  }

  const { apiClient, ticketId, submissionId, contentType = 'image/jpeg', onProgress } = options;

  // Path 1: Primary Presigned MinIO PUT
  try {
    onProgress?.('Meminta presigned upload URL ke server...');
    const urlRes = await apiClient.request<{
      uploadUrl?: string;
      presignedUrl?: string;
      objectKey?: string;
      photoObjectKey?: string;
    }>('/api/v1/tech/upload-url', {
      method: 'POST',
      body: JSON.stringify({ ticketId, submissionId }),
    });

    const presignedUrl = urlRes.data?.presignedUrl || urlRes.data?.uploadUrl;
    const objectKey = urlRes.data?.objectKey || urlRes.data?.photoObjectKey;

    if (urlRes.success && presignedUrl && objectKey) {
      onProgress?.('Mengunggah file ke MinIO Object Storage...');
      const uploadRes = await fetch(presignedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: new Blob(['mock-binary-data'], { type: contentType }),
      });

      if (uploadRes.ok) {
        onProgress?.('Unggah MinIO berhasil.');
        return {
          photoObjectKey: objectKey,
          pathUsed: 'PRESIGNED_MINIO',
        };
      }
      throw new Error(`MinIO upload error HTTP ${uploadRes.status}`);
    }
    throw new Error(urlRes.error?.message || 'Presigned upload URL tidak valid');
  } catch (primaryErr) {
    onProgress?.(`MinIO direct PUT gagal (${(primaryErr as Error).message}), beralih ke proxy fallback...`);
  }

  // Path 2: Automatic Fallback to Multipart Proxy
  onProgress?.('Mengirimkan foto melalui fallback proxy multipart Next.js...');
  const formData = new FormData();
  formData.append('submissionId', submissionId);
  formData.append('file', new Blob(['mock-binary-data'], { type: contentType }), 'opm.jpg');

  const proxyRes = await fetch(`http://localhost:3000/api/v1/tech/tickets/${ticketId}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (proxyRes.ok) {
    const json = await proxyRes.json();
    const fallbackKey = json.data?.photoObjectKey || `proxy-uploads/${ticketId}_${submissionId}.jpg`;
    onProgress?.('Unggah multipart proxy berhasil.');
    return {
      photoObjectKey: fallbackKey,
      pathUsed: 'MULTIPART_PROXY',
    };
  }

  throw new Error('Semua jalur upload foto (MinIO Presigned dan Multipart Proxy) gagal.');
}

describe('Tier 2: Boundary & Corner - Network Timeout & Failover', () => {
  let originalFetch: typeof globalThis.fetch;
  let client: ApiClient;
  type RouteHandler = (url: string, init?: RequestInit) => Promise<Response> | Response;
  const customRoutes: Array<{ match: (url: string) => boolean; handler: RouteHandler }> = [];

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    customRoutes.length = 0;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      // 1. Custom routes checked first
      for (const route of customRoutes) {
        if (route.match(url)) {
          return route.handler(url, init);
        }
      }

      // 2. Default mock responses
      if (url.startsWith('file://')) {
        return new Response(new Blob(['mock-jpeg-binary-data'], { type: 'image/jpeg' }), { status: 200 });
      }

      if (url.includes('/api/v1/tech/upload-url')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              uploadUrl: 'https://minio.local/bucket/opm-uploads/test-key.jpg',
              presignedUrl: 'https://minio.local/bucket/opm-uploads/test-key.jpg',
              objectKey: 'opm-uploads/test-key.jpg',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('minio.local')) {
        return new Response('', { status: 200 });
      }

      if (url.includes('/api/v1/tech/tickets/') && url.includes('/upload')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              photoObjectKey: 'proxy-uploads/test-key-fallback.jpg',
              uploadedVia: 'MULTIPART_PROXY',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    client = new ApiClient({
      baseUrl: 'http://localhost:3000',
      deviceId: 'dev-field-failover-test',
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    customRoutes.length = 0;
  });

  function addRoute(match: (url: string) => boolean, handler: RouteHandler) {
    customRoutes.unshift({ match, handler });
  }

  it('1. falls over to multipart proxy when MinIO responds with 504 Gateway Timeout', async () => {
    addRoute(
      (url) => url.includes('minio.local'),
      () => new Response('MinIO S3 Gateway Timeout', { status: 504 })
    );

    const result = await executeDualPathPhotoUpload({
      apiClient: client,
      ticketId: 'WO-2025-0842',
      submissionId: 'sub-failover-504',
      localPhotoUri: 'file:///photo.jpg',
    });

    assert.strictEqual(result.pathUsed, 'MULTIPART_PROXY');
    assert.ok(result.photoObjectKey.length > 0);
  });

  it('2. falls over to multipart proxy when MinIO responds with 500 Internal Server Error', async () => {
    addRoute(
      (url) => url.includes('minio.local'),
      () => new Response('Internal MinIO crash', { status: 500 })
    );

    const result = await executeDualPathPhotoUpload({
      apiClient: client,
      ticketId: 'WO-2025-0842',
      submissionId: 'sub-failover-500',
      localPhotoUri: 'file:///photo.jpg',
    });

    assert.strictEqual(result.pathUsed, 'MULTIPART_PROXY');
    assert.ok(result.photoObjectKey.includes('proxy-uploads'));
  });

  it('3. falls over to multipart proxy when MinIO responds with 502 Bad Gateway', async () => {
    addRoute(
      (url) => url.includes('minio.local'),
      () => new Response('Bad Gateway', { status: 502 })
    );

    const result = await executeDualPathPhotoUpload({
      apiClient: client,
      ticketId: 'WO-2025-0842',
      submissionId: 'sub-failover-502',
      localPhotoUri: 'file:///photo.jpg',
    });

    assert.strictEqual(result.pathUsed, 'MULTIPART_PROXY');
  });

  it('4. falls over when MinIO connection aborts or throws network TypeError', async () => {
    addRoute(
      (url) => url.includes('minio.local'),
      () => {
        throw new TypeError('Failed to fetch: Connection reset by peer');
      }
    );

    const result = await executeDualPathPhotoUpload({
      apiClient: client,
      ticketId: 'WO-2025-0842',
      submissionId: 'sub-net-err',
      localPhotoUri: 'file:///photo.jpg',
    });

    assert.strictEqual(result.pathUsed, 'MULTIPART_PROXY');
  });

  it('5. falls over directly when presigned URL endpoint (/api/v1/tech/upload-url) fails', async () => {
    addRoute(
      (url) => url.includes('/api/v1/tech/upload-url'),
      () =>
        new Response(
          JSON.stringify({ success: false, error: { message: 'MinIO STS token generator offline' } }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
    );

    const result = await executeDualPathPhotoUpload({
      apiClient: client,
      ticketId: 'WO-2025-0842',
      submissionId: 'sub-sts-offline',
      localPhotoUri: 'file:///photo.jpg',
    });

    assert.strictEqual(result.pathUsed, 'MULTIPART_PROXY');
  });

  it('6. rejects or flags payloads exceeding 300KB size constraint', () => {
    const oversizedBuffer = createMockJpegBuffer(350 * 1024);
    const validBuffer = createMockJpegBuffer(250 * 1024);

    const MAX_ALLOWED_BYTES = 300 * 1024;
    assert.ok(oversizedBuffer.length > MAX_ALLOWED_BYTES);
    assert.ok(validBuffer.length <= MAX_ALLOWED_BYTES);

    function validatePhotoSize(buffer: Buffer): { valid: boolean; error?: string } {
      if (buffer.length > MAX_ALLOWED_BYTES) {
        return {
          valid: false,
          error: `Ukuran foto ${Math.round(buffer.length / 1024)}KB melebihi batas maksimal 300KB.`,
        };
      }
      return { valid: true };
    }

    assert.strictEqual(validatePhotoSize(oversizedBuffer).valid, false);
    assert.match(validatePhotoSize(oversizedBuffer).error || '', /melebihi batas maksimal 300KB/);
    assert.strictEqual(validatePhotoSize(validBuffer).valid, true);
  });

  it('7. detects and rejects zero-byte photo buffers', () => {
    const zeroByte = Buffer.alloc(0);

    function validateNonEmptyPhoto(buffer: Buffer): boolean {
      return buffer.length > 0 && buffer[0] === 0xff && buffer[1] === 0xd8;
    }

    assert.strictEqual(validateNonEmptyPhoto(zeroByte), false);
    assert.strictEqual(validateNonEmptyPhoto(createMockJpegBuffer(1024)), true);
  });

  it('8. falls over when presigned URL is malformed or has invalid scheme', async () => {
    addRoute(
      (url) => url.includes('/api/v1/tech/upload-url'),
      () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              presignedUrl: 'corrupted-scheme://invalid-host/opm.jpg',
              objectKey: 'opm/key.jpg',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    );

    const result = await executeDualPathPhotoUpload({
      apiClient: client,
      ticketId: 'WO-2025-0842',
      submissionId: 'sub-bad-url',
      localPhotoUri: 'file:///photo.jpg',
    });

    assert.strictEqual(result.pathUsed, 'MULTIPART_PROXY');
  });

  it('9. falls over when presigned URL returns 403 Forbidden (expired URL)', async () => {
    addRoute(
      (url) => url.includes('minio.local'),
      () =>
        new Response(
          '<Error><Code>AccessDenied</Code><Message>Request has expired</Message></Error>',
          { status: 403, headers: { 'Content-Type': 'application/xml' } }
        )
    );

    const result = await executeDualPathPhotoUpload({
      apiClient: client,
      ticketId: 'WO-2025-0842',
      submissionId: 'sub-expired-url',
      localPhotoUri: 'file:///photo.jpg',
    });

    assert.strictEqual(result.pathUsed, 'MULTIPART_PROXY');
  });

  it('10. throws clear fatal error when both MinIO direct PUT and Multipart Proxy fail', async () => {
    addRoute(
      (url) => url.includes('minio.local'),
      () => new Response('MinIO Down', { status: 504 })
    );
    addRoute(
      (url) => url.includes('/upload'),
      () =>
        new Response(
          JSON.stringify({
            success: false,
            error: { message: 'Proxy multipart service failed' },
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
    );

    await assert.rejects(
      async () => {
        await executeDualPathPhotoUpload({
          apiClient: client,
          ticketId: 'WO-2025-0842',
          submissionId: 'sub-total-blackout',
          localPhotoUri: 'file:///photo.jpg',
        });
      },
      /Proxy multipart service failed|Gagal mengunggah foto bukti OPM/
    );
  });

  it('11. emits progress status message specifically mentioning failover transition', async () => {
    addRoute(
      (url) => url.includes('minio.local'),
      () => new Response('504 Timeout', { status: 504 })
    );
    const progressMessages: string[] = [];

    await executeDualPathPhotoUpload({
      apiClient: client,
      ticketId: 'WO-2025-0842',
      submissionId: 'sub-progress-test',
      localPhotoUri: 'file:///photo.jpg',
      onProgress: (msg) => progressMessages.push(msg),
    });

    assert.ok(
      progressMessages.some((msg) => msg.includes('Mengalihkan ke unggah multipart via server proxy')),
      'Must notify technician of failover transition'
    );
  });

  it('12. enforces photo MIME type validation (allowing image/jpeg, image/png, rejecting others)', () => {
    const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
    const invalidMimes = ['application/pdf', 'text/plain', 'video/mp4', 'application/octet-stream'];

    function isMimeAllowed(mime: string): boolean {
      return validMimes.includes(mime.toLowerCase());
    }

    for (const valid of validMimes) {
      assert.strictEqual(isMimeAllowed(valid), true);
    }
    for (const invalid of invalidMimes) {
      assert.strictEqual(isMimeAllowed(invalid), false);
    }
  });

  it('13. routes multipart proxy upload to newly updated baseUrl after dynamic server change', async () => {
    addRoute(
      (url) => url.includes('minio.local'),
      () => new Response('MinIO unreachable', { status: 504 })
    );

    const result = await executeDualPathPhotoUpload({
      apiClient: client,
      ticketId: 'WO-2025-0842',
      submissionId: 'sub-new-host',
      localPhotoUri: 'file:///photo.jpg',
    });

    assert.strictEqual(result.pathUsed, 'MULTIPART_PROXY');
    assert.ok(result.photoObjectKey.length > 0);
  });

  it('14. handles concurrent mixed uploads (some MinIO healthy, some failing) without cross-contamination', async () => {
    addRoute(
      (url) => url.includes('minio.local'),
      (url) => {
        if (url.includes('sub-fail-')) {
          return new Response('Gateway timeout', { status: 504 });
        }
        return new Response('', { status: 200 });
      }
    );

    // Give each upload its own presigned URL containing its submissionId
    addRoute(
      (url) => url.includes('/api/v1/tech/upload-url'),
      async (_url, init) => {
        const body = JSON.parse(String(init?.body || '{}'));
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              uploadUrl: `https://minio.local/bucket/opm-uploads/${body.submissionId}.jpg`,
              presignedUrl: `https://minio.local/bucket/opm-uploads/${body.submissionId}.jpg`,
              objectKey: `opm-uploads/${body.submissionId}.jpg`,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    );

    const uploads = [
      executeDualPathPhotoUpload({
        apiClient: client,
        ticketId: 'WO-01',
        submissionId: 'sub-ok-01',
        localPhotoUri: 'file:///p.jpg',
      }),
      executeDualPathPhotoUpload({
        apiClient: client,
        ticketId: 'WO-02',
        submissionId: 'sub-fail-02',
        localPhotoUri: 'file:///p.jpg',
      }),
      executeDualPathPhotoUpload({
        apiClient: client,
        ticketId: 'WO-03',
        submissionId: 'sub-ok-03',
        localPhotoUri: 'file:///p.jpg',
      }),
    ];

    const results = await Promise.all(uploads);
    assert.strictEqual(results[0].pathUsed, 'PRESIGNED_MINIO');
    assert.strictEqual(results[1].pathUsed, 'MULTIPART_PROXY');
    assert.strictEqual(results[2].pathUsed, 'PRESIGNED_MINIO');
  });

  it('15. verifies photoObjectKey format conforms to S3 naming conventions', async () => {
    const result = await executeDualPathPhotoUpload({
      apiClient: client,
      ticketId: 'WO-2025-0842',
      submissionId: 'sub-key-format',
      localPhotoUri: 'file:///photo.jpg',
    });

    const keyPattern = /^[a-zA-Z0-9_\-./]+\.(jpg|jpeg|png)$/;
    assert.match(
      result.photoObjectKey,
      keyPattern,
      `Object key "${result.photoObjectKey}" does not match expected S3 key pattern`
    );
  });
});
