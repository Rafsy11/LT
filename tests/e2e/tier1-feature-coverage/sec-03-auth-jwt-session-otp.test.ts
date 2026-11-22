import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import crypto from 'node:crypto';
import { ERROR_CODES } from '@repo/shared';
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
let generateSignedActionToken: typeof import('@/server/services/ai.service').generateSignedActionToken;
let middleware: typeof import('@/middleware').middleware;
let otpStore: typeof import('@/server/lib/otp-store');
let telegramLib: typeof import('@/server/lib/telegram');
let redisManager: typeof import('@/server/lib/redis').redisManager;
let prisma: typeof import('@repo/database').prisma;
let resetDatabaseHealthCache: typeof import('@repo/database').resetDatabaseHealthCache;

let refreshPost: typeof import('@/app/api/v1/auth/refresh/route').POST;
let logoutPost: typeof import('@/app/api/v1/auth/logout/route').POST;
let verifyOtpPost: typeof import('@/app/api/v1/auth/verify-otp/route').POST;
let adminOverviewGet: typeof import('@/app/api/v1/admin/overview/route').GET;
let confirmActionPost: typeof import('@/app/api/v1/admin/ai/confirm-action/route').POST;

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

describe('Tier 1: Security JWT, Session Lifecycle & OTP Atomicity (AUTH-04, AUTH-05, AUTH-09, API-12)', () => {
  before(async () => {
    configureOfflineTestEnv();
    const [
      authMod,
      aiMod,
      mwMod,
      otpMod,
      tgMod,
      redisMod,
      dbMod,
      refreshRoute,
      logoutRoute,
      verifyOtpRoute,
      overviewRoute,
      confirmActionRoute,
    ] = await Promise.all([
      import('@/server/services/auth.service'),
      import('@/server/services/ai.service'),
      import('@/middleware'),
      import('@/server/lib/otp-store'),
      import('@/server/lib/telegram'),
      import('@/server/lib/redis'),
      import('@repo/database'),
      import('@/app/api/v1/auth/refresh/route'),
      import('@/app/api/v1/auth/logout/route'),
      import('@/app/api/v1/auth/verify-otp/route'),
      import('@/app/api/v1/admin/overview/route'),
      import('@/app/api/v1/admin/ai/confirm-action/route'),
    ]);

    AuthService = authMod.AuthService;
    generateSignedActionToken = aiMod.generateSignedActionToken;
    middleware = mwMod.middleware;
    otpStore = otpMod;
    telegramLib = tgMod;
    redisManager = redisMod.redisManager;
    prisma = dbMod.prisma;
    resetDatabaseHealthCache = dbMod.resetDatabaseHealthCache;

    refreshPost = refreshRoute.POST;
    logoutPost = logoutRoute.POST;
    verifyOtpPost = verifyOtpRoute.POST;
    adminOverviewGet = overviewRoute.GET;
    confirmActionPost = confirmActionRoute.POST;
  });

  afterEach(() => {
    configureOfflineTestEnv();
  });

  after(async () => {
    await closeServerHandles();
    restoreTestEnv();
  });

  it('AUTH-04: supports 4 consecutive refresh token rotations without jti collision or bcrypt 72-byte truncation and revokes on token reuse', async () => {
    const userId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const deviceId = crypto.randomUUID();

    let currentRefreshHash = '';
    let sessionRevoked = false;

    const initialRefresh = await AuthService.generateRefreshToken(userId, sessionId, deviceId);
    // Use real AuthService.verifyMobileOtp or hash storage via refresh flow:
    // First rotation starts from initial token hashed via crypto/AuthService; to remain opaque-box,
    // obtain initial refreshToken + stored hash through verifyMobileOtp!
    const challenge = await otpStore.createOtpChallenge({
      userId,
      username: 'tech.andi',
      telegramChatId: '7072749677',
      deliveryStatus: 'SENT',
    });
    const preAuth = await AuthService.generatePreAuthToken({
      userId,
      username: 'tech.andi',
      challengeId: challenge.record.challengeId,
      channel: 'mobile',
      deviceId,
    });

    const restoreFns: Array<() => void> = [];
    await withMockTcpDbServer(async () => {
      try {
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
          stubMethod(prisma.userSession, 'updateMany', (async (args: { data?: { revokedAt?: Date } }) => {
            if (args.data?.revokedAt) {
              sessionRevoked = true;
            }
            return { count: 1 };
          }) as unknown as typeof prisma.userSession.updateMany),
        );
        restoreFns.push(
          stubMethod(prisma.userSession, 'create', (async () => {
            sessionRevoked = false;
            return {
              id: sessionId,
              userId,
              deviceId,
              refreshTokenHash: 'pending',
              revokedAt: null,
              expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
            };
          }) as unknown as typeof prisma.userSession.create),
        );
        restoreFns.push(
          stubMethod(prisma.userSession, 'update', (async (args: { data: { refreshTokenHash?: string } }) => {
            if (args.data.refreshTokenHash) {
              currentRefreshHash = args.data.refreshTokenHash;
            }
            return { id: sessionId };
          }) as unknown as typeof prisma.userSession.update),
        );
        restoreFns.push(
          stubMethod(prisma.userSession, 'findUnique', (async () => ({
            id: sessionId,
            userId,
            deviceId,
            refreshTokenHash: currentRefreshHash,
            revokedAt: sessionRevoked ? new Date() : null,
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
          stubMethod(prisma.userSession, 'findMany', (async () => [{ deviceId }]) as unknown as typeof prisma.userSession.findMany),
        );
        restoreFns.push(
          stubMethod(prisma.activityLog, 'create', (async () => ({ id: 'log-1' })) as unknown as typeof prisma.activityLog.create),
        );

        const verified = await AuthService.verifyMobileOtp(preAuth, challenge.otpCode, { deviceId });
        assert.ok(verified.refreshToken && currentRefreshHash);
        void initialRefresh;

        // Verify stored refreshTokenHash is a 64-hex HMAC-SHA256 digest, NEVER a 72-byte-truncating bcrypt hash
        assert.doesNotMatch(
          currentRefreshHash,
          /^\$2[aby]\$/,
          'AUTH-04: currentRefreshHash must NOT use bcrypt ($2a$/$2b$) which truncates JWTs at 72 bytes',
        );
        assert.match(
          currentRefreshHash,
          /^[a-f0-9]{64}$/,
          `AUTH-04: currentRefreshHash must be a 64-hex HMAC-SHA256 digest, got ${currentRefreshHash.slice(0, 20)}...`,
        );

        // Two refresh JWTs for the same sessionId share identical first 72 bytes; bcrypt would accept the sibling token!
        const samePrefixDifferentTailToken = await AuthService.generateRefreshToken(
          userId,
          sessionId,
          deviceId,
        );
        assert.strictEqual(
          samePrefixDifferentTailToken.slice(0, 72),
          verified.refreshToken.slice(0, 72),
          'Test setup: sibling refresh JWT must share first 72 bytes to prove absence of bcrypt truncation',
        );
        const tailMutationRes = await refreshPost(
          createNextRequest('http://localhost:3000/api/v1/auth/refresh', {
            method: 'POST',
            headers: { 'x-real-ip': '203.0.113.21' },
            jsonBody: { refreshToken: samePrefixDifferentTailToken, deviceId },
          }),
        );
        assert.strictEqual(
          tailMutationRes.status,
          401,
          `AUTH-04: Refresh JWT differing only beyond byte 72 must be rejected with 401 (got ${tailMutationRes.status})`,
        );

        const tokenHistory: string[] = [verified.refreshToken];
        let latestToken = verified.refreshToken;

        // Perform 4 consecutive rotations via POST /api/v1/auth/refresh
        for (let round = 1; round <= 4; round++) {
          const res = await refreshPost(
            createNextRequest('http://localhost:3000/api/v1/auth/refresh', {
              method: 'POST',
              headers: { 'x-real-ip': '203.0.113.20' },
              jsonBody: { refreshToken: latestToken, deviceId },
            }),
          );
          assert.strictEqual(
            res.status,
            200,
            `AUTH-04: Refresh rotation round ${round} must succeed with 200 (no .slice(0,32) jti collision), got ${res.status}`,
          );
          const body = (await res.json()) as {
            success: boolean;
            data: { accessToken: string; refreshToken: string };
          };
          assert.ok(body.data.accessToken && body.data.refreshToken);
          assert.notStrictEqual(body.data.refreshToken, latestToken, 'Rotated refreshToken must be new');
          latestToken = body.data.refreshToken;
          tokenHistory.push(latestToken);
        }

        // Replaying an already-rotated token (tokenHistory[0]) MUST detect reuse and revoke session
        const replayRes = await refreshPost(
          createNextRequest('http://localhost:3000/api/v1/auth/refresh', {
            method: 'POST',
            headers: { 'x-real-ip': '203.0.113.20' },
            jsonBody: { refreshToken: tokenHistory[0], deviceId },
          }),
        );
        assert.strictEqual(replayRes.status, 401);
        const replayJson = (await replayRes.json()) as { error?: { code?: string } };
        assert.strictEqual(
          replayJson.error?.code,
          ERROR_CODES.TOKEN_REUSE_DETECTED,
          'AUTH-04: Replaying rotated refresh token must trigger TOKEN_REUSE_DETECTED',
        );
      } finally {
        while (restoreFns.length > 0) {
          restoreFns.pop()?.();
        }
      }
    });
  });

  it('AUTH-04 + API-12: blocks cross-purpose JWT confusion (refresh/ai_action as Bearer, access on /refresh) and rate-limits /auth/refresh', async () => {
    const userId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const deviceId = crypto.randomUUID();

    const refreshToken = await AuthService.generateRefreshToken(userId, sessionId, deviceId);
    const aiActionToken = await generateSignedActionToken(
      'CREATE_TICKET',
      { ticketType: 'PSB', siaNumber: '100245' },
      userId,
    );
    const accessToken = await AuthService.generateAccessToken({
      id: userId,
      username: 'superadmin',
      roleName: 'Super Admin',
      userType: 'SUPER_ADMIN',
      hierarchyLevel: 100,
      assignedClusters: ['PLB-01'],
    });

    // 1. Refresh token used as Bearer on /api/v1/tech/tickets -> 401
    const techWithRefreshRes = await middleware(
      createNextRequest('http://localhost:3000/api/v1/tech/tickets', {
        headers: {
          authorization: `Bearer ${refreshToken}`,
          'x-app-version': '1.0.0',
          'x-device-id': deviceId,
        },
      }),
    );
    assert.strictEqual(
      techWithRefreshRes.status,
      401,
      `API-12: Refresh token presented as Bearer on /api/v1/tech/* must be rejected with 401, got ${techWithRefreshRes.status}`,
    );

    // 1b. Refresh token used as Bearer/cookie on /api/v1/admin/* -> 401
    const prevStrictAdmin = process.env.STRICT_LIVE_DATA;
    process.env.STRICT_LIVE_DATA = 'true';
    const adminWithRefreshRes = await middleware(
      createNextRequest('http://localhost:3000/api/v1/admin/overview', {
        headers: { authorization: `Bearer ${refreshToken}` },
      }),
    );
    process.env.STRICT_LIVE_DATA = prevStrictAdmin;
    assert.strictEqual(
      adminWithRefreshRes.status,
      401,
      `AUTH-04: Refresh token presented on /api/v1/admin/* must be rejected with 401, got ${adminWithRefreshRes.status}`,
    );

    // 2. AI Action token used as Bearer on /api/v1/admin/overview -> 401
    const prevStrict = process.env.STRICT_LIVE_DATA;
    process.env.STRICT_LIVE_DATA = 'true';
    const adminWithAiRes = await middleware(
      createNextRequest('http://localhost:3000/api/v1/admin/overview', {
        headers: { authorization: `Bearer ${aiActionToken}` },
      }),
    );
    process.env.STRICT_LIVE_DATA = prevStrict;
    assert.strictEqual(
      adminWithAiRes.status,
      401,
      `API-12: AI action token presented as Bearer on /api/v1/admin/* must be rejected with 401, got ${adminWithAiRes.status}`,
    );

    // 2b. Access JWT submitted as actionToken on /api/v1/admin/ai/confirm-action -> must be rejected
    const confirmWithAccessRes = await confirmActionPost(
      createNextRequest('http://localhost:3000/api/v1/admin/ai/confirm-action', {
        method: 'POST',
        cookies: { fiberops_session: accessToken },
        jsonBody: {
          actionToken: accessToken,
          actionType: 'CREATE_TICKET',
          payload: {},
        },
      }),
    );
    assert.ok(
      confirmWithAccessRes.status === 400 ||
        confirmWithAccessRes.status === 401 ||
        confirmWithAccessRes.status === 403,
      `AUTH-04: Access JWT submitted as actionToken on confirm-action must be rejected (400/401/403), got ${confirmWithAccessRes.status}`,
    );

    // 3. AuthService.verifyAccessToken rejects both refreshToken and aiActionToken
    await assert.rejects(
      () => AuthService.verifyAccessToken(refreshToken),
      'AUTH-04: AuthService.verifyAccessToken must reject refresh tokens',
    );
    await assert.rejects(
      () => AuthService.verifyAccessToken(aiActionToken),
      'API-12: AuthService.verifyAccessToken must reject ai_action tokens',
    );

    // 4. Access token submitted to /api/v1/auth/refresh -> 401
    const refreshWithAccessRes = await refreshPost(
      createNextRequest('http://localhost:3000/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'x-real-ip': '203.0.113.45' },
        jsonBody: { refreshToken: accessToken, deviceId },
      }),
    );
    assert.strictEqual(
      refreshWithAccessRes.status,
      401,
      'AUTH-04: Access token submitted to /auth/refresh must return 401',
    );

    // 5. /api/v1/auth/refresh rate limiting (burst must yield 429 + Retry-After)
    let hit429 = false;
    let retryHeader: string | null = null;
    for (let i = 0; i < 20; i++) {
      const res = await refreshPost(
        createNextRequest('http://localhost:3000/api/v1/auth/refresh', {
          method: 'POST',
          headers: { 'x-real-ip': '203.0.113.99' },
          jsonBody: { refreshToken: 'invalid.jwt.token', deviceId: crypto.randomUUID() },
        }),
      );
      if (res.status === 429) {
        hit429 = true;
        retryHeader = res.headers.get('Retry-After');
        break;
      }
    }
    assert.strictEqual(hit429, true, 'AUTH-04: /api/v1/auth/refresh must enforce rate limiting (429)');
    assert.ok(retryHeader && Number(retryHeader) >= 1, '429 on /auth/refresh must set Retry-After');
  });

  it('AUTH-05: requires authentication on /auth/logout, prevents unauth deviceId DoS, and denylists revoked Web JWT jti', async () => {
    const victimDeviceId = `victim-device-${crypto.randomUUID()}`;

    // 1. Unauthenticated POST /api/v1/auth/logout must fail 401 and NOT blacklist victimDeviceId
    const unauthLogoutRes = await logoutPost(
      createNextRequest('http://localhost:3000/api/v1/auth/logout', {
        method: 'POST',
        jsonBody: { deviceId: victimDeviceId },
      }),
    );
    assert.strictEqual(
      unauthLogoutRes.status,
      401,
      `AUTH-05: Unauthenticated POST /api/v1/auth/logout must return 401, got ${unauthLogoutRes.status}`,
    );
    const victimBlacklisted = await redisManager.isSessionBlacklisted(victimDeviceId);
    assert.strictEqual(
      victimBlacklisted,
      false,
      'AUTH-05: Unauthenticated /auth/logout must NOT blacklist victim deviceId',
    );

    // 2. Authenticated web logout must clear cookie AND revoke Web JWT jti so subsequent API calls fail 401
    const adminId = crypto.randomUUID();
    const webJti = crypto.randomUUID();
    const webToken = await mintTestJwt(
      {
        username: 'superadmin',
        role: 'Super Admin',
        userType: 'SUPER_ADMIN',
        hierarchyLevel: 100,
        assignedClusters: ['PLB-01'],
        permissions: ['*'],
        tokenType: 'access',
      },
      { subject: adminId, audience: 'web', jti: webJti, secret: TEST_JWT_SECRET },
    );

    const authLogoutRes = await logoutPost(
      createNextRequest('http://localhost:3000/api/v1/auth/logout', {
        method: 'POST',
        cookies: { fiberops_session: webToken },
        jsonBody: {},
      }),
    );
    assert.strictEqual(authLogoutRes.status, 200);
    const setCookieHeader = authLogoutRes.headers.get('set-cookie') ?? '';
    assert.match(setCookieHeader, /fiberops_session=;/, 'Logout must clear fiberops_session cookie');
    assert.match(setCookieHeader, /Max-Age=0/i, 'Logout must expire fiberops_session cookie immediately');

    // Subsequent use of the logged-out Web JWT must be rejected (401 SESSION_REVOKED)
    await assert.rejects(
      () => AuthService.verifyAccessToken(webToken),
      /SESSION_REVOKED|UNAUTHORIZED/,
      'AUTH-05: Logged-out Web JWT jti must be rejected by AuthService.verifyAccessToken',
    );

    const restoreUser = stubMethod(prisma.user, 'findUnique', (async () => null) as unknown as typeof prisma.user.findUnique);
    try {
      const postLogoutAdminRes = await adminOverviewGet(
        createNextRequest('http://localhost:3000/api/v1/admin/overview', {
          cookies: { fiberops_session: webToken },
        }),
      );
      assert.strictEqual(
        postLogoutAdminRes.status,
        401,
        `AUTH-05: Revoked Web JWT must return 401 on /api/v1/admin/overview, got ${postLogoutAdminRes.status}`,
      );
    } finally {
      restoreUser();
    }

    // 3. Authenticated logout must ignore spoofed { deviceId: victimDeviceId } in body (prevents IDOR fleet lockout)
    const callerDeviceId = `caller-dev-${crypto.randomUUID()}`;
    const targetVictimDeviceId = `victim-idor-${crypto.randomUUID()}`;
    const techId = crypto.randomUUID();
    const techAccessToken = await mintTestJwt(
      {
        username: 'tech.andi',
        role: 'Vendor / Teknisi Lapangan',
        userType: 'TECHNICIAN',
        hierarchyLevel: 10,
        assignedClusters: ['PLB-01'],
        deviceId: callerDeviceId,
        tokenType: 'access',
      },
      { subject: techId, audience: 'mobile', secret: TEST_JWT_SECRET },
    );

    const revokedDeviceWhereIds: string[] = [];
    await withMockTcpDbServer(async () => {
      const restoreSessionFind = stubMethod(prisma.userSession, 'findFirst', (async () => ({
        id: crypto.randomUUID(),
      })) as unknown as typeof prisma.userSession.findFirst);
      const restoreSessionUpdateMany = stubMethod(prisma.userSession, 'updateMany', (async (args: {
        where?: { deviceId?: string };
      }) => {
        if (args.where?.deviceId) revokedDeviceWhereIds.push(args.where.deviceId);
        return { count: 1 };
      }) as unknown as typeof prisma.userSession.updateMany);
      const restoreTechUser = stubMethod(prisma.user, 'findUnique', (async () => ({
        id: techId,
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
      })) as unknown as typeof prisma.user.findUnique);
      const restoreSessionCreate = stubMethod(prisma.userSession, 'create', (async () => ({
        id: 'sess-relogin-1',
        userId: techId,
        deviceId: callerDeviceId,
        refreshTokenHash: 'pending',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
      })) as unknown as typeof prisma.userSession.create);
      const restoreSessionUpdate = stubMethod(prisma.userSession, 'update', (async () => ({
        id: 'sess-relogin-1',
      })) as unknown as typeof prisma.userSession.update);
      const restoreActivity = stubMethod(prisma.activityLog, 'create', (async () => ({
        id: 'act-1',
      })) as unknown as typeof prisma.activityLog.create);

      try {
        const idorLogoutRes = await logoutPost(
          createNextRequest('http://localhost:3000/api/v1/auth/logout', {
            method: 'POST',
            headers: {
              authorization: `Bearer ${techAccessToken}`,
              'x-device-id': callerDeviceId,
            },
            jsonBody: { deviceId: targetVictimDeviceId },
          }),
        );
        assert.strictEqual(idorLogoutRes.status, 200);
        assert.strictEqual(
          await redisManager.isSessionBlacklisted(targetVictimDeviceId),
          false,
          'AUTH-05: Authenticated /auth/logout must NOT blacklist victim deviceId supplied in body',
        );
        assert.strictEqual(
          revokedDeviceWhereIds.includes(targetVictimDeviceId),
          false,
          'AUTH-05: Authenticated /auth/logout must NOT revoke victim deviceId in DB',
        );

        // 4. Re-login on the same deviceId must clear inMemoryRevokedSessions so the new token is usable
        const reloginChallenge = await otpStore.createOtpChallenge({
          userId: techId,
          username: 'tech.andi',
          telegramChatId: '7072749677',
          deliveryStatus: 'SENT',
        });
        const reloginPreAuth = await AuthService.generatePreAuthToken({
          userId: techId,
          username: 'tech.andi',
          challengeId: reloginChallenge.record.challengeId,
          channel: 'mobile',
          deviceId: callerDeviceId,
        });
        const reloginRes = await AuthService.verifyMobileOtp(reloginPreAuth, reloginChallenge.otpCode, {
          deviceId: callerDeviceId,
        });
        assert.strictEqual(
          await redisManager.isSessionBlacklisted(callerDeviceId),
          false,
          'AUTH-05: Re-login via verifyMobileOtp must clear callerDeviceId from revoked-session denylist',
        );
        const verifiedActor = await AuthService.verifyAccessToken(reloginRes.accessToken);
        assert.strictEqual(verifiedActor.userId, techId);
      } finally {
        restoreSessionFind();
        restoreSessionUpdateMany();
        restoreTechUser();
        restoreSessionCreate();
        restoreSessionUpdate();
        restoreActivity();
      }
    });
  });

  it('AUTH-09: enforces atomic single-use OTP under concurrency and disables dev master OTP / default chat fallback in production', async () => {
    // 1. Concurrent OTP verification race (10 parallel attempts with valid OTP -> max 1 success)
    const userId = crypto.randomUUID();
    const { otpCode, record } = await otpStore.createOtpChallenge({
      userId,
      username: 'superadmin',
      telegramChatId: '7072749677',
      deliveryStatus: 'SENT',
    });

    const raceResults = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        otpStore.verifyAndConsumeOtpChallenge(record.challengeId, otpCode),
      ),
    );
    const successes = raceResults.filter((r) => r.status === 'fulfilled');
    const failures = raceResults.filter((r) => r.status === 'rejected');
    assert.strictEqual(
      successes.length,
      1,
      `AUTH-09: Atomic OTP verification must allow exactly 1 winner out of 10 concurrent attempts, got ${successes.length}`,
    );
    assert.strictEqual(failures.length, 9);

    // 2. Issuing a new challenge for the same user should invalidate any previous active challenge
    const firstChallenge = await otpStore.createOtpChallenge({
      userId,
      username: 'superadmin',
      telegramChatId: '7072749677',
      deliveryStatus: 'SENT',
    });
    const secondChallenge = await otpStore.createOtpChallenge({
      userId,
      username: 'superadmin',
      telegramChatId: '7072749677',
      deliveryStatus: 'SENT',
    });
    await assert.rejects(
      () => otpStore.verifyAndConsumeOtpChallenge(firstChallenge.record.challengeId, firstChallenge.otpCode),
      'AUTH-09: Creating a newer OTP challenge for the same user must invalidate the prior challenge',
    );
    const secondOk = await otpStore.verifyAndConsumeOtpChallenge(
      secondChallenge.record.challengeId,
      secondChallenge.otpCode,
    );
    assert.strictEqual(secondOk.challengeId, secondChallenge.record.challengeId);

    // 3. In production, static dev master OTP ('123456'), fallback chat, and plaintext OTP stdout logging must be disabled
    const prodOtpRes = await runIsolatedTsxScript(
      `
      import { createOtpChallenge, verifyAndConsumeOtpChallenge } from './src/server/lib/otp-store';
      import { resolveTelegramChatId, sendTelegramOtpMessage } from './src/server/lib/telegram';
      import { redisManager } from './src/server/lib/redis';
      async function main() {
        const ch = await createOtpChallenge({ userId: '${crypto.randomUUID()}', username: 'op', deliveryStatus: 'SENT' });
        let masterOtpAccepted = false;
        if (ch.otpCode !== '123456') {
          try {
            await verifyAndConsumeOtpChallenge(ch.record.challengeId, '123456');
            masterOtpAccepted = true;
          } catch {
            masterOtpAccepted = false;
          }
        }
        const fallbackChat = resolveTelegramChatId({ dbChatId: null });
        await sendTelegramOtpMessage({
          chatId: 'DEV_LOCAL_FALLBACK',
          otpCode: '739104',
          username: 'op',
          fullName: 'Operator',
        });
        console.log(JSON.stringify({ masterOtpAccepted, fallbackChat }));
        await redisManager.close();
      }
      main();
      `,
      {
        NODE_ENV: 'production',
        NEXT_PHASE: '',
        npm_lifecycle_event: '',
        DATABASE_URL: 'postgresql://u:StrongPass123@127.0.0.1:59999/db',
        REDIS_URL: 'redis://127.0.0.1:59998',
        MINIO_ACCESS_KEY: 'prod_minio_key',
        MINIO_SECRET_KEY: 'prod_minio_secret_strong',
        JWT_SECRET: TEST_JWT_SECRET,
        HMAC_ACTION_SECRET: 'valid-hmac-secret-at-least-32-characters-long-01',
        TELEGRAM_WEBHOOK_SECRET: TEST_TELEGRAM_WEBHOOK_SECRET,
        TELEGRAM_DEFAULT_CHAT_ID: '999888777',
      },
    );
    assert.strictEqual(prodOtpRes.exitCode, 0, `Prod OTP check failed: ${prodOtpRes.stderr}`);
    assert.strictEqual(
      prodOtpRes.stdout.includes('739104'),
      false,
      'AUTH-09: Production must suppress plaintext OTP stdout logging',
    );
    const prodParsed = JSON.parse(prodOtpRes.stdout.trim().split('\n').pop()!) as {
      masterOtpAccepted: boolean;
      fallbackChat: string | null;
    };
    assert.strictEqual(
      prodParsed.masterOtpAccepted,
      false,
      'AUTH-09: Static master OTP 123456 must never succeed in production',
    );
    assert.strictEqual(
      prodParsed.fallbackChat,
      null,
      'AUTH-09: TELEGRAM_DEFAULT_CHAT_ID fallback must be disabled in production when user has no bound dbChatId',
    );

    // 4. HTTP-level POST /api/v1/auth/verify-otp must reject OTP replay
    const tgFetch = createTelegramCaptureFetch();
    const restoreTg = tgFetch.install();
    const replayUserId = crypto.randomUUID();
    const restoreReplayUser = stubMethod(prisma.user, 'findUnique', (async () => ({
      id: replayUserId,
      nik: '882041',
      username: 'superadmin',
      fullName: 'Aditya Saputra',
      vendorCompany: null,
      passwordHash: 'h',
      telegramChatId: '7072749677',
      twoFactorEnabled: true,
      userType: 'SUPER_ADMIN',
      isActive: true,
      assignedClusters: ['PLB-01'],
      role: { id: 'role-super-admin', name: 'Super Admin', hierarchyLevel: 100, permissions: ['*'] },
    })) as unknown as typeof prisma.user.findUnique);
    try {
      const httpCh = await otpStore.createOtpChallenge({
        userId: replayUserId,
        username: 'superadmin',
        telegramChatId: '7072749677',
        deliveryStatus: 'SENT',
      });
      const httpPreAuth = await AuthService.generatePreAuthToken({
        userId: replayUserId,
        username: 'superadmin',
        challengeId: httpCh.record.challengeId,
        channel: 'web',
      });

      const firstVerifyRes = await verifyOtpPost(
        createNextRequest('http://localhost:3000/api/v1/auth/verify-otp', {
          method: 'POST',
          headers: { 'x-real-ip': '203.0.113.151' },
          jsonBody: { preAuthToken: httpPreAuth, otpCode: httpCh.otpCode },
        }),
      );
      assert.strictEqual(firstVerifyRes.status, 200, `First /verify-otp must return 200, got ${firstVerifyRes.status}`);

      const replayVerifyRes = await verifyOtpPost(
        createNextRequest('http://localhost:3000/api/v1/auth/verify-otp', {
          method: 'POST',
          headers: { 'x-real-ip': '203.0.113.151' },
          jsonBody: { preAuthToken: httpPreAuth, otpCode: httpCh.otpCode },
        }),
      );
      assert.ok(
        replayVerifyRes.status === 400 || replayVerifyRes.status === 401 || replayVerifyRes.status === 409,
        `AUTH-09: Replaying consumed OTP at /api/v1/auth/verify-otp must fail (400/401/409), got ${replayVerifyRes.status}`,
      );
    } finally {
      restoreReplayUser();
      restoreTg();
    }
    void telegramLib;
  });
});
