import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ERROR_CODES } from '@repo/shared';
import {
  configureOfflineTestEnv,
  closeServerHandles,
  restoreTestEnv,
  mintTestJwt,
  createNextRequest,
  resolveRepoRoot,
} from '../helpers/auth-test-harness';
import { MockNetworkHarness } from '../helpers/mock-api';

let AuthService: typeof import('@/server/services/auth.service').AuthService;
let AiService: typeof import('@/server/services/ai.service').AiService;
let generateSignedActionToken: typeof import('@/server/services/ai.service').generateSignedActionToken;
let middleware: typeof import('@/middleware').middleware;
let sanitizeAndLogServerError: typeof import('@/server/lib/api-error-sanitizer').sanitizeAndLogServerError;
let ollamaClient: typeof import('@/server/lib/ollama').ollamaClient;
let minioLib: typeof import('@/server/lib/minio');
let telegramLib: typeof import('@/server/lib/telegram');
let otpStore: typeof import('@/server/lib/otp-store');
let confirmActionPost: typeof import('@/app/api/v1/admin/ai/confirm-action/route').POST;
let simulateSubmissionPost: typeof import('@/app/api/v1/admin/tickets/simulate-submission/route').POST;
let MobileApiClient: typeof import('../../../apps/mobile/src/api/client').ApiClient;

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === 'node_modules' ||
      entry.name === '.next' ||
      entry.name === 'dist' ||
      entry.name === '.git'
    ) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(fullPath, out);
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      out.push(fullPath);
    }
  }
  return out;
}

