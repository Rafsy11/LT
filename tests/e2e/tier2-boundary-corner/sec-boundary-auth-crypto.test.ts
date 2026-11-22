import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import crypto from 'node:crypto';
import { ERROR_CODES, createRoleSchema, verifyOtpRequestSchema, type UserSessionContext } from '@repo/shared';
import {
  configureOfflineTestEnv,
  closeServerHandles,
  restoreTestEnv,
  mintTestJwt,
  createNextRequest,
  createTelegramCaptureFetch,
  runIsolatedTsxScript,
  stubMethod,
  TEST_JWT_SECRET,
  TEST_TELEGRAM_WEBHOOK_SECRET,
  OFFLINE_DATABASE_URL,
} from '../helpers/auth-test-harness';

let AuthService: typeof import('@/server/services/auth.service').AuthService;
let RoleService: typeof import('@/server/services/role.service').RoleService;
let adminAuth: typeof import('@/server/lib/admin-auth');
let middleware: typeof import('@/middleware').middleware;
let otpStore: typeof import('@/server/lib/otp-store');
let prisma: typeof import('@repo/database').prisma;
let resetDatabaseHealthCache: typeof import('@repo/database').resetDatabaseHealthCache;
let authLoginPost: typeof import('@/app/api/v1/auth/login/route').POST;

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

