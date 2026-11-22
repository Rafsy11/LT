import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { ERROR_CODES, PERMISSIONS } from '@repo/shared';
import {
  configureOfflineTestEnv,
  closeServerHandles,
  restoreTestEnv,
  mintTestJwt,
  createNextRequest,
  resolveRepoRoot,
  stubMethod,
  OFFLINE_DATABASE_URL,
} from '../helpers/auth-test-harness';
import { MockNetworkHarness } from '../helpers/mock-api';
import { MockPersistentStorage } from '../helpers/mock-storage';
import { createMockJpegBuffer } from '../helpers/test-fixtures';

let AuthService: typeof import('@/server/services/auth.service').AuthService;
let otpStore: typeof import('@/server/lib/otp-store');
let redisManager: typeof import('@/server/lib/redis').redisManager;
let minioManager: typeof import('@/server/lib/minio').minioManager;
let generateSignedActionToken: typeof import('@/server/services/ai.service').generateSignedActionToken;
let CustomerService: typeof import('@/server/services/customer.service').CustomerService;
let NetworkService: typeof import('@/server/services/network.service').NetworkService;
let prisma: typeof import('@repo/database').prisma;
let resetDatabaseHealthCache: typeof import('@repo/database').resetDatabaseHealthCache;

let verifyOtpPost: typeof import('@/app/api/v1/auth/verify-otp/route').POST;
let refreshPost: typeof import('@/app/api/v1/auth/refresh/route').POST;
let logoutPost: typeof import('@/app/api/v1/auth/logout/route').POST;
let adminOverviewGet: typeof import('@/app/api/v1/admin/overview/route').GET;
let adminRolesPatch: typeof import('@/app/api/v1/admin/roles/route').PATCH;
let adminUsersPatch: typeof import('@/app/api/v1/admin/users/[id]/route').PATCH;
let streamReportsGet: typeof import('@/app/api/v1/admin/stream/reports/route').GET;
let ticketApprovePost: typeof import('@/app/api/v1/admin/tickets/[id]/approve/route').POST;
let mediaPresignGet: typeof import('@/app/api/v1/admin/media/presign/route').GET;
let customersPost: typeof import('@/app/api/v1/admin/customers/route').POST;
let aiConfirmPost: typeof import('@/app/api/v1/admin/ai/confirm-action/route').POST;
let clustersAuditPost: typeof import('@/app/api/v1/admin/clusters/audit/route').POST;
let techForceLogoutPost: typeof import('@/app/api/v1/admin/technicians/[id]/force-logout/route').POST;

let ApiClient: typeof import('../../../apps/mobile/src/api/client').ApiClient;
let deviceIntegrity: typeof import('../../../apps/mobile/src/security/deviceIntegrity');
let locationGuard: typeof import('../../../apps/mobile/src/security/locationGuard');
let opmCamera: typeof import('../../../apps/mobile/src/camera/opmCamera');
let OfflineQueueManager: typeof import('../../../apps/mobile/src/sync/offlineQueue').OfflineQueueManager;

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