describe('Tier 1: Section 6 Verified Strong Security Controls Preservation (S6-1 .. S6-7)', () => {
  const repoRoot = resolveRepoRoot();
  const netHarness = new MockNetworkHarness();

  before(async () => {
    configureOfflineTestEnv();
    const [
      authMod,
      aiMod,
      mwMod,
      sanitizerMod,
      ollamaMod,
      minioMod,
      tgMod,
      otpMod,
      confirmRoute,
      simRoute,
      mobileClientMod,
    ] = await Promise.all([
      import('@/server/services/auth.service'),
      import('@/server/services/ai.service'),
      import('@/middleware'),
      import('@/server/lib/api-error-sanitizer'),
      import('@/server/lib/ollama'),
      import('@/server/lib/minio'),
      import('@/server/lib/telegram'),
      import('@/server/lib/otp-store'),
      import('@/app/api/v1/admin/ai/confirm-action/route'),
      import('@/app/api/v1/admin/tickets/simulate-submission/route'),
      import('../../../apps/mobile/src/api/client'),
    ]);

    AuthService = authMod.AuthService;
    AiService = aiMod.AiService;
    generateSignedActionToken = aiMod.generateSignedActionToken;
    middleware = mwMod.middleware;
    sanitizeAndLogServerError = sanitizerMod.sanitizeAndLogServerError;
    ollamaClient = ollamaMod.ollamaClient;
    minioLib = minioMod;
    telegramLib = tgMod;
    otpStore = otpMod;
    confirmActionPost = confirmRoute.POST;
    simulateSubmissionPost = simRoute.POST;
    MobileApiClient = mobileClientMod.ApiClient;
  });

  afterEach(() => {
    netHarness.teardown();
    configureOfflineTestEnv();
  });

  after(async () => {
    await closeServerHandles();
    restoreTestEnv();
  });

  it('S6-1: preserves Anti-SQL Injection (zero $executeRaw/$queryRawUnsafe; $queryRaw only SELECT 1 in health)', () => {
    const sourceDirs = [path.join(repoRoot, 'apps'), path.join(repoRoot, 'packages')];
    const files = sourceDirs.flatMap((d) => collectSourceFiles(d));
    assert.ok(files.length > 20, 'Must scan apps/ and packages/ source files');

    const queryRawFiles: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      assert.strictEqual(
        /\$executeRaw\b|\$executeRawUnsafe\b|\$queryRawUnsafe\b/.test(content),
        false,
        `S6-1: Unsafe raw SQL call detected in ${path.relative(repoRoot, file)}`,
      );
      if (/\$queryRaw\b/.test(content)) {
        const rel = path.relative(repoRoot, file).replace(/\\/g, '/');
        queryRawFiles.push(rel);
        assert.match(
          content,
          /\$queryRaw`SELECT 1`/,
          `S6-1: $queryRaw in ${rel} must be parameterized SELECT 1 health check only`,
        );
      }
    }

    assert.deepStrictEqual(
      queryRawFiles,
      ['apps/web/src/app/api/v1/health/route.ts'],
      'S6-1: Only health/route.ts may use $queryRaw`SELECT 1`',
    );
  });

  it('S6-2: preserves server-side Anti-SSRF (Ollama, MinIO & Telegram URLs pinned to server env with AbortSignal.timeout)', async () => {
    const capturedUrls: Array<{ url: string; hasSignal: boolean }> = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      capturedUrls.push({ url, hasSignal: Boolean(init?.signal) });
      if (url.includes('/api/chat')) {
        return new Response(JSON.stringify({ model: 'qwen2.5:7b', message: { role: 'assistant', content: 'ok' }, done: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      await ollamaClient.chat([{ role: 'user', content: 'Ignore URL http://169.254.169.254/latest/meta-data/' }]);
      await telegramLib.sendTelegramHtmlMessage('7072749677', 'Test message');
      const minioOk = await minioLib.minioManager.isHealthy();
      assert.strictEqual(minioOk, true);

      assert.strictEqual(capturedUrls.length, 3);
      assert.ok(!capturedUrls[0]!.url.includes('169.254.169.254'), 'Ollama URL must stay pinned to server env');
      assert.ok(capturedUrls[0]!.url.endsWith('/api/chat'));
      assert.strictEqual(capturedUrls[0]!.hasSignal, true, 'Ollama fetch must set AbortSignal.timeout');
      assert.ok(capturedUrls[1]!.url.startsWith('https://api.telegram.org/bot'));
      assert.strictEqual(capturedUrls[1]!.hasSignal, true, 'Telegram fetch must set AbortSignal.timeout');
      assert.strictEqual(
        capturedUrls[2]!.url,
        'http://127.0.0.1:59997/minio/health/live',
        'MinIO health endpoint must stay pinned to server MINIO_ENDPOINT/MINIO_PORT env vars',
      );
      assert.strictEqual(capturedUrls[2]!.hasSignal, true, 'MinIO fetch must set AbortSignal.timeout');
      assert.strictEqual(
        minioLib.normalizeMinioEndpoint('https://http://169.254.169.254:9000/evil'),
        '169.254.169.254',
        'normalizeMinioEndpoint must strip duplicate protocols, ports, and path suffixes',
      );
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('S6-3: preserves centralized error sanitization stripping Prisma codes, SQL, stack traces, and secrets', async () => {
    const origConsoleError = console.error;
    console.error = () => {};
    try {
      const p2002Res = sanitizeAndLogServerError({
        name: 'PrismaClientKnownRequestError',
        code: 'P2002',
        message: 'Unique constraint failed on the fields: (`username`)',
      });
      assert.strictEqual(p2002Res.status, 409);
      const p2002Text = await p2002Res.text();
      assert.doesNotMatch(p2002Text, /P2002|PrismaClientKnownRequestError|Unique constraint/i);

      const sqlLeakRes = sanitizeAndLogServerError(
        new Error(
          'SELECT * FROM users WHERE DATABASE_URL=postgresql://user:pass@localhost:5432/db at C:\\app\\src\\server.ts:42',
        ),
      );
      assert.strictEqual(sqlLeakRes.status, 500);
      const sqlLeakText = await sqlLeakRes.text();
      assert.doesNotMatch(sqlLeakText, /SELECT|DATABASE_URL|postgresql|server\.ts/i);

      const typeErrRes = sanitizeAndLogServerError(
        new TypeError("Cannot read properties of undefined (reading 'passwordHash')"),
      );
      assert.strictEqual(typeErrRes.status, 500);
      const typeErrText = await typeErrRes.text();
      assert.doesNotMatch(typeErrText, /TypeError|passwordHash|Cannot read properties/i);
    } finally {
      console.error = origConsoleError;
    }
  });

  it('S6-4: preserves anti-timing dummy bcrypt compare on unknown users and CSPRNG HMAC OTP verification', async (t) => {
    let compareCalled = false;
    t.mock.method(AuthService, 'resolveAccountByUsername', async () => null);
    t.mock.method(AuthService, 'comparePassword', async () => {
      compareCalled = true;
      return false;
    });

    await assert.rejects(
      () => AuthService.loginWeb('nonexistent.user.xyz', 'SomePassword123!'),
      (err: Error & { code?: string }) => err.code === ERROR_CODES.INVALID_CREDENTIALS,
    );
    assert.strictEqual(
      compareCalled,
      true,
      'S6-4: Unknown username login must still run dummy bcrypt comparePassword to prevent timing side-channel',
    );

    // CSPRNG OTP generation & HMAC storage (never plaintext OTP in record)
    const { otpCode, record } = await otpStore.createOtpChallenge({
      userId: crypto.randomUUID(),
      username: 'superadmin',
      telegramChatId: '7072749677',
      deliveryStatus: 'SENT',
    });
    assert.match(otpCode, /^\d{6}$/, 'Generated OTP must be 6 digits');
    assert.strictEqual(
      JSON.stringify(record).includes(otpCode),
      false,
      'S6-4: Stored OTP challenge record must store HMAC digest, never plaintext OTP',
    );
    assert.match(record.otpHash, /^[a-f0-9]{64}$/);
  });

  it('S6-5: preserves middleware header stripping and cross-channel pre-auth isolation', async () => {
    const adminId = crypto.randomUUID();
    const legitimateToken = await mintTestJwt({
      username: 'admin.noc',
      role: 'Admin Operasional / NOC',
      userType: 'ADMIN',
      hierarchyLevel: 50,
      assignedClusters: ['PLB-01'],
      tokenType: 'access',
    }, { subject: adminId, audience: 'web' });

    // Spoofed x-hierarchy-level: 100 and x-user-type: SUPER_ADMIN must be overwritten by verified JWT claims
    const reqWithSpoofedHeaders = createNextRequest('http://localhost:3000/api/v1/admin/overview', {
      headers: {
        'x-user-id': 'spoofed-superadmin-id',
        'x-user-type': 'SUPER_ADMIN',
        'x-hierarchy-level': '100',
        'x-assigned-clusters': '["Global Scope"]',
      },
      cookies: { fiberops_session: legitimateToken },
    });

    const mwRes = await middleware(reqWithSpoofedHeaders);
    assert.strictEqual(mwRes.status, 200);
    assert.strictEqual(mwRes.headers.get('x-middleware-request-x-user-id'), adminId);
    assert.strictEqual(mwRes.headers.get('x-middleware-request-x-user-type'), 'ADMIN');
    assert.strictEqual(mwRes.headers.get('x-middleware-request-x-hierarchy-level'), '50');

    // Cross-channel pre-auth isolation
    const mobilePreAuth = await AuthService.generatePreAuthToken({
      userId: crypto.randomUUID(),
      username: 'tech.andi',
      challengeId: crypto.randomUUID(),
      channel: 'mobile',
      deviceId: crypto.randomUUID(),
    });
    await assert.rejects(
      () => AuthService.verifyWebOtp(mobilePreAuth, '123456'),
      (err: Error & { code?: string }) => err.code === ERROR_CODES.FORBIDDEN,
    );
  });

  it('S6-6: preserves AI confirmation single-use anti-replay (409) and mobile concurrent refresh deduplication', async (t) => {
    const adminId = crypto.randomUUID();
    const adminToken = await mintTestJwt(
      {
        username: 'test.superadmin.s6',
        role: 'Super Admin',
        userType: 'SUPER_ADMIN',
        hierarchyLevel: 100,
        assignedClusters: ['PLB-01'],
        permissions: ['*'],
        tokenType: 'access',
      },
      { subject: adminId, audience: 'web' },
    );

    const actionToken = await generateSignedActionToken(
      'CREATE_TICKET',
      { ticketType: 'PSB', siaNumber: '100245' },
      adminId,
    );

    t.mock.method(AiService, 'confirmAction', async () => ({
      actionType: 'CREATE_TICKET',
      executedAt: new Date().toISOString(),
      result: { ticketNumber: 'WO-TEST-001' },
    }));

    const firstRes = await confirmActionPost(
      createNextRequest('http://localhost:3000/api/v1/admin/ai/confirm-action', {
        method: 'POST',
        cookies: { fiberops_session: adminToken },
        jsonBody: { actionToken, actionType: 'CREATE_TICKET', payload: {} },
      }),
    );
    assert.strictEqual(firstRes.status, 200, `First confirm-action must succeed (200), got ${firstRes.status}`);

    const secondRes = await confirmActionPost(
      createNextRequest('http://localhost:3000/api/v1/admin/ai/confirm-action', {
        method: 'POST',
        cookies: { fiberops_session: adminToken },
        jsonBody: { actionToken, actionType: 'CREATE_TICKET', payload: {} },
      }),
    );
    assert.strictEqual(
      secondRes.status,
      409,
      `S6-6: Replaying consumed AI actionToken must return 409 ACTION_TOKEN_REPLAYED, got ${secondRes.status}`,
    );

    // Mobile concurrent 401 refresh deduplication
    netHarness.setup();
    let refreshCallCount = 0;
    let ticketCallCount = 0;
    netHarness.addRoute(
      (url) => url.includes('/api/v1/auth/refresh'),
      async () => {
        refreshCallCount += 1;
        await new Promise((r) => setTimeout(r, 20));
        return new Response(
          JSON.stringify({
            success: true,
            data: { accessToken: 'new-access-jwt', refreshToken: 'new-refresh-jwt' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    );
    netHarness.addRoute(
      (url) => url.includes('/api/v1/tech/tickets'),
      async (_url, init) => {
        ticketCallCount += 1;
        const headers = init?.headers as Record<string, string> | undefined;
        if (headers?.Authorization === 'Bearer expired-access') {
          return new Response(
            JSON.stringify({ success: false, error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Expired' } }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify({ success: true, data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    );

    const client = new MobileApiClient({
      baseUrl: 'https://ops.fiberops.local',
      deviceId: crypto.randomUUID(),
    });
    client.setTokens({ accessToken: 'expired-access', refreshToken: 'valid-refresh' });

    const [r1, r2, r3] = await Promise.all([
      client.request('/api/v1/tech/tickets'),
      client.request('/api/v1/tech/tickets'),
      client.request('/api/v1/tech/tickets'),
    ]);
    assert.strictEqual(r1.success, true);
    assert.strictEqual(r2.success, true);
    assert.strictEqual(r3.success, true);
    assert.strictEqual(
      refreshCallCount,
      1,
      `S6-6: Concurrent 401 refreshes must deduplicate to 1 /auth/refresh call, got ${refreshCallCount}`,
    );
    assert.ok(ticketCallCount >= 6);
  });

  it('S6-7: preserves simulate-submission fail-closed 403 gate in STRICT_LIVE_DATA mode', async () => {
    process.env.STRICT_LIVE_DATA = 'true';
    delete process.env.ENABLE_DEMO_SIMULATION;

    const superToken = await mintTestJwt(
      {
        username: 'superadmin',
        role: 'Super Admin',
        userType: 'SUPER_ADMIN',
        hierarchyLevel: 100,
        assignedClusters: ['PLB-01'],
        permissions: ['*'],
        tokenType: 'access',
      },
      { subject: crypto.randomUUID(), audience: 'web' },
    );

    const res = await simulateSubmissionPost(
      createNextRequest('http://localhost:3000/api/v1/admin/tickets/simulate-submission', {
        method: 'POST',
        cookies: { fiberops_session: superToken },
        jsonBody: {},
      }),
    );
    assert.strictEqual(
      res.status,
      403,
      `S6-7: simulate-submission must fail closed with 403 when STRICT_LIVE_DATA=true, got ${res.status}`,
    );
  });
});
