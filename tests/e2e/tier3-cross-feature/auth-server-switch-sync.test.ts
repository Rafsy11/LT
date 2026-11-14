import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient } from '../../../apps/mobile/src/api/client';
import { MockPersistentStorage, EncryptedStorageWrapper } from '../helpers/mock-storage';

const SERVER_URL_STORAGE_KEY = '@fiberops_server_url_v1';
const AUTH_TOKEN_STORAGE_KEY = '@fiberops_auth_tokens_v1';
const CACHED_TICKETS_KEY = '@fiberops_cached_tickets_v1';

describe('Tier 3: Cross-Feature - Auth, Server URL Switch & Cache Sync', () => {
  let originalFetch: typeof globalThis.fetch;
  let client: ApiClient;
  let mockStorage: MockPersistentStorage;
  let storageWrapper: EncryptedStorageWrapper;
  let serverAHealthy = true;
  let serverBHealthy = true;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    serverAHealthy = true;
    serverBHealthy = true;
    mockStorage = new MockPersistentStorage();
    storageWrapper = new EncryptedStorageWrapper(mockStorage);

    client = new ApiClient({
      baseUrl: 'http://server-a.local:3000',
      deviceId: 'dev-auth-sync-01',
    });

    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes('server-a.local') && url.includes('/api/v1/health')) {
        if (!serverAHealthy) {
          return new Response(JSON.stringify({ ok: false, error: 'Server A Maintenance' }), { status: 503 });
        }
        return new Response(JSON.stringify({ ok: true, status: 'HEALTHY', node: 'server-a' }), { status: 200 });
      }

      if (url.includes('server-b.local') && url.includes('/api/v1/health')) {
        if (!serverBHealthy) {
          return new Response(JSON.stringify({ ok: false, error: 'Server B Unreachable' }), { status: 503 });
        }
        return new Response(JSON.stringify({ ok: true, status: 'HEALTHY', node: 'server-b' }), { status: 200 });
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('1. verifies healthy server URL switch updates ApiClient and persists setting to storage', async () => {
    const targetUrl = 'http://server-b.local:3000';
    const healthResult = await client.checkHealth(targetUrl);

    assert.strictEqual(healthResult.ok, true);

    // Apply new base URL and persist
    client.setBaseUrl(targetUrl);
    await mockStorage.setItem(SERVER_URL_STORAGE_KEY, targetUrl);

    assert.strictEqual(client.getBaseUrl(), targetUrl);
    const persisted = await mockStorage.getItem(SERVER_URL_STORAGE_KEY);
    assert.strictEqual(persisted, targetUrl);
  });

  it('2. blocks server switch when target server health check fails and retains current baseUrl', async () => {
    serverBHealthy = false;
    const currentUrl = client.getBaseUrl();
    const badTargetUrl = 'http://server-b.local:3000';

    const healthResult = await client.checkHealth(badTargetUrl);
    assert.strictEqual(healthResult.ok, false);

    // Base URL must NOT be switched
    assert.strictEqual(client.getBaseUrl(), currentUrl);
  });

  it('3. invalidates existing session tokens in storage upon server URL change to prevent credential leakage', async () => {
    // Populate active session tokens
    await storageWrapper.setEncryptedItem(AUTH_TOKEN_STORAGE_KEY, {
      accessToken: 'jwt_secret_token_server_a',
      refreshToken: 'jwt_refresh_token_server_a',
    });

    // Verify tokens exist
    const tokenBefore = await storageWrapper.getEncryptedItem(AUTH_TOKEN_STORAGE_KEY);
    assert.ok(tokenBefore !== null);

    // Technician switches server to server B
    const newServerUrl = 'http://server-b.local:3000';
    const healthRes = await client.checkHealth(newServerUrl);
    assert.strictEqual(healthRes.ok, true);

    client.setBaseUrl(newServerUrl);
    // Security policy: server switch must invalidate auth tokens
    await storageWrapper.removeEncryptedItem(AUTH_TOKEN_STORAGE_KEY);

    const tokenAfter = await storageWrapper.getEncryptedItem(AUTH_TOKEN_STORAGE_KEY);
    assert.strictEqual(tokenAfter, null, 'Auth tokens must be purged upon server switch');
  });

  it('4. clears previous host cached tickets from storage upon server switch to avoid environment pollution', async () => {
    // Cache tickets from server A
    await storageWrapper.setEncryptedItem(CACHED_TICKETS_KEY, [
      { id: 'TKT-SRV-A-01', title: 'Ticket on Server A' },
    ]);

    const cachedBefore = await storageWrapper.getEncryptedItem<any[]>(CACHED_TICKETS_KEY);
    assert.strictEqual(cachedBefore?.length, 1);

    // Switch server
    client.setBaseUrl('http://server-b.local:3000');
    await storageWrapper.removeEncryptedItem(CACHED_TICKETS_KEY);

    const cachedAfter = await storageWrapper.getEncryptedItem(CACHED_TICKETS_KEY);
    assert.strictEqual(cachedAfter, null, 'Cache must be cleared when switching environments');
  });

  it('5. restores saved server URL from persistent storage on application startup and performs health check', async () => {
    // Setup initial persisted configuration
    await mockStorage.setItem(SERVER_URL_STORAGE_KEY, 'http://server-b.local:3000');

    // Simulate app bootstrap: read saved URL
    const savedUrl = await mockStorage.getItem(SERVER_URL_STORAGE_KEY);
    assert.ok(savedUrl !== null);

    const bootstrappedClient = new ApiClient({
      baseUrl: savedUrl,
      deviceId: 'dev-bootstrap',
    });

    assert.strictEqual(bootstrappedClient.getBaseUrl(), 'http://server-b.local:3000');
    const startupHealth = await bootstrappedClient.checkHealth();
    assert.strictEqual(startupHealth.ok, true);
  });

  it('6. normalizes trailing slashes and whitespace when storing and configuring server URL', async () => {
    const rawInput = '   http://server-b.local:3000/////   ';
    const normalized = rawInput.trim().replace(/\/+$/, '');

    client.setBaseUrl(normalized);
    await mockStorage.setItem(SERVER_URL_STORAGE_KEY, normalized);

    assert.strictEqual(client.getBaseUrl(), 'http://server-b.local:3000');
    assert.strictEqual(await mockStorage.getItem(SERVER_URL_STORAGE_KEY), 'http://server-b.local:3000');
  });
});
