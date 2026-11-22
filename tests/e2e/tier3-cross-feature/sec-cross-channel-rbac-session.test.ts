import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PERMISSIONS } from '@repo/shared';
import {
  configureOfflineTestEnv,
  closeServerHandles,
  restoreTestEnv,
  mintTestJwt,
  createNextRequest,
  createTelegramCaptureFetch,
  resolveRepoRoot,
  stubMethod,
  OFFLINE_DATABASE_URL,
  TEST_TELEGRAM_WEBHOOK_SECRET,
} from '../helpers/auth-test-harness';
import { MockNetworkHarness } from '../helpers/mock-api';
import { MockPersistentStorage } from '../helpers/mock-storage';
import { createMockJpegBuffer } from '../helpers/test-fixtures';

let AuthService: typeof import('@/server/services/auth.service').AuthService;
let otpStore: typeof import('@/server/lib/otp-store');
let telegramLib: typeof import('@/server/lib/telegram');
let minioManager: typeof import('@/server/lib/minio').minioManager;
let redisManager: typeof import('@/server/lib/redis').redisManager;
let generateSignedActionToken: typeof import('@/server/services/ai.service').generateSignedActionToken;
let CustomerService: typeof import('@/server/services/customer.service').CustomerService;
let NetworkService: typeof import('@/server/services/network.service').NetworkService;
let prisma: typeof import('@repo/database').prisma;
let resetDatabaseHealthCache: typeof import('@repo/database').resetDatabaseHealthCache;

let verifyOtpPost: typeof import('@/app/api/v1/auth/verify-otp/route').POST;
let refreshPost: typeof import('@/app/api/v1/auth/refresh/route').POST;
let adminTicketsGet: typeof import('@/app/api/v1/admin/tickets/route').GET;
let ticketApprovePost: typeof import('@/app/api/v1/admin/tickets/[id]/approve/route').POST;
let mediaPresignGet: typeof import('@/app/api/v1/admin/media/presign/route').GET;
let aiConfirmPost: typeof import('@/app/api/v1/admin/ai/confirm-action/route').POST;
let clustersAuditPost: typeof import('@/app/api/v1/admin/clusters/audit/route').POST;
let techForceLogoutPost: typeof import('@/app/api/v1/admin/technicians/[id]/force-logout/route').POST;
let telegramWebhookPost: typeof import('@/app/api/v1/telegram/webhook/route').POST;

let ApiClient: typeof import('../../../apps/mobile/src/api/client').ApiClient;
let deviceIntegrity: typeof import('../../../apps/mobile/src/security/deviceIntegrity');
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