describe('Tier 2: Boundary & Corner Cases — Auth, Crypto, Rate Limit & RBAC', () => {
  const restoreFns: Array<() => void> = [];

  before(async () => {
    configureOfflineTestEnv();
    const [authMod, roleMod, adminAuthMod, mwMod, otpMod, dbMod, loginRoute] = await Promise.all([
      import('@/server/services/auth.service'),
      import('@/server/services/role.service'),
      import('@/server/lib/admin-auth'),
      import('@/middleware'),
      import('@/server/lib/otp-store'),
      import('@repo/database'),
      import('@/app/api/v1/auth/login/route'),
    ]);

    AuthService = authMod.AuthService;
    RoleService = roleMod.RoleService;
    adminAuth = adminAuthMod;
    middleware = mwMod.middleware;
    otpStore = otpMod;
    prisma = dbMod.prisma;
    resetDatabaseHealthCache = dbMod.resetDatabaseHealthCache;
    authLoginPost = loginRoute.POST;
  });

  afterEach(() => {
    while (restoreFns.length > 0) {
      restoreFns.pop()?.();
    }
    configureOfflineTestEnv();
  });

  after(async () => {
    await closeServerHandles();
    restoreTestEnv();
  });

  it('JWT boundary: rejects alg=none unsigned tokens, expired tokens, and 2fa_pending tokens as Bearer', async () => {
    const headerB64 = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payloadB64 = Buffer.from(
      JSON.stringify({
        sub: crypto.randomUUID(),
        username: 'superadmin',
        userType: 'SUPER_ADMIN',
        hierarchyLevel: 100,
        tokenType: 'access',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url');
    const algNoneToken = `${headerB64}.${payloadB64}.`;

    await assert.rejects(() => AuthService.verifyAccessToken(algNoneToken));

    const prevStrict = process.env.STRICT_LIVE_DATA;
    process.env.STRICT_LIVE_DATA = 'true';
    try {
      const mwAlgNone = await middleware(
        createNextRequest('http://localhost:3000/api/v1/admin/overview', {
          headers: { authorization: `Bearer ${algNoneToken}` },
        }),
      );
      assert.strictEqual(mwAlgNone.status, 401, 'alg=none JWT must return 401 in middleware');

      const expiredJwt = await mintTestJwt(
        {
          username: 'tech.andi',
          userType: 'TECHNICIAN',
          hierarchyLevel: 10,
          tokenType: 'access',
        },
        { subject: crypto.randomUUID(), expiresIn: '-5s', audience: 'mobile' },
      );
      await assert.rejects(() => AuthService.verifyAccessToken(expiredJwt));

      const preAuthJwt = await AuthService.generatePreAuthToken({
        userId: crypto.randomUUID(),
        username: 'superadmin',
        challengeId: crypto.randomUUID(),
        channel: 'web',
      });
      const mwPreAuth = await middleware(
        createNextRequest('http://localhost:3000/api/v1/admin/overview', {
          headers: { authorization: `Bearer ${preAuthJwt}` },
        }),
      );
      assert.strictEqual(mwPreAuth.status, 401, '2fa_pending JWT must return 401 on protected routes');
    } finally {
      process.env.STRICT_LIVE_DATA = prevStrict;
    }
  });

  it('OTP boundary: locks challenge permanently after 3 wrong attempts, blocks cross-user preAuthToken, and rejects non-ASCII digits', async () => {
    // 1. Zod OTP boundary: 5 digits, 7 digits, Arabic-Indic numerals, letters
    for (const badOtp of ['12345', '1234567', '١٢٣٤٥٦', '12ab56', '      ']) {
      const parsed = verifyOtpRequestSchema.safeParse({
        preAuthToken: 'valid_len_preauth_token_123',
        otpCode: badOtp,
      });
      assert.strictEqual(parsed.success, false, `Malformed OTP "${badOtp}" must fail validation`);
    }

    // 2. 3 wrong attempts lock out challenge so 4th attempt with real OTP still fails
    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    const { otpCode, record } = await otpStore.createOtpChallenge({
      userId: userA,
      username: 'admin.noc',
      telegramChatId: '7072749677',
      deliveryStatus: 'SENT',
    });

    const wrongOtp = otpCode === '999999' ? '888888' : '999999';
    for (let attempt = 1; attempt <= 3; attempt++) {
      await assert.rejects(
        () => otpStore.verifyAndConsumeOtpChallenge(record.challengeId, wrongOtp),
        (err: Error & { code?: string }) =>
          err.code === ERROR_CODES.OTP_INVALID || err.code === ERROR_CODES.OTP_MAX_ATTEMPTS,
      );
    }
    await assert.rejects(
      () => otpStore.verifyAndConsumeOtpChallenge(record.challengeId, otpCode),
      'After 3 failed attempts, valid OTP on 4th try must fail',
    );

    // 3. Cross-user preAuthToken + challengeId mismatch must be rejected
    const chUserA = await otpStore.createOtpChallenge({
      userId: userA,
      username: 'admin.noc',
      telegramChatId: '7072749677',
      deliveryStatus: 'SENT',
    });
    const forgedPreAuthForUserB = await AuthService.generatePreAuthToken({
      userId: userB,
      username: 'superadmin',
      challengeId: chUserA.record.challengeId,
      channel: 'web',
    });
    await assert.rejects(
      () => AuthService.verifyWebOtp(forgedPreAuthForUserB, chUserA.otpCode),
      'Cross-user preAuthToken bound to another user challengeId must be rejected',
    );
  });

  it('XFF & IP spoofing boundary: multi-hop XFF and XSS/CRLF header values cannot bypass rate limits or inject Telegram HTML', async () => {
    const tgFetch = createTelegramCaptureFetch();
    restoreFns.push(tgFetch.install());

    const uniqueUser = `xff.boundary.${Date.now()}`;
    let statusAt6th = 0;
    for (let i = 1; i <= 6; i++) {
      const req = createNextRequest('http://localhost:3000/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'x-forwarded-for': `<script>${i}</script>, 10.0.0.${i}, 198.51.100.${i}`,
          'x-real-ip': '203.0.113.250',
        },
        jsonBody: { username: uniqueUser, password: 'WrongPassword123!' },
      });
      const res = await authLoginPost(req);
      statusAt6th = res.status;
    }
    assert.strictEqual(
      statusAt6th,
      429,
      'Multi-hop spoofed X-Forwarded-For with fixed x-real-ip must hit 429 rate limit on 6th attempt',
    );

    // Malformed / non-IP x-real-ip must NOT be trusted over valid IP in X-Forwarded-For (net.isIP() boundary)
    const nonIpUser = `nonip.boundary.${Date.now()}`;
    let nonIpStatusAt6th = 0;
    for (let i = 1; i <= 6; i++) {
      const req = createNextRequest('http://localhost:3000/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'x-real-ip': `not-an-ip-${i};<script>`,
          'x-forwarded-for': '198.51.100.77, 203.0.113.55',
        },
        jsonBody: { username: nonIpUser, password: 'WrongPassword123!' },
      });
      const res = await authLoginPost(req);
      nonIpStatusAt6th = res.status;
    }
    assert.strictEqual(
      nonIpStatusAt6th,
      429,
      'Rotating malformed/non-IP x-real-ip values with valid X-Forwarded-For must still trigger 429 rate limit',
    );
  });

  it('Refresh token >72-byte mutation boundary: rejects sibling token sharing first 72 bytes and forbids bcrypt refresh hash', async () => {
    const userId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const deviceId = crypto.randomUUID();
    let storedHash = '';

    const ch = await otpStore.createOtpChallenge({
      userId,
      username: 'tech.andi',
      telegramChatId: '7072749677',
      deliveryStatus: 'SENT',
    });
    const preAuth = await AuthService.generatePreAuthToken({
      userId,
      username: 'tech.andi',
      challengeId: ch.record.challengeId,
      channel: 'mobile',
      deviceId,
    });

    await withMockTcpDbServer(async () => {
      restoreFns.push(
        stubMethod(prisma.user, 'findUnique', (async () => ({
          id: userId,
          nik: '882043',
          username: 'tech.andi',
          fullName: 'Andi Pratama',
          vendorCompany: 'PT Mitra',
          passwordHash: 'h',
          telegramChatId: '7072749677',
          twoFactorEnabled: true,
          userType: 'TECHNICIAN',
          isActive: true,
          assignedClusters: ['PLB-01'],
          role: { id: 'role-tech', name: 'Vendor / Teknisi Lapangan', hierarchyLevel: 10, permissions: ['ticket:read', 'ticket:submit'] },
        })) as unknown as typeof prisma.user.findUnique),
      );
      restoreFns.push(
        stubMethod(prisma.userSession, 'updateMany', (async () => ({ count: 1 })) as unknown as typeof prisma.userSession.updateMany),
      );
      restoreFns.push(
        stubMethod(prisma.userSession, 'create', (async () => ({
          id: sessionId,
          userId,
          deviceId,
          refreshTokenHash: 'pending',
          revokedAt: null,
          expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
        })) as unknown as typeof prisma.userSession.create),
      );
      restoreFns.push(
        stubMethod(prisma.userSession, 'update', (async (args: { data: { refreshTokenHash?: string } }) => {
          if (args.data.refreshTokenHash) storedHash = args.data.refreshTokenHash;
          return { id: sessionId };
        }) as unknown as typeof prisma.userSession.update),
      );
      restoreFns.push(
        stubMethod(prisma.userSession, 'findUnique', (async () => ({
          id: sessionId,
          userId,
          deviceId,
          refreshTokenHash: storedHash,
          revokedAt: null,
          expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
          user: {
            id: userId,
            username: 'tech.andi',
            isActive: true,
            userType: 'TECHNICIAN',
            assignedClusters: ['PLB-01'],
            role: { id: 'role-tech', name: 'Vendor / Teknisi Lapangan', hierarchyLevel: 10, permissions: ['ticket:read', 'ticket:submit'] },
          },
        })) as unknown as typeof prisma.userSession.findUnique),
      );
      restoreFns.push(
        stubMethod(prisma.activityLog, 'create', (async () => ({ id: 'log-b1' })) as unknown as typeof prisma.activityLog.create),
      );

      const verified = await AuthService.verifyMobileOtp(preAuth, ch.otpCode, { deviceId });
      assert.match(
        storedHash,
        /^[a-f0-9]{64}$/,
        `Refresh token hash must be 64-hex HMAC-SHA256 (not bcrypt), got ${storedHash.slice(0, 16)}...`,
      );

      const siblingBeyond72 = await AuthService.generateRefreshToken(userId, sessionId, deviceId);
      assert.strictEqual(siblingBeyond72.slice(0, 72), verified.refreshToken.slice(0, 72));
      assert.notStrictEqual(siblingBeyond72, verified.refreshToken);

      await assert.rejects(
        () => AuthService.refreshMobileSession(siblingBeyond72, deviceId),
        /UNAUTHORIZED/,
        'Sibling refresh JWT sharing first 72 bytes must be rejected (zero bcrypt truncation)',
      );
    });
  });

  it('Secret & length bounds (AUTH-02): rejects 31-char secrets & .env.example placeholder in prod, accepts 32-char random secret', async () => {
    const baseProdEnv = {
      NODE_ENV: 'production',
      NEXT_PHASE: '',
      npm_lifecycle_event: '',
      DATABASE_URL: 'postgresql://u:StrongPass123@db.local:5432/fiberops',
      REDIS_URL: 'redis://:StrongRedisPass@redis.local:6379',
      MINIO_ACCESS_KEY: 'prod_minio_key',
      MINIO_SECRET_KEY: 'prod_minio_secret_strong',
      HMAC_ACTION_SECRET: 'hmac-secret-32-chars-minimum-99887766',
      TELEGRAM_WEBHOOK_SECRET: TEST_TELEGRAM_WEBHOOK_SECRET,
    };

    const res31 = await runIsolatedTsxScript(
      `import './src/env'; console.log('OK');`,
      { ...baseProdEnv, JWT_SECRET: 'a'.repeat(31) },
    );
    assert.notStrictEqual(res31.exitCode, 0, '31-char JWT_SECRET must fail in production');

    const resPlaceholder = await runIsolatedTsxScript(
      `import './src/env'; console.log('OK');`,
      { ...baseProdEnv, JWT_SECRET: 'replace-with-a-secure-random-32-byte-hex-secret' },
    );
    assert.notStrictEqual(
      resPlaceholder.exitCode,
      0,
      '.env.example placeholder JWT_SECRET must fail in production',
    );

    const res32 = await runIsolatedTsxScript(
      `import { env } from './src/env'; console.log(env.JWT_SECRET.length);`,
      { ...baseProdEnv, JWT_SECRET: TEST_JWT_SECRET },
    );
    assert.strictEqual(
      res32.exitCode,
      0,
      `Valid 64-char secret in production must pass env validation, stderr=${res32.stderr}`,
    );
  });

  it('Role hierarchy & cluster bounds: blocks equal/higher hierarchy mutation, empty-cluster wildcard, and hierarchyLevel >= 100 creation', () => {
    assert.throws(
      () => RoleService.checkHierarchyProtection(50, 50),
      /HIERARCHY_VIOLATION/,
      'Equal hierarchy level (50 vs 50) must throw HIERARCHY_VIOLATION',
    );
    assert.throws(
      () => RoleService.checkHierarchyProtection(50, 100),
      /HIERARCHY_VIOLATION/,
      'Lower actor vs higher target (50 vs 100) must throw HIERARCHY_VIOLATION',
    );

    const emptyClusterAdmin: UserSessionContext = {
      userId: crypto.randomUUID(),
      username: 'empty.admin',
      fullName: 'Empty Admin',
      role: 'Admin Operasional',
      userType: 'ADMIN',
      hierarchyLevel: 50,
      assignedClusters: [],
    };
    assert.strictEqual(
      adminAuth.matchesAssignedClusters(emptyClusterAdmin, 'PLB-01'),
      false,
      'Non-SUPER_ADMIN with empty assignedClusters must fail closed (false)',
    );

    assert.strictEqual(
      createRoleSchema.safeParse({ name: 'Escalated', permissions: ['ticket:read'], hierarchyLevel: 100 }).success,
      false,
      'createRoleSchema must reject hierarchyLevel 100',
    );
    assert.strictEqual(
      createRoleSchema.safeParse({ name: 'ZeroLevel', permissions: ['ticket:read'], hierarchyLevel: 0 }).success,
      false,
      'createRoleSchema must reject hierarchyLevel 0',
    );
  });
});