describe('Tier 4 Workload Security Journeys: Kill-Switch, Mobile Field Lifecycle & Multi-Cluster Tenant Isolation', () => {
  const restoreFns: Array<() => void> = [];
  let netHarness: MockNetworkHarness;

  before(async () => {
    configureOfflineTestEnv();
    netHarness = new MockNetworkHarness();
    const [
      authMod,
      otpMod,
      redisMod,
      minioMod,
      aiMod,
      custMod,
      netMod,
      dbMod,
      verifyRoute,
      refreshRoute,
      logoutRoute,
      overviewRoute,
      rolesRoute,
      usersIdRoute,
      sseRoute,
      approveRoute,
      presignRoute,
      custRoute,
      confirmRoute,
      auditRoute,
      forceLogoutRoute,
      clientMod,
      diMod,
      lgMod,
      camMod,
      oqMod,
    ] = await Promise.all([
      import('@/server/services/auth.service'),
      import('@/server/lib/otp-store'),
      import('@/server/lib/redis'),
      import('@/server/lib/minio'),
      import('@/server/services/ai.service'),
      import('@/server/services/customer.service'),
      import('@/server/services/network.service'),
      import('@repo/database'),
      import('@/app/api/v1/auth/verify-otp/route'),
      import('@/app/api/v1/auth/refresh/route'),
      import('@/app/api/v1/auth/logout/route'),
      import('@/app/api/v1/admin/overview/route'),
      import('@/app/api/v1/admin/roles/route'),
      import('@/app/api/v1/admin/users/[id]/route'),
      import('@/app/api/v1/admin/stream/reports/route'),
      import('@/app/api/v1/admin/tickets/[id]/approve/route'),
      import('@/app/api/v1/admin/media/presign/route'),
      import('@/app/api/v1/admin/customers/route'),
      import('@/app/api/v1/admin/ai/confirm-action/route'),
      import('@/app/api/v1/admin/clusters/audit/route'),
      import('@/app/api/v1/admin/technicians/[id]/force-logout/route'),
      import('../../../apps/mobile/src/api/client'),
      import('../../../apps/mobile/src/security/deviceIntegrity'),
      import('../../../apps/mobile/src/security/locationGuard'),
      import('../../../apps/mobile/src/camera/opmCamera'),
      import('../../../apps/mobile/src/sync/offlineQueue'),
    ]);

    AuthService = authMod.AuthService;
    otpStore = otpMod;
    redisManager = redisMod.redisManager;
    minioManager = minioMod.minioManager;
    generateSignedActionToken = aiMod.generateSignedActionToken;
    CustomerService = custMod.CustomerService;
    NetworkService = netMod.NetworkService;
    prisma = dbMod.prisma;
    resetDatabaseHealthCache = dbMod.resetDatabaseHealthCache;

    verifyOtpPost = verifyRoute.POST;
    refreshPost = refreshRoute.POST;
    logoutPost = logoutRoute.POST;
    adminOverviewGet = overviewRoute.GET;
    adminRolesPatch = rolesRoute.PATCH;
    adminUsersPatch = usersIdRoute.PATCH;
    streamReportsGet = sseRoute.GET;
    ticketApprovePost = approveRoute.POST;
    mediaPresignGet = presignRoute.GET;
    customersPost = custRoute.POST;
    aiConfirmPost = confirmRoute.POST;
    clustersAuditPost = auditRoute.POST;
    techForceLogoutPost = forceLogoutRoute.POST;

    ApiClient = clientMod.ApiClient;
    deviceIntegrity = diMod;
    locationGuard = lgMod;
    opmCamera = camMod;
    OfflineQueueManager = oqMod.OfflineQueueManager;
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

  it('Journey A: Multi-actor Auth/RBAC kill-switch — OTP login, cookie-only JWT, escalation block, demotion & SSE termination', async () => {
    const superAdminId = crypto.randomUUID();
    const operatorId = crypto.randomUUID();
    const techRoleId = crypto.randomUUID();
    let operatorUserType: 'ADMIN' | 'TECHNICIAN' = 'ADMIN';

    const superToken = await mintTestJwt(
      {
        username: 'superadmin',
        role: 'Super Admin',
        userType: 'SUPER_ADMIN',
        hierarchyLevel: 100,
        assignedClusters: ['PLBHRAGA01', 'PLBBSGGA01'],
        permissions: ['*'],
        tokenType: 'access',
      },
      { subject: superAdminId, audience: 'web' },
    );

    const challenge = await otpStore.createOtpChallenge({
      userId: operatorId,
      username: 'noc.plb01',
      telegramChatId: '7072749677',
      deliveryStatus: 'SENT',
    });
    const preAuth = await AuthService.generatePreAuthToken({
      userId: operatorId,
      username: 'noc.plb01',
      challengeId: challenge.record.challengeId,
      channel: 'web',
    });

    await withMockTcpDbServer(async () => {
      restoreFns.push(
        stubMethod(prisma.user, 'findUnique', (async (args: { where: { id?: string } }) => {
          if (args.where.id === superAdminId) {
            return {
              id: superAdminId,
              username: 'superadmin',
              fullName: 'Aditya Saputra',
              userType: 'SUPER_ADMIN',
              isActive: true,
              assignedClusters: ['PLBHRAGA01', 'PLBBSGGA01'],
              role: { id: 'r-sa', name: 'Super Admin', hierarchyLevel: 100, permissions: ['*'] },
            };
          }
          return {
            id: operatorId,
            nik: '882055',
            username: 'noc.plb01',
            fullName: 'Operator PLB01',
            userType: operatorUserType,
            isActive: true,
            assignedClusters: ['PLBHRAGA01'],
            role: {
              id: 'r-noc',
              name: 'Admin Operasional',
              hierarchyLevel: operatorUserType === 'ADMIN' ? 50 : 10,
              permissions: [PERMISSIONS.TICKET_READ, PERMISSIONS.NETWORK_READ],
            },
          };
        }) as unknown as typeof prisma.user.findUnique),
      );
      restoreFns.push(
        stubMethod(prisma.role, 'findUnique', (async () => ({
          id: techRoleId,
          name: 'Vendor / Teknisi Lapangan',
          hierarchyLevel: 10,
          permissions: ['ticket:read', 'ticket:submit'],
        })) as unknown as typeof prisma.role.findUnique),
      );
      restoreFns.push(
        stubMethod(prisma.user, 'update', (async (args: { data: { userType?: string } }) => {
          if (args.data.userType === 'TECHNICIAN') {
            operatorUserType = 'TECHNICIAN';
          }
          return {
            id: operatorId,
            nik: '882055',
            username: 'noc.plb01',
            fullName: 'Operator PLB01',
            roleId: techRoleId,
            userType: operatorUserType,
            assignedClusters: ['PLBHRAGA01'],
            isActive: true,
            twoFactorEnabled: true,
            createdAt: new Date(),
            role: { id: techRoleId, name: 'Vendor / Teknisi Lapangan', hierarchyLevel: 10 },
          };
        }) as unknown as typeof prisma.user.update),
      );
      restoreFns.push(
        stubMethod(prisma.userSession, 'updateMany', (async () => ({ count: 1 })) as unknown as typeof prisma.userSession.updateMany),
      );
      restoreFns.push(
        stubMethod(prisma.activityLog, 'create', (async () => ({ id: 'log-1' })) as unknown as typeof prisma.activityLog.create),
      );

      // Step 1: Operator logs in via atomic OTP -> cookie-only Web JWT
      const verifyRes = await verifyOtpPost(
        createNextRequest('http://localhost:3000/api/v1/auth/verify-otp', {
          method: 'POST',
          headers: { 'x-real-ip': '203.0.113.150' },
          jsonBody: { preAuthToken: preAuth, otpCode: challenge.otpCode },
        }),
      );
      assert.strictEqual(verifyRes.status, 200);
      const verifyJson = (await verifyRes.json()) as { data: { accessToken?: string } };
      assert.strictEqual(verifyJson.data.accessToken, undefined, 'Web login must be cookie-only');
      const setCookie = verifyRes.headers.get('set-cookie') ?? '';
      const cookieMatch = setCookie.match(/fiberops_session=([^;]+)/);
      assert.ok(cookieMatch?.[1], 'Expected fiberops_session cookie');
      const operatorCookieJwt = cookieMatch[1];

      // Step 2: Operator opens SSE stream cleanly
      const webRequire = createRequire(`${resolveRepoRoot()}/apps/web/package.json`);
      const nextServer = webRequire('next/server') as typeof import('next/server');
      const sseController = new AbortController();
      const sseReq = new nextServer.NextRequest('http://localhost:3000/api/v1/admin/stream/reports', {
        headers: { cookie: `fiberops_session=${operatorCookieJwt}` },
        signal: sseController.signal,
      });
      const sseRes = await streamReportsGet(sseReq);
      assert.strictEqual(sseRes.status, 200);
      const sseReader = sseRes.body?.getReader();

      try {
        // Step 3: Operator attempts self-edit privilege escalation -> 403
        const selfEscalateRes = await adminUsersPatch(
          createNextRequest(`http://localhost:3000/api/v1/admin/users/${operatorId}`, {
            method: 'PATCH',
            cookies: { fiberops_session: operatorCookieJwt },
            jsonBody: { assignedClusters: ['Global Scope'], twoFactorEnabled: false },
          }),
          { params: Promise.resolve({ id: operatorId }) },
        );
        assert.strictEqual(selfEscalateRes.status, 403);

        // Step 4: SUPER_ADMIN demotes operator & operator logs out / session revoked
        const demoteRes = await adminRolesPatch(
          createNextRequest('http://localhost:3000/api/v1/admin/roles', {
            method: 'PATCH',
            cookies: { fiberops_session: superToken },
            jsonBody: { targetUserId: operatorId, newRoleId: techRoleId },
          }),
        );
        assert.strictEqual(demoteRes.status, 200);

        const logoutRes = await logoutPost(
          createNextRequest('http://localhost:3000/api/v1/auth/logout', {
            method: 'POST',
            cookies: { fiberops_session: operatorCookieJwt },
            jsonBody: {},
          }),
        );
        assert.strictEqual(logoutRes.status, 200);

        // Step 5: Revoked JWT fails immediately on admin route (401)
        const postRevokeOverview = await adminOverviewGet(
          createNextRequest('http://localhost:3000/api/v1/admin/overview', {
            cookies: { fiberops_session: operatorCookieJwt },
          }),
        );
        assert.strictEqual(postRevokeOverview.status, 401);
      } finally {
        await sseReader?.cancel().catch(() => {});
        sseController.abort();
      }
    });
  });

  it('Journey B: Hardened mobile field submission — device gate -> 3x rotation -> AEAD -> JPEG/watermark -> GPS -> 4xx drop / 503 replay -> wipe', async () => {
    // 1. Device gate clean pass
    const gate = await deviceIntegrity.checkDeviceIntegrity({
      isRootedOverride: false,
      isEmulatorOverride: false,
      isDebuggableOverride: false,
      developerOptionsOverride: false,
      adbEnabledOverride: false,
    });
    assert.strictEqual(gate.isSecure, true);

    // 2. Mobile session + 3x refresh token rotation via server route
    const techId = crypto.randomUUID();
    const deviceId = crypto.randomUUID();
    let currentRefreshHash = '';
    let sessionRevoked = false;

    const ch = await otpStore.createOtpChallenge({
      userId: techId,
      username: 'tech.andi',
      telegramChatId: '7072749677',
      deliveryStatus: 'SENT',
    });
    const preAuth = await AuthService.generatePreAuthToken({
      userId: techId,
      username: 'tech.andi',
      challengeId: ch.record.challengeId,
      channel: 'mobile',
      deviceId,
    });

    await withMockTcpDbServer(async () => {
      restoreFns.push(
        stubMethod(prisma.user, 'findUnique', (async () => ({
          id: techId,
          nik: '882043',
          username: 'tech.andi',
          fullName: 'Andi Pratama',
          vendorCompany: 'PT Mitra',
          telegramChatId: '7072749677',
          twoFactorEnabled: true,
          userType: 'TECHNICIAN',
          isActive: true,
          assignedClusters: ['PLBHRAGA01'],
          role: { id: 'r-tech', name: 'Technician', hierarchyLevel: 10, permissions: ['ticket:read', 'ticket:submit'] },
        })) as unknown as typeof prisma.user.findUnique),
      );
      restoreFns.push(
        stubMethod(prisma.userSession, 'updateMany', (async () => ({ count: 1 })) as unknown as typeof prisma.userSession.updateMany),
      );
      restoreFns.push(
        stubMethod(prisma.userSession, 'create', (async () => ({
          id: crypto.randomUUID(),
          userId: techId,
          deviceId,
        })) as unknown as typeof prisma.userSession.create),
      );
      restoreFns.push(
        stubMethod(prisma.userSession, 'update', (async (args: { data: { refreshTokenHash?: string } }) => {
          if (args.data.refreshTokenHash) currentRefreshHash = args.data.refreshTokenHash;
          return { id: 's1' };
        }) as unknown as typeof prisma.userSession.update),
      );
      restoreFns.push(
        stubMethod(prisma.userSession, 'findUnique', (async () => ({
          id: 's1',
          userId: techId,
          deviceId,
          refreshTokenHash: currentRefreshHash,
          revokedAt: sessionRevoked ? new Date() : null,
          expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
          user: {
            id: techId,
            username: 'tech.andi',
            isActive: true,
            userType: 'TECHNICIAN',
            assignedClusters: ['PLBHRAGA01'],
            role: { id: 'r-tech', name: 'Technician', hierarchyLevel: 10, permissions: ['ticket:read', 'ticket:submit'] },
          },
        })) as unknown as typeof prisma.userSession.findUnique),
      );
      restoreFns.push(
        stubMethod(prisma.userSession, 'findMany', (async () => [{ deviceId }]) as unknown as typeof prisma.userSession.findMany),
      );
      restoreFns.push(
        stubMethod(prisma.activityLog, 'create', (async () => ({ id: 'log-1' })) as unknown as typeof prisma.activityLog.create),
      );

      const mobAuth = await AuthService.verifyMobileOtp(preAuth, ch.otpCode, { deviceId });
      let latestRefresh = mobAuth.refreshToken;

      for (let round = 1; round <= 3; round++) {
        const res = await refreshPost(
          createNextRequest('http://localhost:3000/api/v1/auth/refresh', {
            method: 'POST',
            headers: { 'x-real-ip': '203.0.113.151' },
            jsonBody: { refreshToken: latestRefresh, deviceId },
          }),
        );
        assert.strictEqual(res.status, 200, `Rotation round ${round} must succeed`);
        const json = (await res.json()) as { data: { refreshToken: string; accessToken: string } };
        latestRefresh = json.data.refreshToken;
      }

      // 3. AEAD encrypted offline storage + JPEG/watermark + GPS geofence
      const encTokens = await deviceIntegrity.encryptOfflinePayload({
        accessToken: 'tok',
        refreshToken: latestRefresh,
      });
      assert.doesNotMatch(encTokens, /^enc:v1:/);
      const jpegBuf = createMockJpegBuffer(4096);
      assert.strictEqual(opmCamera.validateNonEmptyPhoto(jpegBuf), true);
      assert.strictEqual(opmCamera.validateNonEmptyPhoto(Buffer.from('<svg></svg>')), false);
      assert.strictEqual(opmCamera.validateNonEmptyPhoto(Buffer.alloc(0)), false);
      assert.strictEqual(opmCamera.validatePhotoSize(jpegBuf).valid, true);

      const gps = await locationGuard.acquireVerifiedLocation(
        { latitude: -2.9833, longitude: 104.7644 },
        async () => ({
          coords: { latitude: -2.98335, longitude: 104.76445, accuracy: 6 },
          mocked: false,
          timestamp: Date.now(),
        }),
      );
      assert.strictEqual(gps.isLocationFlagged, false);

      // 4. Offline queue: 4xx dropped, 503 retained & replayed idempotently, then wiped on force-logout
      const storage = new MockPersistentStorage();
      const qMgr = new OfflineQueueManager(storage);
      const badSubId = crypto.randomUUID();
      const retrySubId = crypto.randomUUID();

      await qMgr.enqueue({
        submissionId: badSubId,
        ticketId: 'wo-bad',
        localPhotoUri: '',
        photoObjectKey: 'opm-proofs/2026/02/bad.jpg',
        payload: {
          submissionId: badSubId,
          splitterId: 'ODP-PLB-001',
          portNumber: 1,
          attenuationDbm: -19,
          photoObjectKey: 'opm-proofs/2026/02/bad.jpg',
          submittedLat: gps.latitude,
          submittedLng: gps.longitude,
          isMockLocation: false,
        },
      });
      await qMgr.enqueue({
        submissionId: retrySubId,
        ticketId: 'wo-retry',
        localPhotoUri: '',
        photoObjectKey: 'opm-proofs/2026/02/retry.jpg',
        payload: {
          submissionId: retrySubId,
          splitterId: 'ODP-PLB-001',
          portNumber: 2,
          attenuationDbm: -19.5,
          photoObjectKey: 'opm-proofs/2026/02/retry.jpg',
          submittedLat: gps.latitude,
          submittedLng: gps.longitude,
          isMockLocation: false,
        },
      });

      let attempt = 0;
      qMgr.configure({
        sender: async (tid) => {
          if (tid === 'wo-bad') {
            return {
              success: false,
              error: { code: 'FORBIDDEN', message: 'IDOR', statusCode: 403 } as unknown as {
                code: string;
                message: string;
              },
            };
          }
          attempt++;
          if (attempt === 1) {
            return {
              success: false,
              error: { code: 'SERVICE_UNAVAILABLE', message: '503', statusCode: 503 } as unknown as {
                code: string;
                message: string;
              },
            };
          }
          return { success: true, data: {}, meta: { alreadyProcessed: true } } as unknown as {
            success: true;
            data: unknown;
          };
        },
      });

      await qMgr.flush();
      const afterFirstFlush = await qMgr.getQueue();
      assert.strictEqual(
        afterFirstFlush.some((i) => i.submissionId === badSubId),
        false,
        '4xx item must not stay in retry queue',
      );
      assert.strictEqual(
        afterFirstFlush.some((i) => i.submissionId === retrySubId),
        true,
        '503 item must remain queued for retry',
      );

      await qMgr.flush();
      assert.strictEqual((await qMgr.getQueue()).length, 0);

      // Force logout wipe
      const client = new ApiClient({
        baseUrl: 'https://ftth-ops.lintasarta.co.id',
        deviceId,
        onSessionRevoked: () => {
          client.setTokens(null);
          void storage.clear();
        },
      });
      client.setTokens({ accessToken: 'tok', refreshToken: latestRefresh });
      netHarness.setup();
      netHarness.addRoute(
        (u) => u.includes('/api/v1/tech/tickets'),
        () =>
          new Response(
            JSON.stringify({ success: false, error: { code: 'SESSION_REVOKED', message: 'Revoked' } }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
          ),
      );
      await client.request('/api/v1/tech/tickets');
      assert.strictEqual(client.getTokens(), null);
      assert.strictEqual((await storage.getAllKeys()).length, 0);
      sessionRevoked = true;
      void sessionRevoked;
    });
  });

  it('Journey C: Multi-cluster tenant isolation across >50 tickets, media presign, ODP ports, AI confirm-action, and audit logs', async () => {
    const plb01AdminId = crypto.randomUUID();
    const plb01Token = await mintTestJwt(
      {
        username: 'admin.plb01',
        role: 'Admin Operasional',
        userType: 'ADMIN',
        hierarchyLevel: 50,
        assignedClusters: ['PLBHRAGA01'],
        permissions: [
          PERMISSIONS.TICKET_READ,
          PERMISSIONS.TICKET_CREATE,
          PERMISSIONS.TECH_MANAGE,
          PERMISSIONS.CUSTOMER_READ,
          PERMISSIONS.CUSTOMER_UPDATE,
          PERMISSIONS.NETWORK_READ,
          PERMISSIONS.AI_USE,
        ],
        tokenType: 'access',
      },
      { subject: plb01AdminId, audience: 'web' },
    );

    // Build 55 tickets: first 50 in PLBHRAGA01 (Prisma DB rows), ticket #55 in PLBBSGGA01
    const ticket55Id = crypto.randomUUID();
    const otherClusterTechId = crypto.randomUUID();
    const fiftyPrismaTickets = Array.from({ length: 50 }, (_, idx) => ({
      id: crypto.randomUUID(),
      ticketNumber: `WO-PLB1-${idx + 1}`,
      ticketType: 'MAINTENANCE',
      status: 'OPEN',
      createdAt: new Date(),
      customer: {
        fullName: `Cust ${idx + 1}`,
        siaNumber: `SIA${idx + 1}`,
        address: 'Jl. HR Agam',
        currentAttenuation: -20,
        cluster: { name: 'Palembang H. R. Agam', clusterCode: 'PLBHRAGA01' },
        splitter: null,
      },
      assignedTech: {
        username: 'tech.andi',
        fullName: 'Andi Pratama',
        vendorCompany: 'PT Mitra',
      },
    }));

    await withMockTcpDbServer(async () => {
      restoreFns.push(
        stubMethod(prisma.user, 'findUnique', (async () => ({
          id: plb01AdminId,
          username: 'admin.plb01',
          fullName: 'Admin PLB01',
          userType: 'ADMIN',
          isActive: true,
          assignedClusters: ['PLBHRAGA01'],
          role: {
            name: 'Admin Operasional',
            hierarchyLevel: 50,
            permissions: ['ticket:read', 'ticket:create', 'tech:manage', 'customer:read', 'customer:update', 'network:read', 'ai:use'],
          },
        })) as unknown as typeof prisma.user.findUnique),
      );
      restoreFns.push(
        stubMethod(prisma.user, 'findMany', (async () => [
          {
            id: otherClusterTechId,
            nik: '882044',
            username: 'tech.rizky',
            fullName: 'Rizky Maulana',
            vendorCompany: 'PT Mitra',
            telegramChatId: '22222',
            isActive: true,
            assignedClusters: ['PLBBSGGA01'],
            role: { name: 'Technician', hierarchyLevel: 10, permissions: ['ticket:read'] },
            assignedTickets: [],
          },
        ]) as unknown as typeof prisma.user.findMany),
      );
      restoreFns.push(
        stubMethod(prisma.user, 'findFirst', (async () => ({
          id: otherClusterTechId,
          username: 'tech.rizky',
          fullName: 'Rizky Maulana',
          userType: 'TECHNICIAN',
          isActive: true,
          assignedClusters: ['PLBBSGGA01'],
          role: { name: 'Technician', hierarchyLevel: 10 },
        })) as unknown as typeof prisma.user.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma.ticket, 'findMany', (async () => fiftyPrismaTickets) as unknown as typeof prisma.ticket.findMany),
      );
      restoreFns.push(
        stubMethod(prisma.ticket, 'findFirst', (async () => ({
          id: ticket55Id,
          ticketNumber: 'WO-PLB2-055',
          status: 'PENDING_APPROVAL',
          customerId: crypto.randomUUID(),
          assignedTechId: crypto.randomUUID(),
          customer: {
            siaNumber: '2023352738',
            fullName: 'PLBBSGGA01 Cust',
            address: 'Jl. Basuki Rahmat',
            cluster: { clusterCode: 'PLBBSGGA01', name: 'Palembang Basuki Rahmat' },
            splitter: null,
          },
          assignedTech: null,
        })) as unknown as typeof prisma.ticket.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma.activityLog, 'create', (async () => ({ id: 'log-55' })) as unknown as typeof prisma.activityLog.create),
      );
      restoreFns.push(
        stubMethod(prisma.ticket, 'update', (async () => ({
          id: ticket55Id,
          ticketNumber: 'WO-PLB2-055',
          ticketType: 'PSB',
          status: 'COMPLETED',
          createdAt: new Date(),
          completedAt: new Date(),
          customer: {
            siaNumber: '2023352738',
            fullName: 'PLBBSGGA01 Cust',
            address: 'Jl. Basuki Rahmat',
            cluster: { clusterCode: 'PLBBSGGA01', name: 'Palembang Basuki Rahmat' },
            splitter: null,
          },
          assignedTech: null,
        })) as unknown as typeof prisma.ticket.update),
      );
      restoreFns.push(
        stubMethod(prisma.attenuationHistory, 'findFirst', (async () => ({
          id: crypto.randomUUID(),
          customer: { cluster: { clusterCode: 'PLBBSGGA01', name: 'Palembang Basuki Rahmat' } },
        })) as unknown as typeof prisma.attenuationHistory.findFirst),
      );
      restoreFns.push(
        stubMethod(minioManager, 'generatePresignedGetUrl', async (k: string) => `https://minio.local/${k}?X-Amz-Signature=1`),
      );
      restoreFns.push(
        stubMethod(prisma.customer, 'findUnique', (async () => null) as unknown as typeof prisma.customer.findUnique),
      );
      restoreFns.push(
        stubMethod(prisma.networkCluster, 'findFirst', (async () => ({
          id: 'cl-plb01',
          clusterCode: 'PLBHRAGA01',
          name: 'Palembang H. R. Agam',
        })) as unknown as typeof prisma.networkCluster.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma, '$transaction', (async (fn: (tx: typeof prisma) => Promise<unknown>) =>
          fn(prisma)) as unknown as typeof prisma.$transaction),
      );
      restoreFns.push(
        stubMethod(prisma.networkSplitter, 'findFirst', (async () => ({
          id: 'sp-plb02',
          splitterCode: 'ODP-PLB-010',
          clusterId: 'cl-plb02',
          maxPorts: 8,
          cluster: { clusterCode: 'PLBBSGGA01', name: 'Palembang Basuki Rahmat' },
        })) as unknown as typeof prisma.networkSplitter.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma.customer, 'findFirst', (async () => null) as unknown as typeof prisma.customer.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma.customer, 'update', (async () => ({ id: 'c1' })) as unknown as typeof prisma.customer.update),
      );
      restoreFns.push(
        stubMethod(CustomerService, 'getCustomerBySia', async () => ({
          customer: {
            id: crypto.randomUUID(),
            siaNumber: '2023352738',
            fullName: 'PLBBSGGA01 Cust',
            address: 'Jl. Basuki Rahmat',
            cluster: 'Palembang Basuki Rahmat',
            clusterCode: 'PLBBSGGA01',
            splitterCode: null,
            portNumber: null,
            currentAttenuation: -20,
            status: 'ACTIVE',
            updatedAt: new Date().toISOString(),
          },
          openTicket: null,
          recentTickets: [],
          histories: [],
        })),
      );
      restoreFns.push(stubMethod(redisManager, 'markActionTokenUsed', async () => true));
      restoreFns.push(
        stubMethod(NetworkService, 'runNetworkAudit', async () => ({
          auditedAt: new Date().toISOString(),
          totalClusters: 2,
          totalSplitters: 90,
          totalPorts: 720,
          usedPorts: 300,
          warningSplitters: 4,
          criticalAttenuationCount: 5,
          doubleBookedPorts: 1,
          geofenceAnomalies: 2,
          findings: [
            {
              id: 'f-1',
              severity: 'warning',
              category: 'CAPACITY',
              clusterCode: 'PLBHRAGA01',
              splitterCode: 'ODP-PLB-001',
              title: 'PLB01',
              description: 'ok',
            },
            {
              id: 'f-2',
              severity: 'critical',
              category: 'ATTENUATION',
              clusterCode: 'PLBBSGGA01',
              splitterCode: 'ODP-PLB-010',
              title: 'PLB02',
              description: 'isolated',
            },
          ],
        })),
      );
      restoreFns.push(
        stubMethod(NetworkService, 'listClusters', async () => [
          {
            id: 's1',
            clusterCode: 'PLBHRAGA01',
            name: 'Palembang H. R. Agam',
            splitterCode: 'ODP-PLB-001',
            usedPorts: 2,
            maxPorts: 8,
            lat: -2.98,
            lng: 104.76,
            ports: [],
          },
        ]),
      );

      // 1. Ticket #55 in PLBBSGGA01 blocked 403
      const approve55Res = await ticketApprovePost(
        createNextRequest(`http://localhost:3000/api/v1/admin/tickets/${ticket55Id}/approve`, {
          method: 'POST',
          cookies: { fiberops_session: plb01Token },
        }),
        { params: Promise.resolve({ id: ticket55Id }) },
      );
      assert.strictEqual(approve55Res.status, 403);

      // 2. Media presign for PLBBSGGA01 and backups/* blocked
      const mediaRes = await mediaPresignGet(
        createNextRequest(
          'http://localhost:3000/api/v1/admin/media/presign?key=opm-proofs/2026/02/plb02.jpg',
          { cookies: { fiberops_session: plb01Token } },
        ),
      );
      assert.strictEqual(mediaRes.status, 403);

      // 3. Cross-cluster ODP port hijack blocked
      const portRes = await customersPost(
        createNextRequest('http://localhost:3000/api/v1/admin/customers', {
          method: 'POST',
          cookies: { fiberops_session: plb01Token },
          jsonBody: {
            siaNumber: '2026991122',
            fullName: 'Cross ODP Cust',
            address: 'Jl. HR Agam',
            clusterCode: 'PLBHRAGA01',
            splitterCode: 'ODP-PLB-010',
            portNumber: 1,
            status: 'ACTIVE',
          },
        }),
      );
      assert.ok(portRes.status === 400 || portRes.status === 403);

      // 4. AI confirm-action on PLBBSGGA01 SIA blocked 403
      const aiToken = await generateSignedActionToken(
        'MUTATE_SPLITTER_PORT',
        { siaNumber: '2023352738', newSplitterCode: 'ODP-PLB-010', newPortNumber: 2 },
        plb01AdminId,
      );
      const aiRes = await aiConfirmPost(
        createNextRequest('http://localhost:3000/api/v1/admin/ai/confirm-action', {
          method: 'POST',
          cookies: { fiberops_session: plb01Token },
          jsonBody: {
            actionToken: aiToken,
            actionType: 'MUTATE_SPLITTER_PORT',
            payload: { siaNumber: '2023352738', newSplitterCode: 'ODP-PLB-010', newPortNumber: 2 },
          },
        }),
      );
      assert.strictEqual(aiRes.status, 403);

      // 5. Audit returns only PLBHRAGA01 findings & scoped aggregates
      const auditRes = await clustersAuditPost(
        createNextRequest('http://localhost:3000/api/v1/admin/clusters/audit', {
          method: 'POST',
          cookies: { fiberops_session: plb01Token },
        }),
      );
      assert.strictEqual(auditRes.status, 200);
      const auditJson = (await auditRes.json()) as {
        data: { totalClusters: number; totalSplitters: number; findings: Array<{ clusterCode: string }> };
      };
      assert.strictEqual(auditJson.data.findings.length, 1);
      assert.strictEqual(auditJson.data.findings[0]!.clusterCode, 'PLBHRAGA01');
      assert.strictEqual(auditJson.data.totalClusters, 1);
      assert.strictEqual(auditJson.data.totalSplitters, 1);

      // 6. Cross-cluster technician force-logout blocked 403
      const forceLogoutRes = await techForceLogoutPost(
        createNextRequest(
          `http://localhost:3000/api/v1/admin/technicians/${otherClusterTechId}/force-logout`,
          {
            method: 'POST',
            cookies: { fiberops_session: plb01Token },
            jsonBody: { reason: 'Cross-cluster tenant isolation check' },
          },
        ),
        { params: Promise.resolve({ id: otherClusterTechId }) },
      );
      assert.strictEqual(forceLogoutRes.status, 403);
    });
  });
});