describe('Tier 3 Cross-Feature: Web/Mobile Channel Isolation, RBAC Scoping, Session Revocation, Telegram & Gate', () => {
  const repoRoot = resolveRepoRoot();
  const restoreFns: Array<() => void> = [];
  let netHarness: MockNetworkHarness;

  before(async () => {
    configureOfflineTestEnv();
    netHarness = new MockNetworkHarness();
    const [
      authMod,
      otpMod,
      tgMod,
      minioMod,
      redisMod,
      aiMod,
      custMod,
      netMod,
      dbMod,
      verifyRoute,
      refreshRoute,
      ticketsRoute,
      approveRoute,
      presignRoute,
      confirmRoute,
      auditRoute,
      forceLogoutRoute,
      tgRoute,
      clientMod,
      diMod,
      oqMod,
    ] = await Promise.all([
      import('@/server/services/auth.service'),
      import('@/server/lib/otp-store'),
      import('@/server/lib/telegram'),
      import('@/server/lib/minio'),
      import('@/server/lib/redis'),
      import('@/server/services/ai.service'),
      import('@/server/services/customer.service'),
      import('@/server/services/network.service'),
      import('@repo/database'),
      import('@/app/api/v1/auth/verify-otp/route'),
      import('@/app/api/v1/auth/refresh/route'),
      import('@/app/api/v1/admin/tickets/route'),
      import('@/app/api/v1/admin/tickets/[id]/approve/route'),
      import('@/app/api/v1/admin/media/presign/route'),
      import('@/app/api/v1/admin/ai/confirm-action/route'),
      import('@/app/api/v1/admin/clusters/audit/route'),
      import('@/app/api/v1/admin/technicians/[id]/force-logout/route'),
      import('@/app/api/v1/telegram/webhook/route'),
      import('../../../apps/mobile/src/api/client'),
      import('../../../apps/mobile/src/security/deviceIntegrity'),
      import('../../../apps/mobile/src/sync/offlineQueue'),
    ]);

    AuthService = authMod.AuthService;
    otpStore = otpMod;
    telegramLib = tgMod;
    minioManager = minioMod.minioManager;
    redisManager = redisMod.redisManager;
    generateSignedActionToken = aiMod.generateSignedActionToken;
    CustomerService = custMod.CustomerService;
    NetworkService = netMod.NetworkService;
    prisma = dbMod.prisma;
    resetDatabaseHealthCache = dbMod.resetDatabaseHealthCache;

    verifyOtpPost = verifyRoute.POST;
    refreshPost = refreshRoute.POST;
    adminTicketsGet = ticketsRoute.GET;
    ticketApprovePost = approveRoute.POST;
    mediaPresignGet = presignRoute.GET;
    aiConfirmPost = confirmRoute.POST;
    clustersAuditPost = auditRoute.POST;
    techForceLogoutPost = forceLogoutRoute.POST;
    telegramWebhookPost = tgRoute.POST;

    ApiClient = clientMod.ApiClient;
    deviceIntegrity = diMod;
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

  it('Web Cookie vs Mobile Bearer channel isolation across verify-otp, refresh, and admin routes', async () => {
    const adminId = crypto.randomUUID();
    const techId = crypto.randomUUID();
    const deviceId = crypto.randomUUID();

    const webCh = await otpStore.createOtpChallenge({
      userId: adminId,
      username: 'admin.plb01',
      telegramChatId: '111111',
      deliveryStatus: 'SENT',
    });
    const webPre = await AuthService.generatePreAuthToken({
      userId: adminId,
      username: 'admin.plb01',
      challengeId: webCh.record.challengeId,
      channel: 'web',
    });

    const mobCh = await otpStore.createOtpChallenge({
      userId: techId,
      username: 'tech.andi',
      telegramChatId: '222222',
      deliveryStatus: 'SENT',
    });
    const mobPre = await AuthService.generatePreAuthToken({
      userId: techId,
      username: 'tech.andi',
      challengeId: mobCh.record.challengeId,
      channel: 'mobile',
      deviceId,
    });

    await withMockTcpDbServer(async () => {
      restoreFns.push(
        stubMethod(prisma.user, 'findUnique', (async (args: { where: { id?: string } }) => {
          if (args.where.id === adminId) {
            return {
              id: adminId,
              nik: '882042',
              username: 'admin.plb01',
              fullName: 'Admin PLB01',
              userType: 'ADMIN',
              isActive: true,
              assignedClusters: ['PLBHRAGA01'],
              role: { id: 'r-admin', name: 'Admin Operasional', hierarchyLevel: 50, permissions: [PERMISSIONS.TICKET_READ] },
            };
          }
          return {
            id: techId,
            nik: '882043',
            username: 'tech.andi',
            fullName: 'Andi Pratama',
            userType: 'TECHNICIAN',
            isActive: true,
            assignedClusters: ['PLBHRAGA01'],
            role: { id: 'r-tech', name: 'Technician', hierarchyLevel: 10, permissions: ['ticket:read', 'ticket:submit'] },
          };
        }) as unknown as typeof prisma.user.findUnique),
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
        stubMethod(prisma.userSession, 'update', (async () => ({ id: 's1' })) as unknown as typeof prisma.userSession.update),
      );
      restoreFns.push(
        stubMethod(prisma.activityLog, 'create', (async () => ({ id: 'log-1' })) as unknown as typeof prisma.activityLog.create),
      );

      // 1. Web channel: cookie set, accessToken omitted from JSON
      const webRes = await verifyOtpPost(
        createNextRequest('http://localhost:3000/api/v1/auth/verify-otp', {
          method: 'POST',
          headers: { 'x-real-ip': '203.0.113.101' },
          jsonBody: { preAuthToken: webPre, otpCode: webCh.otpCode },
        }),
      );
      assert.strictEqual(webRes.status, 200);
      assert.match(webRes.headers.get('set-cookie') ?? '', /fiberops_session=.*;.*HttpOnly/i);
      const webJson = (await webRes.json()) as { data: { accessToken?: string } };
      assert.strictEqual(webJson.data.accessToken, undefined);

      // 2. Mobile channel: JSON tokens returned, no fiberops_session cookie set
      const mobRes = await verifyOtpPost(
        createNextRequest('http://localhost:3000/api/v1/auth/verify-otp', {
          method: 'POST',
          headers: { 'x-real-ip': '203.0.113.102' },
          jsonBody: { preAuthToken: mobPre, otpCode: mobCh.otpCode, deviceId },
        }),
      );
      assert.strictEqual(mobRes.status, 200);
      assert.strictEqual((mobRes.headers.get('set-cookie') ?? '').includes('fiberops_session='), false);
      const mobJson = (await mobRes.json()) as { data: { accessToken: string; refreshToken: string } };
      assert.ok(mobJson.data.accessToken && mobJson.data.refreshToken);

      // 3. Mobile Bearer accessToken rejected on Admin API (403) and on /auth/refresh (401)
      const adminWithTechRes = await adminTicketsGet(
        createNextRequest('http://localhost:3000/api/v1/admin/tickets', {
          headers: { authorization: `Bearer ${mobJson.data.accessToken}` },
        }),
      );
      assert.strictEqual(adminWithTechRes.status, 403);

      const refreshWithAccessRes = await refreshPost(
        createNextRequest('http://localhost:3000/api/v1/auth/refresh', {
          method: 'POST',
          headers: { 'x-real-ip': '203.0.113.103' },
          jsonBody: { refreshToken: mobJson.data.accessToken, deviceId },
        }),
      );
      assert.strictEqual(refreshWithAccessRes.status, 401);
    });
  });

  it('RBAC + cluster isolation enforced consistently across tickets, approval, media presign, AI confirm-action, and network audit', async () => {
    const adminId = crypto.randomUUID();
    const adminToken = await mintTestJwt(
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
      { subject: adminId, audience: 'web' },
    );

    const otherTicketId = crypto.randomUUID();
    const otherClusterTechId = crypto.randomUUID();
    await withMockTcpDbServer(async () => {
      restoreFns.push(
        stubMethod(prisma.user, 'findUnique', (async () => ({
          id: adminId,
          username: 'admin.plb01',
          fullName: 'Admin PLB01',
          userType: 'ADMIN',
          isActive: true,
          assignedClusters: ['PLBHRAGA01'],
          role: {
            name: 'Admin Operasional',
            hierarchyLevel: 50,
            permissions: [
              PERMISSIONS.TICKET_READ,
              PERMISSIONS.TICKET_CREATE,
              PERMISSIONS.TECH_MANAGE,
              PERMISSIONS.CUSTOMER_READ,
              PERMISSIONS.CUSTOMER_UPDATE,
              PERMISSIONS.NETWORK_READ,
              PERMISSIONS.AI_USE,
            ],
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
        stubMethod(prisma.ticket, 'findMany', (async () => []) as unknown as typeof prisma.ticket.findMany),
      );
      restoreFns.push(
        stubMethod(prisma.ticket, 'findFirst', (async () => ({
          id: otherTicketId,
          ticketNumber: 'WO-OTHER-01',
          status: 'PENDING_APPROVAL',
          customerId: crypto.randomUUID(),
          assignedTechId: crypto.randomUUID(),
          customer: {
            siaNumber: '2023352738',
            fullName: 'Other Cust',
            address: 'Jl. Basuki Rahmat',
            cluster: { clusterCode: 'PLBBSGGA01', name: 'Palembang Basuki Rahmat' },
            splitter: null,
          },
          assignedTech: null,
        })) as unknown as typeof prisma.ticket.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma, '$transaction', (async (fn: (tx: typeof prisma) => Promise<unknown>) =>
          fn(prisma)) as unknown as typeof prisma.$transaction),
      );
      restoreFns.push(
        stubMethod(prisma.networkSplitter, 'findFirst', (async () => null) as unknown as typeof prisma.networkSplitter.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma.activityLog, 'create', (async () => ({ id: 'log-1' })) as unknown as typeof prisma.activityLog.create),
      );
      restoreFns.push(
        stubMethod(prisma.ticket, 'update', (async () => ({
          id: otherTicketId,
          ticketNumber: 'WO-OTHER-01',
          ticketType: 'PSB',
          status: 'COMPLETED',
          createdAt: new Date(),
          completedAt: new Date(),
          customer: {
            siaNumber: '2023352738',
            fullName: 'Other Cust',
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
        stubMethod(CustomerService, 'getCustomerBySia', async () => ({
          customer: {
            id: crypto.randomUUID(),
            siaNumber: '2023352738',
            fullName: 'Other Cust',
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
          totalSplitters: 10,
          totalPorts: 80,
          usedPorts: 20,
          warningSplitters: 0,
          criticalAttenuationCount: 0,
          doubleBookedPorts: 0,
          geofenceAnomalies: 0,
          findings: [
            {
              id: 'f-other',
              severity: 'critical',
              category: 'ATTENUATION',
              clusterCode: 'PLBBSGGA01',
              splitterCode: 'ODP-PLB-010',
              title: 'Out-of-cluster',
              description: 'Desc',
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
            usedPorts: 1,
            maxPorts: 8,
            lat: -2.98,
            lng: 104.76,
            ports: [],
          },
        ]),
      );

      const approveRes = await ticketApprovePost(
        createNextRequest(`http://localhost:3000/api/v1/admin/tickets/${otherTicketId}/approve`, {
          method: 'POST',
          cookies: { fiberops_session: adminToken },
        }),
        { params: Promise.resolve({ id: otherTicketId }) },
      );
      assert.strictEqual(approveRes.status, 403);

      const presignRes = await mediaPresignGet(
        createNextRequest(
          'http://localhost:3000/api/v1/admin/media/presign?key=opm-proofs/2026/02/other.jpg',
          { cookies: { fiberops_session: adminToken } },
        ),
      );
      assert.strictEqual(presignRes.status, 403);

      const actionToken = await generateSignedActionToken(
        'MUTATE_SPLITTER_PORT',
        { siaNumber: '2023352738', newSplitterCode: 'ODP-PLB-010', newPortNumber: 1 },
        adminId,
      );
      const confirmRes = await aiConfirmPost(
        createNextRequest('http://localhost:3000/api/v1/admin/ai/confirm-action', {
          method: 'POST',
          cookies: { fiberops_session: adminToken },
          jsonBody: {
            actionToken,
            actionType: 'MUTATE_SPLITTER_PORT',
            payload: { siaNumber: '2023352738', newSplitterCode: 'ODP-PLB-010', newPortNumber: 1 },
          },
        }),
      );
      assert.strictEqual(confirmRes.status, 403);

      const auditRes = await clustersAuditPost(
        createNextRequest('http://localhost:3000/api/v1/admin/clusters/audit', {
          method: 'POST',
          cookies: { fiberops_session: adminToken },
        }),
      );
      const auditJson = (await auditRes.json()) as {
        data: { totalSplitters: number; findings: unknown[] };
      };
      assert.strictEqual(auditJson.data.findings.length, 0);
      assert.strictEqual(auditJson.data.totalSplitters, 1);

      const crossForceLogoutRes = await techForceLogoutPost(
        createNextRequest(
          `http://localhost:3000/api/v1/admin/technicians/${otherClusterTechId}/force-logout`,
          {
            method: 'POST',
            cookies: { fiberops_session: adminToken },
            jsonBody: { reason: 'Cross-cluster RBAC test' },
          },
        ),
        { params: Promise.resolve({ id: otherClusterTechId }) },
      );
      assert.strictEqual(
        crossForceLogoutRes.status,
        403,
        `API-02: Cross-cluster force-logout must return 403, got ${crossForceLogoutRes.status}`,
      );
    });
  });

  it('Mobile session revocation across refresh rotation, uploadMultipart 401, and complete storage wipe', async () => {
    const storage = new MockPersistentStorage();
    const queue = new OfflineQueueManager(storage);
    const subId = crypto.randomUUID();
    await queue.enqueue({
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
        submittedLat: -2.9833,
        submittedLng: 104.7644,
        isMockLocation: false,
      },
    });
    assert.strictEqual((await queue.getQueue()).length, 1);

    let revokedReason: string | null = null;
    const client = new ApiClient({
      baseUrl: 'https://ftth-ops.lintasarta.co.id',
      deviceId: crypto.randomUUID(),
      onSessionRevoked: (reason) => {
        revokedReason = reason;
        client.setTokens(null);
        void storage.clear();
      },
    });
    client.setTokens({ accessToken: 'expired-access', refreshToken: 'valid-refresh-1' });

    netHarness.setup();
    let callIdx = 0;
    netHarness.addRoute(
      (u) => u.includes('/api/v1/tech/tickets') && !u.includes('/upload'),
      () => {
        callIdx++;
        if (callIdx === 1) {
          return new Response(
            JSON.stringify({ success: false, error: { code: 'TOKEN_EXPIRED', message: 'Expired' } }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify({ success: true, data: { tickets: [], splitters: [] } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    );
    netHarness.addRoute(
      (u) => u.includes('/api/v1/auth/refresh'),
      () =>
        new Response(
          JSON.stringify({
            success: true,
            data: { accessToken: 'fresh-access-2', refreshToken: 'fresh-refresh-2' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    netHarness.addRoute(
      (u) => u.includes('/api/v1/tech/tickets/wo-1/upload'),
      () =>
        new Response(
          JSON.stringify({
            success: false,
            error: { code: 'SESSION_REVOKED', message: 'Force logout by admin' },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    const ticketsRes = await client.request('/api/v1/tech/tickets');
    assert.strictEqual(ticketsRes.success, true);
    assert.strictEqual(client.getTokens()?.refreshToken, 'fresh-refresh-2');

    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(createMockJpegBuffer(1024))], { type: 'image/jpeg' }), 'a.jpg');
    await client.uploadMultipart('/api/v1/tech/tickets/wo-1/upload', fd);

    assert.ok(revokedReason, 'uploadMultipart 401 SESSION_REVOKED must invoke onSessionRevoked');
    assert.strictEqual(client.getTokens(), null);
    assert.strictEqual((await storage.getAllKeys()).length, 0);

    // MOB-03: In production, ApiClient rejects cleartext http:// and strips Bearer on cross-origin URLs
    const prevNodeEnv = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    try {
      assert.throws(
        () => new ApiClient({ baseUrl: 'http://evil.local', deviceId: crypto.randomUUID() }),
        'MOB-03: ApiClient constructor must reject http:// in production',
      );
      const prodClient = new ApiClient({
        baseUrl: 'https://ftth-ops.lintasarta.co.id',
        deviceId: crypto.randomUUID(),
      });
      prodClient.setTokens({ accessToken: 'mobile-secret-jwt', refreshToken: 'mobile-refresh' });
      await prodClient.request('https://attacker.example/leak-check', { method: 'GET' });
      const attackerCall = netHarness.getRequestLog().find((r) => r.url.includes('attacker.example/leak-check'));
      const sentHeaders = attackerCall?.headers as Record<string, string> | undefined;
      assert.strictEqual(sentHeaders?.Authorization || sentHeaders?.authorization, undefined);
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = prevNodeEnv;
    }
  });

  it('Telegram webhook auth + /lapor validation + HTML-escaped OTP notification integration', async () => {
    const tgFetch = createTelegramCaptureFetch();
    restoreFns.push(tgFetch.install());

    // 1. Unauthenticated /start <NIK> blocked from binding
    const unauthStartRes = await telegramWebhookPost(
      createNextRequest('http://localhost:3000/api/v1/telegram/webhook', {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': TEST_TELEGRAM_WEBHOOK_SECRET },
        jsonBody: {
          update_id: 2001,
          message: { message_id: 1, chat: { id: 555444333, type: 'private' }, text: '/start 882041' },
        },
      }),
    );
    const startJson = (await unauthStartRes.json()) as Record<string, unknown>;
    assert.notStrictEqual(startJson.action, 'bound_success');

    // 2. /lapor without GPS coordinates must be rejected (never fabricate coords)
    await withMockTcpDbServer(async () => {
      restoreFns.push(
        stubMethod(prisma.user, 'findFirst', (async () => ({
          id: crypto.randomUUID(),
          username: 'tech.andi',
          fullName: 'Andi Pratama',
          userType: 'TECHNICIAN',
          isActive: true,
          telegramChatId: '7072749677',
          assignedClusters: ['PLBHRAGA01'],
          role: { name: 'Technician', hierarchyLevel: 10, permissions: ['ticket:submit'] },
        })) as unknown as typeof prisma.user.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma.ticket, 'findFirst', (async () => ({
          id: crypto.randomUUID(),
          ticketNumber: 'WO-2025-0842',
          status: 'IN_PROGRESS',
          targetLat: -2.9833,
          targetLng: 104.7644,
          customer: {
            fullName: 'PT Test',
            siaNumber: '100245',
            splitter: { splitterCode: 'ODP-PLB-001', lat: -2.9833, lng: 104.7644 },
          },
        })) as unknown as typeof prisma.ticket.findFirst),
      );

      const laporNoGpsRes = await telegramWebhookPost(
        createNextRequest('http://localhost:3000/api/v1/telegram/webhook', {
          method: 'POST',
          headers: { 'x-telegram-bot-api-secret-token': TEST_TELEGRAM_WEBHOOK_SECRET },
          jsonBody: {
            update_id: 2002,
            message: {
              message_id: 2,
              chat: { id: 7072749677, type: 'private' },
              text: '/lapor WO-2025-0842 -19.2',
            },
          },
        }),
      );
      const laporJson = (await laporNoGpsRes.json()) as { ok?: boolean; action?: string };
      assert.notStrictEqual(
        laporJson.action,
        'lapor_submitted',
        'AUTH-13: Telegram /lapor without GPS location must NOT fabricate coordinates and submit',
      );
    });

    // 3. HTML-escaped OTP message
    await telegramLib.sendTelegramOtpMessage({
      chatId: '7072749677',
      otpCode: '112233',
      username: '<script>alert(1)</script>',
      fullName: 'Tech & <Admin>',
      clientIp: '1.2.3.4',
    });
    const lastMsg = tgFetch.capturedMessages[tgFetch.capturedMessages.length - 1]?.text ?? '';
    assert.doesNotMatch(lastMsg, /<script>alert\(1\)<\/script>/i);
  });

  it('Device gate foreground recheck + fail-closed boot + DevTools unmount contract', async () => {
    const clean = await deviceIntegrity.checkDeviceIntegrity({
      isRootedOverride: false,
      isEmulatorOverride: false,
      isDebuggableOverride: false,
      developerOptionsOverride: false,
      adbEnabledOverride: false,
    });
    assert.strictEqual(clean.isSecure, true);

    const compromised = await deviceIntegrity.checkDeviceIntegrity({
      isRootedOverride: false,
      isEmulatorOverride: false,
      isDebuggableOverride: true,
      developerOptionsOverride: false,
      adbEnabledOverride: false,
    });
    assert.strictEqual(compromised.isSecure, false);

    const appSrc = fs.readFileSync(path.join(repoRoot, 'apps', 'mobile', 'App.tsx'), 'utf8');
    assert.match(appSrc, /AppState|visibilitychange/);
    const loginViewSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'web', 'src', 'features', 'auth', 'components', 'login-view.tsx'),
      'utf8',
    );
    assert.doesNotMatch(loginViewSrc, /<article\s+className="auth-card"\s+aria-hidden=\{isDevToolsBlocked/);
  });
});
