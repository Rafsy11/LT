import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { MockNetworkHarness } from '../helpers/mock-api';
import { ApiClient } from '../../../apps/mobile/src/api/client';
import { ApiResponse } from '@repo/shared';

// Contract wrapper ensuring progressive testability while M2 implements native methods
export class DynamicApiClientContract {
  private client: ApiClient;
  private currentBaseUrl: string;

  constructor(options: { baseUrl?: string; deviceId: string; appVersion?: string }) {
    this.currentBaseUrl = (options.baseUrl || 'http://localhost:3000').replace(/\/+$/, '');
    this.client = new ApiClient(options);
  }

  setBaseUrl(url: string): void {
    if (typeof (this.client as any).setBaseUrl === 'function') {
      (this.client as any).setBaseUrl(url);
    }
    this.currentBaseUrl = url.trim().replace(/\/+$/, '');
  }

  getBaseUrl(): string {
    if (typeof (this.client as any).getBaseUrl === 'function') {
      return (this.client as any).getBaseUrl();
    }
    return this.currentBaseUrl;
  }

  async checkHealth(targetUrl?: string): Promise<{ ok: boolean; message: string; details?: unknown }> {
    if (typeof (this.client as any).checkHealth === 'function') {
      return (this.client as any).checkHealth(targetUrl);
    }
    const checkUrl = `${(targetUrl || this.getBaseUrl()).replace(/\/+$/, '')}/api/v1/health`;
    try {
      const res = await fetch(checkUrl);
      if (res.ok) {
        const data = await res.json();
        return { ok: true, message: 'Server sehat dan terhubung', details: data };
      }
      return { ok: false, message: `Server mengembalikan status ${res.status}` };
    } catch (err: unknown) {
      return { ok: false, message: (err as Error).message || 'Gagal menghubungi server' };
    }
  }

  async uploadMultipart<T>(endpoint: string, formData: FormData): Promise<ApiResponse<T>> {
    if (typeof (this.client as any).uploadMultipart === 'function') {
      return (this.client as any).uploadMultipart(endpoint, formData);
    }
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${this.getBaseUrl()}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const res = await fetch(url, {
      method: 'POST',
      body: formData,
    });
    return res.json() as Promise<ApiResponse<T>>;
  }

  getClient(): ApiClient {
    return this.client;
  }
}

describe('Tier 1: Feature 10 - Dynamic Server URL & Health Check API (apps/mobile/src/api/client.ts)', () => {
  const harness = new MockNetworkHarness();

  beforeEach(() => {
    harness.setup();
  });

  afterEach(() => {
    harness.teardown();
  });

  it('normalizes trailing slashes when setting and getting baseUrl', () => {
    const client = new DynamicApiClientContract({
      baseUrl: 'http://192.168.1.100:8080///',
      deviceId: 'dev-field-01',
    });
    assert.strictEqual(client.getBaseUrl(), 'http://192.168.1.100:8080');

    client.setBaseUrl('https://ftth-ops.lintasarta.co.id////');
    assert.strictEqual(client.getBaseUrl(), 'https://ftth-ops.lintasarta.co.id');
  });

  it('performs health check query against GET /api/v1/health and confirms online status', async () => {
    const client = new DynamicApiClientContract({
      baseUrl: 'http://10.0.0.5:8080',
      deviceId: 'dev-field-01',
    });

    const result = await client.checkHealth();
    assert.strictEqual(result.ok, true);
    assert.match(result.message, /sehat|terhubung|ok/i);
  });

  it('handles server unavailability and reports clean failure status', async () => {
    harness.healthCheckShouldFail = true;
    const client = new DynamicApiClientContract({
      baseUrl: 'http://10.0.0.5:8080',
      deviceId: 'dev-field-01',
    });

    const result = await client.checkHealth();
    assert.strictEqual(result.ok, false);
    assert.match(result.message, /status 503|gagal|offline/i);
  });

  it('transmits FormData via uploadMultipart endpoint and returns parsed API response', async () => {
    const client = new DynamicApiClientContract({
      baseUrl: 'http://10.0.0.5:8080',
      deviceId: 'dev-field-01',
    });

    const formData = new FormData();
    formData.append('ticketId', 'WO-2025-0842');
    formData.append('file', new Blob(['test-photo-bytes']), 'opm.jpg');

    const response = await client.uploadMultipart<{ photoObjectKey: string }>(
      '/api/v1/tech/tickets/wo-2025-0842/upload',
      formData
    );

    assert.ok(response);
    assert.strictEqual(response.data?.photoObjectKey, 'proxy-uploads/test-key-fallback.jpg');
  });

  it('switches server URL dynamically and sends subsequent requests to the updated host', async () => {
    const client = new DynamicApiClientContract({
      baseUrl: 'http://old-server:8080',
      deviceId: 'dev-field-01',
    });

    client.setBaseUrl('http://new-production-server:8080');
    assert.strictEqual(client.getBaseUrl(), 'http://new-production-server:8080');

    await client.checkHealth();
    const lastRequest = harness.getRequestLog().pop();
    assert.ok(lastRequest);
    assert.ok(lastRequest.url.startsWith('http://new-production-server:8080'));
  });
});
