/**
 * Mock API Network & Fetch Helpers for E2E Tests
 * Supports testing dynamic server URL switching, health checks, and dual-path photo upload.
 */

export interface MockFetchRoute {
  match: (url: string, init?: RequestInit) => boolean;
  handler: (url: string, init?: RequestInit) => Promise<Response> | Response;
}

export class MockNetworkHarness {
  private routes: MockFetchRoute[] = [];
  private requestLog: Array<{ url: string; method: string; headers?: HeadersInit; body?: any }> = [];
  private originalFetch: typeof globalThis.fetch | null = null;
  public minioShouldFail = false;
  public healthCheckShouldFail = false;
  public proxyUploadShouldFail = false;

  setup(): void {
    if (!this.originalFetch) {
      this.originalFetch = globalThis.fetch;
    }

    const self = this;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method || 'GET').toUpperCase();
      
      self.requestLog.push({
        url,
        method,
        headers: init?.headers,
        body: init?.body,
      });

      // 0. Local file photo URI (simulates local file read in Node.js test environment)
      if (url.startsWith('file://')) {
        return new Response(new Blob(['fake-image-bytes'], { type: 'image/jpeg' }), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        });
      }

      // 1. Health check endpoint
      if (url.includes('/api/v1/health')) {
        if (self.healthCheckShouldFail) {
          return new Response(
            JSON.stringify({ ok: false, error: 'Database and Redis cluster offline' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({
            ok: true,
            status: 'HEALTHY',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            services: { database: 'up', redis: 'up' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // 2. Presigned URL request
      if (url.includes('/api/v1/tech/upload-url')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              uploadUrl: 'https://minio.local/bucket/opm-uploads/test-key.jpg',
              presignedUrl: 'https://minio.local/bucket/opm-uploads/test-key.jpg',
              objectKey: 'opm-uploads/test-key.jpg',
              expiresInSeconds: 900,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // 3. MinIO Presigned Direct PUT upload
      if (url.includes('minio.local')) {
        if (self.minioShouldFail) {
          return new Response('MinIO S3 Gateway Timeout / Unreachable', { status: 504 });
        }
        return new Response('', { status: 200 });
      }

      // 4. Multipart Proxy Fallback endpoint (/api/v1/tech/tickets/:id/upload)
      if (url.includes('/api/v1/tech/tickets/') && url.includes('/upload')) {
        if (self.proxyUploadShouldFail) {
          return new Response(
            JSON.stringify({ success: false, error: { code: 'UPLOAD_FAILED', message: 'Proxy multipart upload rejected' } }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
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

      // 5. Custom registered routes
      for (const route of self.routes) {
        if (route.match(url, init)) {
          return route.handler(url, init);
        }
      }

      // Default mock fallback response
      return new Response(
        JSON.stringify({ ok: true, message: 'Mock fallback endpoint response' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };
  }

  addRoute(match: (url: string, init?: RequestInit) => boolean, handler: (url: string, init?: RequestInit) => Promise<Response> | Response): void {
    this.routes.unshift({ match, handler });
  }

  getRequestLog(): Array<{ url: string; method: string; headers?: HeadersInit; body?: any }> {
    return this.requestLog;
  }

  clearLog(): void {
    this.requestLog = [];
  }

  teardown(): void {
    if (this.originalFetch) {
      globalThis.fetch = this.originalFetch;
      this.originalFetch = null;
    }
    this.routes = [];
    this.requestLog = [];
    this.minioShouldFail = false;
    this.healthCheckShouldFail = false;
    this.proxyUploadShouldFail = false;
  }
}
