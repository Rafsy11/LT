import { describe, it, before, after, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ERROR_CODES, PERMISSIONS, type UserSessionContext } from '@repo/shared';
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
import { createMockJpegBuffer } from '../helpers/test-fixtures';

let prisma: typeof import('@repo/database').prisma;
let resetDatabaseHealthCache: typeof import('@repo/database').resetDatabaseHealthCache;
let minioManager: typeof import('@/server/lib/minio').minioManager;
let redisManager: typeof import('@/server/lib/redis').redisManager;
let AiService: typeof import('@/server/services/ai.service').AiService;
let generateSignedActionToken: typeof import('@/server/services/ai.service').generateSignedActionToken;
let TicketService: typeof import('@/server/services/ticket.service').TicketService;
let TechnicianService: typeof import('@/server/services/technician.service').TechnicianService;
let CustomerService: typeof import('@/server/services/customer.service').CustomerService;
let NetworkService: typeof import('@/server/services/network.service').NetworkService;

let mediaPresignGet: typeof import('@/app/api/v1/admin/media/presign/route').GET;
let techTogglePost: typeof import('@/app/api/v1/admin/technicians/[id]/toggle/route').POST;
let techForceLogoutPost: typeof import('@/app/api/v1/admin/technicians/[id]/force-logout/route').POST;
let techTicketsGet: typeof import('@/app/api/v1/tech/tickets/route').GET;
let ticketApprovePost: typeof import('@/app/api/v1/admin/tickets/[id]/approve/route').POST;
let ticketRejectPost: typeof import('@/app/api/v1/admin/tickets/[id]/reject/route').POST;
let aiChatPost: typeof import('@/app/api/v1/admin/ai/chat/route').POST;
let aiConfirmPost: typeof import('@/app/api/v1/admin/ai/confirm-action/route').POST;
let networkImportPost: typeof import('@/app/api/v1/admin/network/import/route').POST;
let techUploadPost: typeof import('@/app/api/v1/tech/tickets/[id]/upload/route').POST;
let techUploadUrlPost: typeof import('@/app/api/v1/tech/upload-url/route').POST;
let customerPhotoPost: typeof import('@/app/api/v1/admin/customers/photo/route').POST;
let customersPost: typeof import('@/app/api/v1/admin/customers/route').POST;
let customersPatch: typeof import('@/app/api/v1/admin/customers/route').PATCH;
let techStartPost: typeof import('@/app/api/v1/tech/tickets/[id]/start/route').POST;
let techSubmitPost: typeof import('@/app/api/v1/tech/tickets/[id]/submit/route').POST;
let techErrorLogsPost: typeof import('@/app/api/v1/tech/error-logs/route').POST;
let clustersAuditPost: typeof import('@/app/api/v1/admin/clusters/audit/route').POST;
let clustersHistoryGet: typeof import('@/app/api/v1/admin/clusters/history/route').GET;
let streamReportsGet: typeof import('@/app/api/v1/admin/stream/reports/route').GET;

function createMultipartNextRequest(
  url: string,
  formData: FormData,
  headers: Record<string, string> = {},
) {
  const webRequire = createRequire(`${resolveRepoRoot()}/apps/web/package.json`);
  const nextServer = webRequire('next/server') as typeof import('next/server');
  return new nextServer.NextRequest(url, {
    method: 'POST',
    headers,
    body: formData,
  });
}

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

function createMockPngBuffer(sizeBytes = 1024): Buffer {
  const buf = Buffer.alloc(Math.max(sizeBytes, 16), 0x11);
  buf[0] = 0x89;
  buf[1] = 0x50;
  buf[2] = 0x4e;
  buf[3] = 0x47;
  buf[4] = 0x0d;
  buf[5] = 0x0a;
  buf[6] = 0x1a;
  buf[7] = 0x0a;
  return buf;
}

async function buildMinimalValidXlsxBuffer(clusterCode = 'PLBHRAGA01'): Promise<Buffer> {
  const webRequire = createRequire(`${resolveRepoRoot()}/apps/web/package.json`);
  const ExcelJS = webRequire('exceljs') as typeof import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('GPON PLB');
  ws.addRow([
    'SIA',
    'CUSTOMER NAME',
    'LALTOG CUSTOMER',
    'LOKASI / NAMA ODP',
    'LATLOG ODP',
    'PORT DI ODP',
    'NODE AKSES GPON',
    'REDAMAN',
  ]);
  ws.addRow([
    '2026990001',
    'PT Valid Cluster Row',
    '-2.9833, 104.7644',
    'ODP-PLB-001',
    '-2.9833, 104.7644',
    1,
    clusterCode,
    -19.5,
  ]);
  const raw = await wb.xlsx.writeBuffer();
  return Buffer.from(raw);
}

describe('Tier 1: Web API AuthZ, Media, AI, Import, Upload & SSE (API-01..02, 04..11, 14)', () => {
  const restoreFns: Array<() => void> = [];

  before(async () => {
    configureOfflineTestEnv();
    const [
      dbMod,
      minioMod,
      redisMod,
      aiMod,
      ticketMod,
      techMod,
      custMod,
      netMod,
      presignRoute,
      toggleRoute,
      forceLogoutRoute,
      techTicketsRoute,
      approveRoute,
      rejectRoute,
      aiChatRoute,
      aiConfirmRoute,
      importRoute,
      techUploadRoute,
      uploadUrlRoute,
      custPhotoRoute,
      custRoute,
      techStartRoute,
      techSubmitRoute,
      errorLogsRoute,
      auditRoute,
      historyRoute,
      sseRoute,
    ] = await Promise.all([
      import('@repo/database'),
      import('@/server/lib/minio'),
      import('@/server/lib/redis'),
      import('@/server/services/ai.service'),
      import('@/server/services/ticket.service'),
      import('@/server/services/technician.service'),
      import('@/server/services/customer.service'),
      import('@/server/services/network.service'),
      import('@/app/api/v1/admin/media/presign/route'),
      import('@/app/api/v1/admin/technicians/[id]/toggle/route'),
      import('@/app/api/v1/admin/technicians/[id]/force-logout/route'),
      import('@/app/api/v1/tech/tickets/route'),
      import('@/app/api/v1/admin/tickets/[id]/approve/route'),
      import('@/app/api/v1/admin/tickets/[id]/reject/route'),
      import('@/app/api/v1/admin/ai/chat/route'),
      import('@/app/api/v1/admin/ai/confirm-action/route'),
      import('@/app/api/v1/admin/network/import/route'),
      import('@/app/api/v1/tech/tickets/[id]/upload/route'),
      import('@/app/api/v1/tech/upload-url/route'),
      import('@/app/api/v1/admin/customers/photo/route'),
      import('@/app/api/v1/admin/customers/route'),
      import('@/app/api/v1/tech/tickets/[id]/start/route'),
      import('@/app/api/v1/tech/tickets/[id]/submit/route'),
      import('@/app/api/v1/tech/error-logs/route'),
      import('@/app/api/v1/admin/clusters/audit/route'),
      import('@/app/api/v1/admin/clusters/history/route'),
      import('@/app/api/v1/admin/stream/reports/route'),
    ]);

    prisma = dbMod.prisma;
    resetDatabaseHealthCache = dbMod.resetDatabaseHealthCache;
    minioManager = minioMod.minioManager;
    redisManager = redisMod.redisManager;
    AiService = aiMod.AiService;
    generateSignedActionToken = aiMod.generateSignedActionToken;
    TicketService = ticketMod.TicketService;
    TechnicianService = techMod.TechnicianService;
    CustomerService = custMod.CustomerService;
    NetworkService = netMod.NetworkService;

    mediaPresignGet = presignRoute.GET;
    techTogglePost = toggleRoute.POST;
    techForceLogoutPost = forceLogoutRoute.POST;
    techTicketsGet = techTicketsRoute.GET;
    ticketApprovePost = approveRoute.POST;
    ticketRejectPost = rejectRoute.POST;
    aiChatPost = aiChatRoute.POST;
    aiConfirmPost = aiConfirmRoute.POST;
    networkImportPost = importRoute.POST;
    techUploadPost = techUploadRoute.POST;
    techUploadUrlPost = uploadUrlRoute.POST;
    customerPhotoPost = custPhotoRoute.POST;
    customersPost = custRoute.POST;
    customersPatch = custRoute.PATCH;
    techStartPost = techStartRoute.POST;
    techSubmitPost = techSubmitRoute.POST;
    techErrorLogsPost = errorLogsRoute.POST;
    clustersAuditPost = auditRoute.POST;
    clustersHistoryGet = historyRoute.GET;
    streamReportsGet = sseRoute.GET;
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

  it('API-01: scopes /admin/media/presign to allowed media prefixes & actor cluster, blocking backups and cross-cluster keys', async () => {
    const adminId = crypto.randomUUID();
    const adminToken = await mintTestJwt(
      {
        username: 'admin.plb01',
        role: 'Admin Operasional',
        userType: 'ADMIN',
        hierarchyLevel: 50,
        assignedClusters: ['PLBHRAGA01'],
        permissions: [PERMISSIONS.TICKET_READ, PERMISSIONS.CUSTOMER_READ],
        tokenType: 'access',
      },
      { subject: adminId, audience: 'web' },
    );

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
            permissions: [PERMISSIONS.TICKET_READ, PERMISSIONS.CUSTOMER_READ],
          },
        })) as unknown as typeof prisma.user.findUnique),
      );
      restoreFns.push(
        stubMethod(minioManager, 'generatePresignedGetUrl', async (key: string) => {
          return `https://minio.local/fiberops-proofs/${key}?X-Amz-Signature=deadbeef`;
        }),
      );

      // Backup prefix must NEVER be presigned
      const backupRes = await mediaPresignGet(
        createNextRequest(
          'http://localhost:3000/api/v1/admin/media/presign?key=backups/ftth_snapshot_1700000000.json.gz',
          { cookies: { fiberops_session: adminToken } },
        ),
      );
      assert.ok(
        backupRes.status === 400 || backupRes.status === 403,
        `API-01: backups/* key must be blocked from presign (400/403), got ${backupRes.status}`,
      );

      // Unknown prefix must be rejected
      const unknownPrefixRes = await mediaPresignGet(
        createNextRequest(
          'http://localhost:3000/api/v1/admin/media/presign?key=private-exports/secrets.txt',
          { cookies: { fiberops_session: adminToken } },
        ),
      );
      assert.ok(
        unknownPrefixRes.status === 400 || unknownPrefixRes.status === 403,
        `API-01: arbitrary prefix must be rejected (400/403), got ${unknownPrefixRes.status}`,
      );

      // Encoded %2e%2e traversal must be rejected (400/403)
      const encodedTraversalRes = await mediaPresignGet(
        createNextRequest(
          'http://localhost:3000/api/v1/admin/media/presign?key=opm-proofs/%2e%2e/backups/secret.json.gz',
          { cookies: { fiberops_session: adminToken } },
        ),
      );
      assert.ok(
        encodedTraversalRes.status === 400 || encodedTraversalRes.status === 403,
        `API-01: %2e%2e encoded traversal must be rejected (400/403), got ${encodedTraversalRes.status}`,
      );

      // Cross-cluster media keys (opm-proofs/*, proofs/*, customers/*) owned by PLBBSGGA01 must be rejected 403
      restoreFns.push(
        stubMethod(prisma.ticket, 'findFirst', (async () => ({
          id: crypto.randomUUID(),
          customer: { cluster: { clusterCode: 'PLBBSGGA01', name: 'Palembang Basuki Rahmat' } },
        })) as unknown as typeof prisma.ticket.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma.attenuationHistory, 'findFirst', (async () => ({
          id: crypto.randomUUID(),
          customer: { cluster: { clusterCode: 'PLBBSGGA01', name: 'Palembang Basuki Rahmat' } },
        })) as unknown as typeof prisma.attenuationHistory.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma.customer, 'findFirst', (async () => ({
          id: crypto.randomUUID(),
          cluster: { clusterCode: 'PLBBSGGA01', name: 'Palembang Basuki Rahmat' },
        })) as unknown as typeof prisma.customer.findFirst),
      );

      for (const crossKey of [
        'opm-proofs/2026/02/t-other.jpg',
        'proofs/t-other.jpg',
        'customers/202699/photo.jpg',
      ]) {
        const crossClusterRes = await mediaPresignGet(
          createNextRequest(
            `http://localhost:3000/api/v1/admin/media/presign?key=${encodeURIComponent(crossKey)}`,
            { cookies: { fiberops_session: adminToken } },
          ),
        );
        assert.strictEqual(
          crossClusterRes.status,
          403,
          `API-01: Cross-cluster media presign (${crossKey}) must return 403, got ${crossClusterRes.status}`,
        );
      }

      // Orphan/unowned key must fail closed (403/404) for non-global admin
      restoreFns.push(
        stubMethod(prisma.ticket, 'findFirst', (async () => null) as unknown as typeof prisma.ticket.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma.attenuationHistory, 'findFirst', (async () => null) as unknown as typeof prisma.attenuationHistory.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma.customer, 'findFirst', (async () => null) as unknown as typeof prisma.customer.findFirst),
      );
      const orphanRes = await mediaPresignGet(
        createNextRequest(
          'http://localhost:3000/api/v1/admin/media/presign?key=opm-proofs/2026/02/unowned-orphan.jpg',
          { cookies: { fiberops_session: adminToken } },
        ),
      );
      assert.ok(
        orphanRes.status === 403 || orphanRes.status === 404,
        `API-01: Unowned/orphan media key must fail closed (403/404) for non-global admin, got ${orphanRes.status}`,
      );

      // In-cluster media keys (opm-proofs/* & customers/*) succeed (200)
      restoreFns.push(
        stubMethod(prisma.attenuationHistory, 'findFirst', (async () => ({
          id: crypto.randomUUID(),
          customer: { cluster: { clusterCode: 'PLBHRAGA01', name: 'Palembang H. R. Agam' } },
        })) as unknown as typeof prisma.attenuationHistory.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma.ticket, 'findFirst', (async () => ({
          id: crypto.randomUUID(),
          customer: { cluster: { clusterCode: 'PLBHRAGA01', name: 'Palembang H. R. Agam' } },
        })) as unknown as typeof prisma.ticket.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma.customer, 'findFirst', (async () => ({
          id: crypto.randomUUID(),
          cluster: { clusterCode: 'PLBHRAGA01', name: 'Palembang H. R. Agam' },
        })) as unknown as typeof prisma.customer.findFirst),
      );

      const validRes = await mediaPresignGet(
        createNextRequest(
          'http://localhost:3000/api/v1/admin/media/presign?key=opm-proofs/2026/02/t-incluster.jpg',
          { cookies: { fiberops_session: adminToken } },
        ),
      );
      assert.strictEqual(validRes.status, 200);
      const validJson = (await validRes.json()) as { success: boolean; data?: { url: string } };
      assert.strictEqual(validJson.success, true);
      assert.match(validJson.data?.url || '', /opm-proofs\/2026\/02\/t-incluster\.jpg/);

      const validCustRes = await mediaPresignGet(
        createNextRequest(
          'http://localhost:3000/api/v1/admin/media/presign?key=customers/100245/building.jpg',
          { cookies: { fiberops_session: adminToken } },
        ),
      );
      assert.strictEqual(validCustRes.status, 200);
    });
  });

  it('API-02: prevents toggling or force-logging-out SUPER_ADMIN/ADMIN, cross-cluster technicians, or substring matches', async () => {
    const clusterAdminId = crypto.randomUUID();
    const otherAdminId = crypto.randomUUID();
    const superAdminId = crypto.randomUUID();
    const techInClusterId = crypto.randomUUID();
    const techOtherClusterId = crypto.randomUUID();
    const inClusterDeviceId = crypto.randomUUID();

    const adminToken = await mintTestJwt(
      {
        username: 'admin.plb01',
        role: 'Admin Operasional',
        userType: 'ADMIN',
        hierarchyLevel: 50,
        assignedClusters: ['PLBHRAGA01'],
        permissions: [PERMISSIONS.TECH_MANAGE],
        tokenType: 'access',
      },
      { subject: clusterAdminId, audience: 'web' },
    );

    await withMockTcpDbServer(async () => {
      let mutatedUserId: string | null = null;
      let sessionUpdateManyCalled = false;

      restoreFns.push(
        stubMethod(prisma.user, 'findMany', (async () => [
          {
            id: techInClusterId,
            nik: '882043',
            username: 'tech.andi',
            fullName: 'Andi Pratama',
            vendorCompany: 'PT Mitra',
            telegramChatId: '11111',
            isActive: true,
            assignedClusters: ['PLBHRAGA01'],
            role: { name: 'Technician', hierarchyLevel: 10, permissions: ['ticket:read'] },
            assignedTickets: [],
          },
          {
            id: techOtherClusterId,
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
        stubMethod(prisma.user, 'findFirst', (async (args: { where?: Record<string, unknown> }) => {
          const serialized = JSON.stringify(args.where ?? {});
          if (serialized.includes(superAdminId)) {
            return {
              id: superAdminId,
              username: 'superadmin',
              fullName: 'Aditya Saputra',
              userType: 'SUPER_ADMIN',
              isActive: true,
              assignedClusters: ['Global Scope'],
              role: { name: 'Super Admin', hierarchyLevel: 100 },
            };
          }
          if (serialized.includes(otherAdminId)) {
            return {
              id: otherAdminId,
              username: 'admin.other',
              fullName: 'Admin Lain',
              userType: 'ADMIN',
              isActive: true,
              assignedClusters: ['PLBHRAGA01'],
              role: { name: 'Admin Operasional', hierarchyLevel: 50 },
            };
          }
          if (serialized.includes(techOtherClusterId)) {
            return {
              id: techOtherClusterId,
              username: 'tech.rizky',
              fullName: 'Rizky Maulana',
              userType: 'TECHNICIAN',
              isActive: true,
              assignedClusters: ['PLBBSGGA01'],
              role: { name: 'Technician', hierarchyLevel: 10 },
            };
          }
          if (serialized.includes(techInClusterId)) {
            return {
              id: techInClusterId,
              username: 'tech.andi',
              fullName: 'Andi Pratama',
              userType: 'TECHNICIAN',
              isActive: true,
              assignedClusters: ['PLBHRAGA01'],
              role: { name: 'Technician', hierarchyLevel: 10 },
            };
          }
          return null;
        }) as unknown as typeof prisma.user.findFirst),
      );

      restoreFns.push(
        stubMethod(prisma.user, 'findUnique', (async (args: { where: { id?: string } }) => {
          if (args.where.id === clusterAdminId) {
            return {
              id: clusterAdminId,
              username: 'admin.plb01',
              fullName: 'Admin PLB01',
              userType: 'ADMIN',
              isActive: true,
              assignedClusters: ['PLBHRAGA01'],
              role: { name: 'Admin Operasional', hierarchyLevel: 50, permissions: [PERMISSIONS.TECH_MANAGE] },
            };
          }
          return null;
        }) as unknown as typeof prisma.user.findUnique),
      );

      restoreFns.push(
        stubMethod(prisma.user, 'update', (async (args: { where: { id: string } }) => {
          mutatedUserId = args.where.id;
          return {
            id: args.where.id,
            username: 'tech.andi',
            fullName: 'Andi Pratama',
            isActive: false,
            assignedClusters: ['PLBHRAGA01'],
          };
        }) as unknown as typeof prisma.user.update),
      );
      restoreFns.push(
        stubMethod(prisma.userSession, 'findMany', (async (args?: { where?: { userId?: string } }) => {
          if (args?.where?.userId === techInClusterId) {
            return [{ id: 'sess-in-1', deviceId: inClusterDeviceId, jti: 'jti-in-1' }];
          }
          return [];
        }) as unknown as typeof prisma.userSession.findMany),
      );
      restoreFns.push(
        stubMethod(prisma.userSession, 'updateMany', (async () => {
          sessionUpdateManyCalled = true;
          return { count: 1 };
        }) as unknown as typeof prisma.userSession.updateMany),
      );
      restoreFns.push(
        stubMethod(prisma.activityLog, 'create', (async () => ({ id: 'log-1' })) as unknown as typeof prisma.activityLog.create),
      );

      // 1. Targeting SUPER_ADMIN or another ADMIN (hierarchy 50) on toggle & force-logout MUST fail 403/404
      const toggleSuperRes = await techTogglePost(
        createNextRequest(`http://localhost:3000/api/v1/admin/technicians/${superAdminId}/toggle`, {
          method: 'POST',
          cookies: { fiberops_session: adminToken },
          jsonBody: { isActive: false },
        }),
        { params: Promise.resolve({ id: superAdminId }) },
      );
      assert.ok(
        toggleSuperRes.status === 403 || toggleSuperRes.status === 404,
        `API-02: toggle targeting SUPER_ADMIN must return 403/404, got ${toggleSuperRes.status}`,
      );
      assert.notStrictEqual(mutatedUserId, superAdminId, 'API-02: SUPER_ADMIN must NEVER be deactivated');

      const forceLogoutSuperRes = await techForceLogoutPost(
        createNextRequest(
          `http://localhost:3000/api/v1/admin/technicians/${superAdminId}/force-logout`,
          {
            method: 'POST',
            cookies: { fiberops_session: adminToken },
            jsonBody: { reason: 'Attack test' },
          },
        ),
        { params: Promise.resolve({ id: superAdminId }) },
      );
      assert.ok(
        forceLogoutSuperRes.status === 403 || forceLogoutSuperRes.status === 404,
        `API-02: force-logout targeting SUPER_ADMIN must return 403/404, got ${forceLogoutSuperRes.status}`,
      );

      const togglePeerAdminRes = await techTogglePost(
        createNextRequest(`http://localhost:3000/api/v1/admin/technicians/${otherAdminId}/toggle`, {
          method: 'POST',
          cookies: { fiberops_session: adminToken },
          jsonBody: { isActive: false },
        }),
        { params: Promise.resolve({ id: otherAdminId }) },
      );
      assert.ok(
        togglePeerAdminRes.status === 403 || togglePeerAdminRes.status === 404,
        `API-02: ADMIN targeting another ADMIN on toggle must return 403/404, got ${togglePeerAdminRes.status}`,
      );
      assert.notStrictEqual(mutatedUserId, otherAdminId, 'API-02: Peer ADMIN must NEVER be deactivated');

      const forceLogoutPeerAdminRes = await techForceLogoutPost(
        createNextRequest(
          `http://localhost:3000/api/v1/admin/technicians/${otherAdminId}/force-logout`,
          {
            method: 'POST',
            cookies: { fiberops_session: adminToken },
            jsonBody: { reason: 'Peer admin attack' },
          },
        ),
        { params: Promise.resolve({ id: otherAdminId }) },
      );
      assert.ok(
        forceLogoutPeerAdminRes.status === 403 || forceLogoutPeerAdminRes.status === 404,
        `API-02: ADMIN targeting another ADMIN on force-logout must return 403/404, got ${forceLogoutPeerAdminRes.status}`,
      );

      // 2. Cross-cluster technician must return 403 on BOTH toggle and force-logout
      const crossToggleRes = await techTogglePost(
        createNextRequest(
          `http://localhost:3000/api/v1/admin/technicians/${techOtherClusterId}/toggle`,
          {
            method: 'POST',
            cookies: { fiberops_session: adminToken },
            jsonBody: { isActive: false },
          },
        ),
        { params: Promise.resolve({ id: techOtherClusterId }) },
      );
      assert.strictEqual(
        crossToggleRes.status,
        403,
        `API-02: Cross-cluster toggle must return 403, got ${crossToggleRes.status}`,
      );

      const crossForceLogoutRes = await techForceLogoutPost(
        createNextRequest(
          `http://localhost:3000/api/v1/admin/technicians/${techOtherClusterId}/force-logout`,
          {
            method: 'POST',
            cookies: { fiberops_session: adminToken },
            jsonBody: { reason: 'Cross-cluster check' },
          },
        ),
        { params: Promise.resolve({ id: techOtherClusterId }) },
      );
      assert.strictEqual(
        crossForceLogoutRes.status,
        403,
        `API-02: Cross-cluster force-logout must return 403, got ${crossForceLogoutRes.status}`,
      );

      // 3. Partial fullName substring ("Adi") must NOT match or mutate another user on toggle or force-logout
      const partialRes = await techTogglePost(
        createNextRequest('http://localhost:3000/api/v1/admin/technicians/Adi/toggle', {
          method: 'POST',
          cookies: { fiberops_session: adminToken },
          jsonBody: { isActive: false },
        }),
        { params: Promise.resolve({ id: 'Adi' }) },
      );
      assert.ok(
        partialRes.status === 400 || partialRes.status === 404,
        `API-02: Partial fullName substring on toggle must be rejected (400/404), got ${partialRes.status}`,
      );

      const partialForceLogoutRes = await techForceLogoutPost(
        createNextRequest('http://localhost:3000/api/v1/admin/technicians/Adi/force-logout', {
          method: 'POST',
          cookies: { fiberops_session: adminToken },
          jsonBody: { reason: 'Partial substring check' },
        }),
        { params: Promise.resolve({ id: 'Adi' }) },
      );
      assert.ok(
        partialForceLogoutRes.status === 400 || partialForceLogoutRes.status === 404,
        `API-02: Partial fullName substring on force-logout must be rejected (400/404), got ${partialForceLogoutRes.status}`,
      );

      // 4. Positive: in-cluster technician force-logout revokes DB sessions + blacklists device in Redis (200)
      sessionUpdateManyCalled = false;
      const validForceLogoutRes = await techForceLogoutPost(
        createNextRequest(
          `http://localhost:3000/api/v1/admin/technicians/${techInClusterId}/force-logout`,
          {
            method: 'POST',
            cookies: { fiberops_session: adminToken },
            jsonBody: { reason: 'Device lost' },
          },
        ),
        { params: Promise.resolve({ id: techInClusterId }) },
      );
      assert.strictEqual(validForceLogoutRes.status, 200);
      assert.strictEqual(sessionUpdateManyCalled, true, 'API-02: force-logout must revoke DB UserSession rows');
      assert.strictEqual(
        await redisManager.isSessionBlacklisted(inClusterDeviceId),
        true,
        'API-02: force-logout must blacklist technician deviceId in Redis',
      );

      // 5. Positive: in-cluster technician toggle succeeds (200)
      const validRes = await techTogglePost(
        createNextRequest(
          `http://localhost:3000/api/v1/admin/technicians/${techInClusterId}/toggle`,
          {
            method: 'POST',
            cookies: { fiberops_session: adminToken },
            jsonBody: { isActive: false, reason: 'Shift end' },
          },
        ),
        { params: Promise.resolve({ id: techInClusterId }) },
      );
      assert.strictEqual(validRes.status, 200);
    });
  });

  it('API-04: blocks horizontal IDOR via ?tech= query on GET /api/v1/tech/tickets and scopes splitters to tech cluster', async () => {
    const techId = crypto.randomUUID();
    const deviceId = crypto.randomUUID();
    const techToken = await mintTestJwt(
      {
        username: 'tech.andi',
        role: 'Vendor / Teknisi Lapangan',
        userType: 'TECHNICIAN',
        hierarchyLevel: 10,
        assignedClusters: ['PLBHRAGA01'],
        deviceId,
        tokenType: 'access',
      },
      { subject: techId, audience: 'mobile' },
    );

    await withMockTcpDbServer(async () => {
      restoreFns.push(
        stubMethod(prisma.user, 'findUnique', (async () => ({
          id: techId,
          username: 'tech.andi',
          fullName: 'Andi Pratama',
          userType: 'TECHNICIAN',
          isActive: true,
          assignedClusters: ['PLBHRAGA01'],
          role: { name: 'Technician', hierarchyLevel: 10, permissions: ['ticket:read', 'ticket:submit'] },
        })) as unknown as typeof prisma.user.findUnique),
      );
      restoreFns.push(
        stubMethod(prisma.userSession, 'findFirst', (async () => ({
          id: crypto.randomUUID(),
        })) as unknown as typeof prisma.userSession.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma.ticket, 'findMany', (async (args?: { where?: { assignedTechId?: string } }) => {
          // Caller tech.andi has 0 active tickets; other tech would have tickets if queried
          if (args?.where?.assignedTechId && args.where.assignedTechId !== techId) {
            return [
              {
                id: crypto.randomUUID(),
                ticketNumber: 'WO-SECRET-OTHER',
                ticketType: 'PSB',
                status: 'OPEN',
                serviceAddress: 'Jl. Rahasia',
                createdAt: new Date(),
                customer: {
                  id: crypto.randomUUID(),
                  siaNumber: '999999',
                  fullName: 'Victim Customer',
                  address: 'Jl. Rahasia',
                  cluster: { name: 'Palembang Basuki Rahmat', clusterCode: 'PLBBSGGA01' },
                  splitter: null,
                  attenuations: [],
                },
                assignedTech: null,
              },
            ];
          }
          return [];
        }) as unknown as typeof prisma.ticket.findMany),
      );
      restoreFns.push(
        stubMethod(prisma.networkSplitter, 'findMany', (async () => [
          {
            id: crypto.randomUUID(),
            splitterCode: 'ODP-PLB-001',
            lat: -2.9833,
            lng: 104.7644,
            maxPorts: 8,
            cluster: { name: 'Palembang H. R. Agam', clusterCode: 'PLBHRAGA01' },
            customers: [],
          },
          {
            id: crypto.randomUUID(),
            splitterCode: 'ODP-PLB-050',
            lat: -2.9765,
            lng: 104.7512,
            maxPorts: 8,
            cluster: { name: 'Palembang Basuki Rahmat', clusterCode: 'PLBBSGGA01' },
            customers: [],
          },
        ]) as unknown as typeof prisma.networkSplitter.findMany),
      );

      // Even with 0 active tickets + ?tech=tech.rizky, MUST return [] (NOT Rizky's tickets or FALLBACK_TICKETS)
      const res = await techTicketsGet(
        createNextRequest('http://localhost:3000/api/v1/tech/tickets?tech=tech.rizky', {
          headers: {
            authorization: `Bearer ${techToken}`,
            'x-device-id': deviceId,
          },
        }),
      );
      assert.strictEqual(res.status, 200);
      const json = (await res.json()) as {
        data: { tickets: Array<{ ticketNumber: string }>; splitters: Array<{ clusterCode: string }> };
      };
      assert.strictEqual(
        json.data.tickets.length,
        0,
        `API-04: Tech with 0 tickets passing ?tech=tech.rizky must receive 0 tickets (no fallback/IDOR leak), got ${json.data.tickets.length}`,
      );
      assert.ok(
        json.data.splitters.every((s) => s.clusterCode === 'PLBHRAGA01'),
        `API-04: Splitters returned to PLBHRAGA01 tech must NOT include PLBBSGGA01 splitters`,
      );
    });
  });

  it('API-05: enforces cluster scoping beyond 50 rows on ticket approve/reject, lifecycle status check, and non-overwritable RLS filter', async () => {
    const adminId = crypto.randomUUID();
    const adminToken = await mintTestJwt(
      {
        username: 'admin.plb01',
        role: 'Admin Operasional',
        userType: 'ADMIN',
        hierarchyLevel: 50,
        assignedClusters: ['PLBHRAGA01'],
        permissions: [PERMISSIONS.TICKET_CREATE, PERMISSIONS.TECH_MANAGE, PERMISSIONS.TICKET_READ],
        tokenType: 'access',
      },
      { subject: adminId, audience: 'web' },
    );

    const row55OtherClusterId = crypto.randomUUID();
    const openTicketInClusterId = crypto.randomUUID();
    const pendingTicketInClusterId = crypto.randomUUID();
    const missingTicketId = crypto.randomUUID();

    await withMockTcpDbServer(async () => {
      let capturedWhereOnList: Record<string, unknown> | null = null;
      let approvedId: string | null = null;

      restoreFns.push(
        stubMethod(prisma.user, 'findUnique', (async () => ({
          id: adminId,
          username: 'admin.plb01',
          fullName: 'Admin PLB01',
          userType: 'ADMIN',
          isActive: true,
          assignedClusters: ['PLBHRAGA01'],
          role: { name: 'Admin Operasional', hierarchyLevel: 50, permissions: ['*'] },
        })) as unknown as typeof prisma.user.findUnique),
      );

      // Simulate listTickets returning only 50 PLBHRAGA01 rows (ticket #55 is outside top 50!)
      restoreFns.push(
        stubMethod(prisma.ticket, 'findMany', (async (args: { where?: Record<string, unknown> }) => {
          capturedWhereOnList = args.where ?? {};
          return [];
        }) as unknown as typeof prisma.ticket.findMany),
      );

      // Direct ticket lookup finds row #55 in PLBBSGGA01, OPEN & PENDING_APPROVAL in PLBHRAGA01, and null for missing
      restoreFns.push(
        stubMethod(prisma.ticket, 'findFirst', (async (args: { where?: { OR?: Array<{ id?: string }> } }) => {
          const targetId = args.where?.OR?.[0]?.id;
          if (targetId === row55OtherClusterId) {
            return {
              id: row55OtherClusterId,
              ticketNumber: 'WO-ROW-055',
              ticketType: 'PSB',
              status: 'PENDING_APPROVAL',
              customerId: crypto.randomUUID(),
              assignedTechId: crypto.randomUUID(),
              customer: {
                siaNumber: '20260055',
                fullName: 'Other Cluster Customer',
                address: 'Jl. Basuki Rahmat',
                cluster: { name: 'Palembang Basuki Rahmat', clusterCode: 'PLBBSGGA01' },
                splitter: null,
              },
              assignedTech: null,
            };
          }
          if (targetId === openTicketInClusterId) {
            return {
              id: openTicketInClusterId,
              ticketNumber: 'WO-OPEN-01',
              ticketType: 'PSB',
              status: 'OPEN',
              customerId: crypto.randomUUID(),
              assignedTechId: crypto.randomUUID(),
              customer: {
                siaNumber: '20260001',
                fullName: 'In Cluster Customer',
                address: 'Jl. HR Agam',
                cluster: { name: 'Palembang H. R. Agam', clusterCode: 'PLBHRAGA01' },
                splitter: null,
              },
              assignedTech: null,
            };
          }
          if (targetId === pendingTicketInClusterId) {
            return {
              id: pendingTicketInClusterId,
              ticketNumber: 'WO-PEND-01',
              ticketType: 'PSB',
              status: 'PENDING_APPROVAL',
              customerId: crypto.randomUUID(),
              assignedTechId: crypto.randomUUID(),
              customer: {
                siaNumber: '20260002',
                fullName: 'In Cluster Pending Customer',
                address: 'Jl. HR Agam',
                cluster: { name: 'Palembang H. R. Agam', clusterCode: 'PLBHRAGA01' },
                splitter: null,
              },
              assignedTech: null,
            };
          }
          return null;
        }) as unknown as typeof prisma.ticket.findFirst),
      );

      restoreFns.push(
        stubMethod(prisma, '$transaction', (async (fn: (tx: typeof prisma) => Promise<unknown>) => {
          return fn(prisma);
        }) as unknown as typeof prisma.$transaction),
      );
      restoreFns.push(
        stubMethod(prisma.networkSplitter, 'findFirst', (async () => null) as unknown as typeof prisma.networkSplitter.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma.activityLog, 'create', (async () => ({ id: 'log-app' })) as unknown as typeof prisma.activityLog.create),
      );
      restoreFns.push(
        stubMethod(prisma.ticket, 'update', (async (args: { where: { id: string }; data: { status?: string } }) => {
          approvedId = args.where.id;
          return {
            id: args.where.id,
            ticketNumber: 'WO-PEND-01',
            ticketType: 'PSB',
            status: args.data.status || 'COMPLETED',
            createdAt: new Date(),
            completedAt: new Date(),
            customer: {
              siaNumber: '20260002',
              fullName: 'In Cluster Pending Customer',
              address: 'Jl. HR Agam',
              cluster: { name: 'Palembang H. R. Agam', clusterCode: 'PLBHRAGA01' },
              splitter: null,
            },
            assignedTech: null,
          };
        }) as unknown as typeof prisma.ticket.update),
      );

      // 1. Approving ticket #55 (not in top-50 list) in PLBBSGGA01 MUST fail 403
      const approveOtherRes = await ticketApprovePost(
        createNextRequest(`http://localhost:3000/api/v1/admin/tickets/${row55OtherClusterId}/approve`, {
          method: 'POST',
          cookies: { fiberops_session: adminToken },
        }),
        { params: Promise.resolve({ id: row55OtherClusterId }) },
      );
      assert.strictEqual(
        approveOtherRes.status,
        403,
        `API-05: Approving cross-cluster ticket #55 must return 403 (never bypassed by 50-row slice), got ${approveOtherRes.status}`,
      );
      assert.strictEqual(approvedId, null, 'API-05: Cross-cluster approve must not reach transaction');

      // 2. Rejecting ticket #55 in PLBBSGGA01 MUST fail 403
      const rejectOtherRes = await ticketRejectPost(
        createNextRequest(`http://localhost:3000/api/v1/admin/tickets/${row55OtherClusterId}/reject`, {
          method: 'POST',
          cookies: { fiberops_session: adminToken },
          jsonBody: { reason: 'Cross-cluster check' },
        }),
        { params: Promise.resolve({ id: row55OtherClusterId }) },
      );
      assert.strictEqual(
        rejectOtherRes.status,
        403,
        `API-05: Rejecting cross-cluster ticket #55 must return 403, got ${rejectOtherRes.status}`,
      );

      // 3. Approving or rejecting an OPEN ticket (not PENDING_APPROVAL) must be rejected (400/409)
      const approveOpenRes = await ticketApprovePost(
        createNextRequest(`http://localhost:3000/api/v1/admin/tickets/${openTicketInClusterId}/approve`, {
          method: 'POST',
          cookies: { fiberops_session: adminToken },
        }),
        { params: Promise.resolve({ id: openTicketInClusterId }) },
      );
      assert.ok(
        approveOpenRes.status === 400 || approveOpenRes.status === 409,
        `API-05: Approving OPEN ticket must return 400/409, got ${approveOpenRes.status}`,
      );

      const rejectOpenRes = await ticketRejectPost(
        createNextRequest(`http://localhost:3000/api/v1/admin/tickets/${openTicketInClusterId}/reject`, {
          method: 'POST',
          cookies: { fiberops_session: adminToken },
          jsonBody: { reason: 'Status lifecycle check' },
        }),
        { params: Promise.resolve({ id: openTicketInClusterId }) },
      );
      assert.ok(
        rejectOpenRes.status === 400 || rejectOpenRes.status === 409,
        `API-05: Rejecting OPEN ticket must return 400/409, got ${rejectOpenRes.status}`,
      );

      // 4. Missing ticket must fail closed with 404 on approve and reject
      const approveMissingRes = await ticketApprovePost(
        createNextRequest(`http://localhost:3000/api/v1/admin/tickets/${missingTicketId}/approve`, {
          method: 'POST',
          cookies: { fiberops_session: adminToken },
        }),
        { params: Promise.resolve({ id: missingTicketId }) },
      );
      assert.strictEqual(approveMissingRes.status, 404, `API-05: Missing ticket approve must return 404, got ${approveMissingRes.status}`);

      const rejectMissingRes = await ticketRejectPost(
        createNextRequest(`http://localhost:3000/api/v1/admin/tickets/${missingTicketId}/reject`, {
          method: 'POST',
          cookies: { fiberops_session: adminToken },
          jsonBody: { reason: 'Missing ticket' },
        }),
        { params: Promise.resolve({ id: missingTicketId }) },
      );
      assert.strictEqual(rejectMissingRes.status, 404, `API-05: Missing ticket reject must return 404, got ${rejectMissingRes.status}`);

      // 5. Positive in-cluster PENDING_APPROVAL approve & reject succeed (200)
      const approveValidRes = await ticketApprovePost(
        createNextRequest(`http://localhost:3000/api/v1/admin/tickets/${pendingTicketInClusterId}/approve`, {
          method: 'POST',
          cookies: { fiberops_session: adminToken },
        }),
        { params: Promise.resolve({ id: pendingTicketInClusterId }) },
      );
      assert.strictEqual(approveValidRes.status, 200);

      const rejectValidRes = await ticketRejectPost(
        createNextRequest(`http://localhost:3000/api/v1/admin/tickets/${pendingTicketInClusterId}/reject`, {
          method: 'POST',
          cookies: { fiberops_session: adminToken },
          jsonBody: { reason: 'Foto blur' },
        }),
        { params: Promise.resolve({ id: pendingTicketInClusterId }) },
      );
      assert.strictEqual(rejectValidRes.status, 200);

      // 6. TicketService.listTickets({ cluster: 'PLBBSGGA01' }, plb01Actor) must combine RLS + query filter with AND
      process.env.STRICT_LIVE_DATA = 'true';
      const plb01Actor: UserSessionContext = {
        userId: adminId,
        username: 'admin.plb01',
        fullName: 'Admin PLB01',
        role: 'Admin Operasional',
        userType: 'ADMIN',
        hierarchyLevel: 50,
        assignedClusters: ['PLBHRAGA01'],
      };
      await TicketService.listTickets({ cluster: 'PLBBSGGA01' }, plb01Actor);
      const serializedWhere = JSON.stringify(capturedWhereOnList);
      assert.ok(
        Array.isArray((capturedWhereOnList as { AND?: unknown } | null)?.AND) &&
          serializedWhere.includes('PLBHRAGA01') &&
          serializedWhere.includes('PLBBSGGA01'),
        `API-05: listTickets must combine actor assignedClusters RLS and params.cluster via Prisma AND (got ${serializedWhere})`,
      );
    });
  });

  it('API-06: enforces AI cluster scoping, fail-closed empty clusters, empty-OR guard, prompt length cap & confirm-action scoping', async () => {
    const adminId = crypto.randomUUID();
    const emptyClusterAdmin: UserSessionContext = {
      userId: adminId,
      username: 'admin.unassigned',
      fullName: 'Unassigned Admin',
      role: 'Admin Operasional',
      userType: 'ADMIN',
      hierarchyLevel: 50,
      assignedClusters: [],
    };
    const plb01Admin: UserSessionContext = {
      userId: adminId,
      username: 'admin.plb01',
      fullName: 'Admin PLB01',
      role: 'Admin Operasional',
      userType: 'ADMIN',
      hierarchyLevel: 50,
      assignedClusters: ['PLBHRAGA01'],
    };

    await withMockTcpDbServer(async () => {
      let capturedCustomerWhere: unknown = null;
      restoreFns.push(
        stubMethod(prisma.customer, 'findFirst', (async (args?: { where?: unknown }) => {
          capturedCustomerWhere = args?.where;
          return {
            id: crypto.randomUUID(),
            siaNumber: '2025468388',
            fullName: 'Other Cluster Customer',
            address: 'Jl. Basuki Rahmat',
            status: 'ACTIVE',
            portNumber: 2,
            currentAttenuation: -20,
            cluster: { name: 'Palembang Basuki Rahmat', clusterCode: 'PLBBSGGA01' },
            splitter: { splitterCode: 'ODP-PLB-010' },
          };
        }) as unknown as typeof prisma.customer.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma.attenuationHistory, 'findMany', (async () => []) as unknown as typeof prisma.attenuationHistory.findMany),
      );

      // 1. Non-SUPER_ADMIN with assignedClusters: [] must fail closed across ALL read tools (never leak cross-cluster data)
      let capturedHistoryWhere: unknown = null;
      restoreFns.push(
        stubMethod(prisma.attenuationHistory, 'findMany', (async (args?: { where?: unknown }) => {
          capturedHistoryWhere = args?.where ?? null;
          return [
            {
              id: crypto.randomUUID(),
              submissionId: crypto.randomUUID(),
              portNumber: 1,
              newAttenuation: -20,
              isLocationFlagged: false,
              createdAt: new Date(),
              ticket: { ticketNumber: 'WO-OTHER-99' },
              customer: {
                fullName: 'Cross Cluster Cust',
                siaNumber: '2025468388',
                cluster: { name: 'Palembang Basuki Rahmat', clusterCode: 'PLBBSGGA01' },
                splitter: { splitterCode: 'ODP-PLB-010' },
              },
              tech: { fullName: 'Rizky Maulana' },
            },
          ];
        }) as unknown as typeof prisma.attenuationHistory.findMany),
      );
      restoreFns.push(
        stubMethod(prisma.user, 'findMany', (async () => [
          {
            id: crypto.randomUUID(),
            username: 'tech.andi',
            fullName: 'Andi Pratama',
            assignedClusters: ['PLBHRAGA01'],
            assignedTickets: [],
          },
          {
            id: crypto.randomUUID(),
            username: 'tech.rizky',
            fullName: 'Rizky Maulana',
            assignedClusters: ['PLBBSGGA01'],
            assignedTickets: [],
          },
        ]) as unknown as typeof prisma.user.findMany),
      );

      const emptyClusterTools = AiService.getFilteredTools(emptyClusterAdmin, [
        PERMISSIONS.CUSTOMER_READ,
        PERMISSIONS.TICKET_READ,
        PERMISSIONS.NETWORK_READ,
        'tech:read' as never,
      ]);
      const getCustTool = emptyClusterTools.get_customer_detail as unknown as {
        execute: (args: { siaNumber?: string; customerName?: string }) => Promise<Record<string, unknown>>;
      };
      const emptyResult = await getCustTool.execute({ siaNumber: '2025468388' });
      assert.ok(
        'error' in emptyResult,
        `API-06: Admin with assignedClusters=[] must be denied cross-cluster customer detail, got ${JSON.stringify(emptyResult)}`,
      );

      const emptyReportsTool = emptyClusterTools.get_recent_reports as unknown as {
        execute: (args: { clusterCode?: string; limit?: number }) => Promise<unknown>;
      };
      const emptyReportsRes = await emptyReportsTool.execute({ clusterCode: 'PLBBSGGA01' });
      assert.ok(
        (Array.isArray(emptyReportsRes) && emptyReportsRes.length === 0) ||
          (typeof emptyReportsRes === 'object' && emptyReportsRes !== null && 'error' in emptyReportsRes),
        `API-06: get_recent_reports with assignedClusters=[] must fail closed, got ${JSON.stringify(emptyReportsRes)}`,
      );

      const emptyWorkloadTool = emptyClusterTools.get_technician_workload as unknown as {
        execute: (args: { clusterCode?: string }) => Promise<unknown>;
      };
      const emptyWorkloadRes = await emptyWorkloadTool.execute({ clusterCode: 'PLBBSGGA01' });
      assert.ok(
        (Array.isArray(emptyWorkloadRes) && emptyWorkloadRes.length === 0) ||
          (typeof emptyWorkloadRes === 'object' && emptyWorkloadRes !== null && 'error' in emptyWorkloadRes),
        `API-06: get_technician_workload with assignedClusters=[] must fail closed, got ${JSON.stringify(emptyWorkloadRes)}`,
      );

      // 1b. Cluster-scoped PLBHRAGA01 admin calling get_recent_reports & get_technician_workload with PLBBSGGA01 filter must NOT leak PLBBSGGA01
      const plb01AllTools = AiService.getFilteredTools(plb01Admin, [
        PERMISSIONS.CUSTOMER_READ,
        PERMISSIONS.TICKET_READ,
        'tech:read' as never,
        PERMISSIONS.TICKET_CREATE,
        PERMISSIONS.TECH_MANAGE,
        PERMISSIONS.CUSTOMER_UPDATE,
      ]);
      const plbReportsTool = plb01AllTools.get_recent_reports as unknown as {
        execute: (args: { clusterCode?: string; limit?: number }) => Promise<unknown>;
      };
      capturedHistoryWhere = null;
      const plbReportsRes = await plbReportsTool.execute({ clusterCode: 'PLBBSGGA01' });
      const plbReportsStr = JSON.stringify(plbReportsRes ?? '');
      const hasNoCrossClusterReportData =
        !plbReportsStr.includes('PLBBSGGA01') && !plbReportsStr.includes('Palembang Basuki Rahmat');
      const earlyRejectedReports =
        capturedHistoryWhere === null &&
        hasNoCrossClusterReportData &&
        ((typeof plbReportsRes === 'object' && plbReportsRes !== null && 'error' in plbReportsRes) ||
          (Array.isArray(plbReportsRes) && plbReportsRes.length === 0) ||
          (typeof plbReportsRes === 'object' &&
            plbReportsRes !== null &&
            Array.isArray((plbReportsRes as Record<string, unknown>).reports) &&
            ((plbReportsRes as Record<string, unknown>).reports as unknown[]).length === 0));
      const scopedHistoryWhere =
        capturedHistoryWhere !== null && JSON.stringify(capturedHistoryWhere).includes('PLBHRAGA01');
      assert.ok(
        earlyRejectedReports || scopedHistoryWhere,
        `API-06: get_recent_reports must either reject/return empty without PLBBSGGA01 or enforce PLBHRAGA01 in Prisma whereClause when args.clusterCode=PLBBSGGA01 (got where=${JSON.stringify(capturedHistoryWhere)}, res=${plbReportsStr})`,
      );

      const plbWorkloadTool = plb01AllTools.get_technician_workload as unknown as {
        execute: (args: { clusterCode?: string }) => Promise<Array<{ assignedClusters?: string[]; cluster?: string }>>;
      };
      const workloadRes = await plbWorkloadTool.execute({ clusterCode: 'PLBBSGGA01' });
      assert.strictEqual(
        Array.isArray(workloadRes) &&
          workloadRes.some((t) => t.assignedClusters?.includes('PLBBSGGA01') || t.cluster === 'PLBBSGGA01'),
        false,
        `API-06: get_technician_workload must filter out PLBBSGGA01 technicians for PLBHRAGA01 admin, got ${JSON.stringify(workloadRes)}`,
      );

      // 1c. ALL 3 write tools (prepare_create_ticket, prepare_mutate_splitter_port, prepare_toggle_tech_account) must block cross-cluster targets
      restoreFns.push(
        stubMethod(prisma.user, 'findFirst', (async () => ({
          id: crypto.randomUUID(),
          username: 'tech.rizky',
          fullName: 'Rizky Maulana',
          userType: 'TECHNICIAN',
          isActive: true,
          assignedClusters: ['PLBBSGGA01'],
          role: { name: 'Technician', hierarchyLevel: 10 },
        })) as unknown as typeof prisma.user.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma.networkSplitter, 'findFirst', (async () => ({
          id: 'sp-other',
          splitterCode: 'ODP-PLB-010',
          maxPorts: 8,
          cluster: { clusterCode: 'PLBBSGGA01', name: 'Palembang Basuki Rahmat' },
        })) as unknown as typeof prisma.networkSplitter.findFirst),
      );

      const prepTicketTool = plb01AllTools.prepare_create_ticket as unknown as {
        execute: (args: {
          ticketType: 'PSB' | 'MAINTENANCE';
          siaNumber: string;
          techUsername: string;
        }) => Promise<Record<string, unknown>>;
      };
      const prepTicketRes = await prepTicketTool.execute({
        ticketType: 'MAINTENANCE',
        siaNumber: '2025468388',
        techUsername: 'tech.rizky',
      });
      assert.ok(
        'error' in prepTicketRes && !('draftCard' in prepTicketRes),
        `API-06: prepare_create_ticket must reject cross-cluster customer/tech, got ${JSON.stringify(prepTicketRes)}`,
      );

      const prepToggleTool = plb01AllTools.prepare_toggle_tech_account as unknown as {
        execute: (args: {
          techUsername: string;
          setActive: boolean;
          reason: string;
        }) => Promise<Record<string, unknown>>;
      };
      const prepToggleRes = await prepToggleTool.execute({
        techUsername: 'tech.rizky',
        setActive: false,
        reason: 'Cross-cluster test',
      });
      assert.ok(
        'error' in prepToggleRes && !('draftCard' in prepToggleRes),
        `API-06: prepare_toggle_tech_account must reject cross-cluster tech, got ${JSON.stringify(prepToggleRes)}`,
      );

      const prepMutateTool = plb01AllTools.prepare_mutate_splitter_port as unknown as {
        execute: (args: {
          siaNumber: string;
          newSplitterCode: string;
          newPortNumber: number;
        }) => Promise<Record<string, unknown>>;
      };
      const prepMutateRes = await prepMutateTool.execute({
        siaNumber: '2025468388',
        newSplitterCode: 'ODP-PLB-010',
        newPortNumber: 3,
      });
      assert.ok(
        'error' in prepMutateRes && !('draftCard' in prepMutateRes),
        `API-06: prepare_mutate_splitter_port must reject cross-cluster customer/splitter, got ${JSON.stringify(prepMutateRes)}`,
      );

      // 1d. AiService.processChat must enforce <untrusted_data> anti-indirect-prompt-injection guardrail parity with streamChat
      const aiServiceSrc = fs.readFileSync(
        path.join(resolveRepoRoot(), 'apps', 'web', 'src', 'server', 'services', 'ai.service.ts'),
        'utf8',
      );
      const processChatBlock =
        aiServiceSrc.match(/public static async processChat[\s\S]*?public static async confirmAction/)?.[0] || '';
      assert.match(
        processChatBlock,
        /<untrusted_data>/,
        'API-06: AiService.processChat system prompt must include <untrusted_data> anti-indirect-prompt-injection guard matching streamChat',
      );

      // 2. Empty {} input to get_customer_detail must NOT query Prisma with { OR: [{}, {}] }
      const plb01Tools = AiService.getFilteredTools(plb01Admin, [PERMISSIONS.CUSTOMER_READ]);
      const plbCustTool = plb01Tools.get_customer_detail as unknown as {
        execute: (args: { siaNumber?: string; customerName?: string }) => Promise<Record<string, unknown>>;
      };
      capturedCustomerWhere = null;
      await plbCustTool.execute({});
      if (capturedCustomerWhere !== null) {
        assert.doesNotMatch(
          JSON.stringify(capturedCustomerWhere),
          /"OR"\s*:\s*\[\s*\{\s*\}\s*,\s*\{\s*\}\s*\]/,
          'API-06: get_customer_detail must NOT execute Prisma query with empty OR objects [{}, {}]',
        );
      }

      // 3. Oversized AI prompt (>4000 chars) must be rejected 400
      const adminToken = await mintTestJwt(
        {
          username: 'admin.plb01',
          role: 'Admin Operasional',
          userType: 'ADMIN',
          hierarchyLevel: 50,
          assignedClusters: ['PLBHRAGA01'],
          permissions: [PERMISSIONS.AI_USE, PERMISSIONS.CUSTOMER_UPDATE, PERMISSIONS.TECH_MANAGE],
          tokenType: 'access',
        },
        { subject: adminId, audience: 'web' },
      );
      const longPromptRes = await aiChatPost(
        createNextRequest('http://localhost:3000/api/v1/admin/ai/chat', {
          method: 'POST',
          headers: { 'x-real-ip': '203.0.113.71' },
          cookies: { fiberops_session: adminToken },
          jsonBody: { message: 'A'.repeat(4001) },
        }),
      );
      assert.strictEqual(
        longPromptRes.status,
        400,
        `API-06: AI prompt > 4000 chars must return 400, got ${longPromptRes.status}`,
      );

      // 4. confirm-action targeting cross-cluster SIA must return 403
      restoreFns.push(
        stubMethod(prisma.customer, 'findUnique', (async () => ({
          id: crypto.randomUUID(),
          siaNumber: '2023352738',
          fullName: 'Cross Cluster Cust',
          cluster: { name: 'Palembang Basuki Rahmat', clusterCode: 'PLBBSGGA01' },
          splitter: null,
          tickets: [],
          attenuations: [],
        })) as unknown as typeof prisma.customer.findUnique),
      );
      restoreFns.push(
        stubMethod(CustomerService, 'getCustomerBySia', async () => ({
          customer: {
            id: crypto.randomUUID(),
            siaNumber: '2023352738',
            fullName: 'Cross Cluster Cust',
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
      restoreFns.push(
        stubMethod(redisManager, 'markActionTokenUsed', async () => true),
      );

      const crossActionToken = await generateSignedActionToken(
        'MUTATE_SPLITTER_PORT',
        { siaNumber: '2023352738', newSplitterCode: 'ODP-PLB-010', newPortNumber: 3 },
        adminId,
      );
      const confirmRes = await aiConfirmPost(
        createNextRequest('http://localhost:3000/api/v1/admin/ai/confirm-action', {
          method: 'POST',
          cookies: { fiberops_session: adminToken },
          jsonBody: {
            actionToken: crossActionToken,
            actionType: 'MUTATE_SPLITTER_PORT',
            payload: { siaNumber: '2023352738', newSplitterCode: 'ODP-PLB-010', newPortNumber: 3 },
          },
        }),
      );
      assert.strictEqual(
        confirmRes.status,
        403,
        `API-06: confirm-action targeting cross-cluster customer must return 403, got ${confirmRes.status}`,
      );

      // 4b. confirm-action CREATE_TICKET targeting cross-cluster SIA must return 403
      const crossCreateTicketToken = await generateSignedActionToken(
        'CREATE_TICKET',
        {
          ticketType: 'MAINTENANCE',
          siaNumber: '2023352738',
          customerName: 'Cross Cluster Cust',
          clusterCode: 'PLBBSGGA01',
          assignedTechUsername: 'tech.rizky',
        },
        adminId,
      );
      const confirmCreateCrossRes = await aiConfirmPost(
        createNextRequest('http://localhost:3000/api/v1/admin/ai/confirm-action', {
          method: 'POST',
          cookies: { fiberops_session: adminToken },
          jsonBody: {
            actionToken: crossCreateTicketToken,
            actionType: 'CREATE_TICKET',
            payload: { ticketType: 'MAINTENANCE', siaNumber: '2023352738' },
          },
        }),
      );
      assert.strictEqual(
        confirmCreateCrossRes.status,
        403,
        `API-06: confirm-action CREATE_TICKET targeting cross-cluster SIA must return 403, got ${confirmCreateCrossRes.status}`,
      );

      // 4c. confirm-action TOGGLE_TECH_ACCOUNT targeting cross-cluster tech must return 403
      const crossToggleToken = await generateSignedActionToken(
        'TOGGLE_TECH_ACCOUNT',
        { techUsername: 'tech.rizky', setActive: false, reason: 'Cross-cluster' },
        adminId,
      );
      const confirmToggleCrossRes = await aiConfirmPost(
        createNextRequest('http://localhost:3000/api/v1/admin/ai/confirm-action', {
          method: 'POST',
          cookies: { fiberops_session: adminToken },
          jsonBody: {
            actionToken: crossToggleToken,
            actionType: 'TOGGLE_TECH_ACCOUNT',
            payload: { techUsername: 'tech.rizky', setActive: false, reason: 'Cross-cluster' },
          },
        }),
      );
      assert.strictEqual(
        confirmToggleCrossRes.status,
        403,
        `API-06: confirm-action TOGGLE_TECH_ACCOUNT targeting cross-cluster tech must return 403, got ${confirmToggleCrossRes.status}`,
      );

      // 4d. confirm-action MUTATE_SPLITTER_PORT: in-cluster customer moved to cross-cluster target splitter must return 403
      restoreFns.push(
        stubMethod(prisma.customer, 'findUnique', (async () => ({
          id: crypto.randomUUID(),
          siaNumber: '100245',
          fullName: 'In Cluster Cust',
          cluster: { name: 'Palembang H. R. Agam', clusterCode: 'PLBHRAGA01' },
          splitter: null,
          tickets: [],
          attenuations: [],
        })) as unknown as typeof prisma.customer.findUnique),
      );
      restoreFns.push(
        stubMethod(CustomerService, 'getCustomerBySia', async () => ({
          customer: {
            id: crypto.randomUUID(),
            siaNumber: '100245',
            fullName: 'In Cluster Cust',
            address: 'Jl. HR Agam',
            cluster: 'Palembang H. R. Agam',
            clusterCode: 'PLBHRAGA01',
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
      const crossSplitterToken = await generateSignedActionToken(
        'MUTATE_SPLITTER_PORT',
        { siaNumber: '100245', newSplitterCode: 'ODP-PLB-010', newPortNumber: 3 },
        adminId,
      );
      const confirmCrossSplitterRes = await aiConfirmPost(
        createNextRequest('http://localhost:3000/api/v1/admin/ai/confirm-action', {
          method: 'POST',
          cookies: { fiberops_session: adminToken },
          jsonBody: {
            actionToken: crossSplitterToken,
            actionType: 'MUTATE_SPLITTER_PORT',
            payload: { siaNumber: '100245', newSplitterCode: 'ODP-PLB-010', newPortNumber: 3 },
          },
        }),
      );
      assert.strictEqual(
        confirmCrossSplitterRes.status,
        403,
        `API-06: confirm-action moving in-cluster customer to cross-cluster target splitter must return 403, got ${confirmCrossSplitterRes.status}`,
      );

      // 4e. confirm-action actor mismatch (drafter !== confirming admin) must return 403
      const otherAdminToken = await generateSignedActionToken(
        'CREATE_TICKET',
        { ticketType: 'PSB', siaNumber: '100245' },
        crypto.randomUUID(),
      );
      const actorMismatchRes = await aiConfirmPost(
        createNextRequest('http://localhost:3000/api/v1/admin/ai/confirm-action', {
          method: 'POST',
          cookies: { fiberops_session: adminToken },
          jsonBody: {
            actionToken: otherAdminToken,
            actionType: 'CREATE_TICKET',
            payload: { ticketType: 'PSB', siaNumber: '100245' },
          },
        }),
      );
      assert.strictEqual(
        actorMismatchRes.status,
        403,
        `API-06: confirm-action actor mismatch must return 403, got ${actorMismatchRes.status}`,
      );

      // 5. AiService.confirmAction TOGGLE_TECH_ACCOUNT must pass adminContext.userId to TechnicianService.toggleTechnicianStatus
      let capturedActorId: string | undefined;
      restoreFns.push(
        stubMethod(TechnicianService, 'toggleTechnicianStatus', async (_u, _s, _r, actorId) => {
          capturedActorId = actorId;
          return {
            id: crypto.randomUUID(),
            username: 'tech.andi',
            fullName: 'Andi Pratama',
            cluster: 'PLBHRAGA01',
            initials: 'AP',
            isActive: false,
            activeTicketsCount: 0,
            completedTicketsCount: 0,
          };
        }),
      );
      restoreFns.push(
        stubMethod(prisma.activityLog, 'create', (async () => ({ id: 'log-ai' })) as unknown as typeof prisma.activityLog.create),
      );
      const toggleToken = await generateSignedActionToken(
        'TOGGLE_TECH_ACCOUNT',
        { techUsername: 'tech.andi', setActive: false, reason: 'Audit' },
        adminId,
      );
      await AiService.confirmAction(toggleToken, plb01Admin);
      assert.strictEqual(
        capturedActorId,
        adminId,
        `API-06: confirmAction must forward adminContext.userId (${adminId}) to toggleTechnicianStatus, got ${capturedActorId}`,
      );
    });
  });

  it('API-07: restricts /admin/network/import to SUPER_ADMIN / assigned clusters, rejects .xls OLE2, and enforces rate limit', async () => {
    const superAdminId = crypto.randomUUID();
    const clusterAdminId = crypto.randomUUID();

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

    const clusterAdminToken = await mintTestJwt(
      {
        username: 'admin.plb01',
        role: 'Admin Operasional',
        userType: 'ADMIN',
        hierarchyLevel: 50,
        assignedClusters: ['PLBHRAGA01'],
        permissions: [PERMISSIONS.NETWORK_UPDATE],
        tokenType: 'access',
      },
      { subject: clusterAdminId, audience: 'web' },
    );

    // 1. Valid SUPER_ADMIN .xlsx dryRun succeeds (200)
    const validXlsx = await buildMinimalValidXlsxBuffer('PLBHRAGA01');
    const fdValid = new FormData();
    fdValid.append(
      'file',
      new File([new Uint8Array(validXlsx)], 'datek.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
    const validRes = await networkImportPost(
      createMultipartNextRequest(
        'http://localhost:3000/api/v1/admin/network/import?dryRun=true',
        fdValid,
        { cookie: `fiberops_session=${superToken}` },
      ),
    );
    assert.strictEqual(validRes.status, 200);

    // 2. Non-SUPER_ADMIN cluster-scoped admin importing cross-cluster PLBBSGGA01 data MUST fail 403
    const crossClusterXlsx = await buildMinimalValidXlsxBuffer('PLBBSGGA01');
    const fdCross = new FormData();
    fdCross.append(
      'file',
      new File([new Uint8Array(crossClusterXlsx)], 'cross.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
    const crossRes = await networkImportPost(
      createMultipartNextRequest(
        'http://localhost:3000/api/v1/admin/network/import?dryRun=true',
        fdCross,
        { cookie: `fiberops_session=${clusterAdminToken}` },
      ),
    );
    assert.strictEqual(
      crossRes.status,
      403,
      `API-07: Non-SUPER_ADMIN importing out-of-cluster Datek must return 403, got ${crossRes.status}`,
    );

    // 3. Legacy .xls / OLE2 magic bytes disguised as .xlsx must return 415
    const ole2Spoof = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00]);
    const fdOle = new FormData();
    fdOle.append('file', new File([ole2Spoof], 'legacy.xlsx', { type: 'application/octet-stream' }));
    const oleRes = await networkImportPost(
      createMultipartNextRequest(
        'http://localhost:3000/api/v1/admin/network/import?dryRun=true',
        fdOle,
        { cookie: `fiberops_session=${superToken}` },
      ),
    );
    assert.strictEqual(oleRes.status, 415);

    // 3b. Prototype pollution header test on CSV and XLSX must NOT pollute Object.prototype
    const protoCsv = '__proto__,constructor,prototype,SIA,CUSTOMER NAME,NODE AKSES GPON\npolluted,polluted,polluted,2026990011,Safe Cust,PLBHRAGA01\n';
    const fdProtoCsv = new FormData();
    fdProtoCsv.append('file', new File([Buffer.from(protoCsv)], 'proto.csv', { type: 'text/csv' }));
    const protoCsvRes = await networkImportPost(
      createMultipartNextRequest(
        'http://localhost:3000/api/v1/admin/network/import?dryRun=true',
        fdProtoCsv,
        { cookie: `fiberops_session=${superToken}`, 'x-real-ip': '203.0.113.86' },
      ),
    );
    assert.strictEqual(protoCsvRes.status, 200);
    assert.strictEqual(({} as Record<string, unknown>).polluted, undefined);

    const webRequire = createRequire(`${resolveRepoRoot()}/apps/web/package.json`);
    const ExcelJS = webRequire('exceljs') as typeof import('exceljs');
    const protoWb = new ExcelJS.Workbook();
    const protoWs = protoWb.addWorksheet('GPON PLB');
    protoWs.addRow(['__proto__', 'constructor', 'SIA', 'CUSTOMER NAME', 'NODE AKSES GPON']);
    protoWs.addRow(['polluted', 'polluted', '2026990012', 'Safe Xlsx', 'PLBHRAGA01']);
    const protoXlsxBuf = Buffer.from(await protoWb.xlsx.writeBuffer());
    const fdProtoXlsx = new FormData();
    fdProtoXlsx.append(
      'file',
      new File([new Uint8Array(protoXlsxBuf)], 'proto.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
    const protoXlsxRes = await networkImportPost(
      createMultipartNextRequest(
        'http://localhost:3000/api/v1/admin/network/import?dryRun=true',
        fdProtoXlsx,
        { cookie: `fiberops_session=${superToken}`, 'x-real-ip': '203.0.113.87' },
      ),
    );
    assert.strictEqual(protoXlsxRes.status, 200);
    assert.strictEqual(({} as Record<string, unknown>).polluted, undefined);

    // 3c. Non-dryRun (?dryRun=false) cross-cluster import must return 403 without starting DB transaction
    await withMockTcpDbServer(async () => {
      let txStarted = false;
      restoreFns.push(
        stubMethod(prisma.user, 'findUnique', (async () => ({
          id: clusterAdminId,
          username: 'admin.plb01',
          fullName: 'Admin PLB01',
          userType: 'ADMIN',
          isActive: true,
          assignedClusters: ['PLBHRAGA01'],
          role: { name: 'Admin Operasional', hierarchyLevel: 50, permissions: [PERMISSIONS.NETWORK_UPDATE] },
        })) as unknown as typeof prisma.user.findUnique),
      );
      restoreFns.push(
        stubMethod(prisma, '$transaction', (async () => {
          txStarted = true;
          throw new Error('Cross-cluster non-dryRun import must not reach transaction');
        }) as unknown as typeof prisma.$transaction),
      );

      const fdNonDryCross = new FormData();
      fdNonDryCross.append(
        'file',
        new File([new Uint8Array(crossClusterXlsx)], 'cross-commit.xlsx', {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      );
      const nonDryCrossRes = await networkImportPost(
        createMultipartNextRequest(
          'http://localhost:3000/api/v1/admin/network/import?dryRun=false',
          fdNonDryCross,
          { cookie: `fiberops_session=${clusterAdminToken}`, 'x-real-ip': '203.0.113.89' },
        ),
      );
      assert.strictEqual(
        nonDryCrossRes.status,
        403,
        `API-07: Non-SUPER_ADMIN ?dryRun=false with cross-cluster data must return 403, got ${nonDryCrossRes.status}`,
      );
      assert.strictEqual(txStarted, false);
    });

    // 4. Rate limiting on repeated import bursts -> 429
    let hit429 = false;
    for (let i = 0; i < 12; i++) {
      const fdBurst = new FormData();
      fdBurst.append('file', new File([Buffer.from('SIA,NODE AKSES GPON\n20261,PLBHRAGA01\n')], 'b.csv', { type: 'text/csv' }));
      const res = await networkImportPost(
        createMultipartNextRequest(
          'http://localhost:3000/api/v1/admin/network/import?dryRun=true',
          fdBurst,
          { cookie: `fiberops_session=${superToken}`, 'x-real-ip': '203.0.113.88' },
        ),
      );
      if (res.status === 429) {
        hit429 = true;
        break;
      }
    }
    assert.strictEqual(hit429, true, 'API-07: Burst requests to /admin/network/import must trigger 429 rate limit');
  });

  it('API-08: enforces auth on /tech/upload-url and magic-byte + size validation on image uploads', async () => {
    const techId = crypto.randomUUID();
    const deviceId = crypto.randomUUID();
    const superAdminId = crypto.randomUUID();
    const techToken = await mintTestJwt(
      {
        username: 'tech.andi',
        role: 'Vendor / Teknisi Lapangan',
        userType: 'TECHNICIAN',
        hierarchyLevel: 10,
        assignedClusters: ['PLBHRAGA01'],
        deviceId,
        tokenType: 'access',
      },
      { subject: techId, audience: 'mobile' },
    );
    const superToken = await mintTestJwt(
      {
        username: 'superadmin',
        role: 'Super Admin',
        userType: 'SUPER_ADMIN',
        hierarchyLevel: 100,
        assignedClusters: ['PLBHRAGA01'],
        permissions: ['*'],
        tokenType: 'access',
      },
      { subject: superAdminId, audience: 'web' },
    );

    // 1. Unauthenticated / spoofed x-user-id POST /api/v1/tech/upload-url MUST return 401
    const unauthUploadUrlRes = await techUploadUrlPost(
      createNextRequest('http://localhost:3000/api/v1/tech/upload-url', {
        method: 'POST',
        headers: { 'x-user-id': techId },
        jsonBody: { ticketId: 'wo-2025-0842', submissionId: crypto.randomUUID() },
      }),
    );
    assert.strictEqual(
      unauthUploadUrlRes.status,
      401,
      `API-08: Unauthenticated POST /tech/upload-url (even with spoofed x-user-id) must return 401, got ${unauthUploadUrlRes.status}`,
    );

    await withMockTcpDbServer(async () => {
      const ticket55Id = crypto.randomUUID();
      const unassignedTicketId = crypto.randomUUID();
      const missingTicketId = crypto.randomUUID();

      restoreFns.push(
        stubMethod(prisma.user, 'findUnique', (async () => ({
          id: techId,
          username: 'tech.andi',
          fullName: 'Andi Pratama',
          userType: 'TECHNICIAN',
          isActive: true,
          assignedClusters: ['PLBHRAGA01'],
          role: { name: 'Technician', hierarchyLevel: 10, permissions: ['ticket:read', 'ticket:submit'] },
        })) as unknown as typeof prisma.user.findUnique),
      );
      restoreFns.push(
        stubMethod(prisma.userSession, 'findFirst', (async () => ({
          id: crypto.randomUUID(),
        })) as unknown as typeof prisma.userSession.findFirst),
      );
      // Stub DB ticket queries directly (NOT TicketService.listTickets) so >50-row bypasses are caught
      restoreFns.push(
        stubMethod(prisma.ticket, 'findMany', (async () => [
          {
            id: 'wo-2025-0842',
            ticketNumber: 'WO-2025-0842',
            ticketType: 'MAINTENANCE',
            status: 'IN_PROGRESS',
            createdAt: new Date(),
            assignedTechId: techId,
            customer: {
              fullName: 'PT Sriwijaya',
              siaNumber: '100245',
              address: 'Jl. HR Agam',
              currentAttenuation: -20,
              cluster: { name: 'Palembang H. R. Agam', clusterCode: 'PLBHRAGA01' },
              splitter: null,
            },
            assignedTech: {
              id: techId,
              username: 'tech.andi',
              fullName: 'Andi Pratama',
              vendorCompany: 'PT Mitra',
            },
          },
        ]) as unknown as typeof prisma.ticket.findMany),
      );
      restoreFns.push(
        stubMethod(prisma.ticket, 'findFirst', (async (args?: { where?: { OR?: Array<{ id?: string; ticketNumber?: string }> } }) => {
          const idOrNum = args?.where?.OR?.[0]?.id || args?.where?.OR?.[1]?.ticketNumber;
          if (idOrNum === missingTicketId) {
            return null;
          }
          if (idOrNum === unassignedTicketId) {
            return {
              id: unassignedTicketId,
              ticketNumber: 'WO-UNASSIGNED-UP',
              ticketType: 'PSB',
              status: 'OPEN',
              assignedTechId: null,
              createdAt: new Date(),
              customer: {
                fullName: 'Unassigned Cust',
                siaNumber: '100299',
                address: 'Jl. HR Agam',
                currentAttenuation: -20,
                cluster: { name: 'Palembang H. R. Agam', clusterCode: 'PLBHRAGA01' },
                splitter: null,
              },
              assignedTech: null,
            };
          }
          if (idOrNum === ticket55Id) {
            return {
              id: ticket55Id,
              ticketNumber: 'WO-ROW-055',
              ticketType: 'PSB',
              status: 'IN_PROGRESS',
              assignedTechId: techId,
              createdAt: new Date(),
              customer: {
                fullName: 'Row 55 Cust',
                siaNumber: '100255',
                address: 'Jl. HR Agam',
                currentAttenuation: -20,
                cluster: { name: 'Palembang H. R. Agam', clusterCode: 'PLBHRAGA01' },
                splitter: null,
              },
              assignedTech: {
                id: techId,
                username: 'tech.andi',
                fullName: 'Andi Pratama',
                vendorCompany: 'PT Mitra',
              },
            };
          }
          return {
            id: 'wo-2025-0842',
            ticketNumber: 'WO-2025-0842',
            ticketType: 'MAINTENANCE',
            status: 'IN_PROGRESS',
            assignedTechId: techId,
            createdAt: new Date(),
            customer: {
              fullName: 'PT Sriwijaya',
              siaNumber: '100245',
              address: 'Jl. HR Agam',
              currentAttenuation: -20,
              cluster: { name: 'Palembang H. R. Agam', clusterCode: 'PLBHRAGA01' },
              splitter: null,
            },
            assignedTech: {
              id: techId,
              username: 'tech.andi',
              fullName: 'Andi Pratama',
              vendorCompany: 'PT Mitra',
            },
          };
        }) as unknown as typeof prisma.ticket.findFirst),
      );
      restoreFns.push(
        stubMethod(minioManager, 'putObjectBuffer', async (key: string) => ({
          stored: true,
          objectKey: key,
        })),
      );
      restoreFns.push(
        stubMethod(minioManager, 'generatePresignedPutUrl', async (key: string) => {
          return `https://minio.local/fiberops-proofs/${key}?X-Amz-Signature=putsig`;
        }),
      );

      // 1b. Authenticated POST /api/v1/tech/upload-url checks (unassigned 403, missing 404, MIME lock 400/415, valid JPEG 200)
      const uploadUrlUnassignedRes = await techUploadUrlPost(
        createNextRequest('http://localhost:3000/api/v1/tech/upload-url', {
          method: 'POST',
          headers: { authorization: `Bearer ${techToken}`, 'x-device-id': deviceId },
          jsonBody: { ticketId: unassignedTicketId, submissionId: crypto.randomUUID(), contentType: 'image/jpeg' },
        }),
      );
      assert.strictEqual(
        uploadUrlUnassignedRes.status,
        403,
        `API-08: Authenticated /tech/upload-url on unassigned ticket must return 403, got ${uploadUrlUnassignedRes.status}`,
      );

      const uploadUrlMissingRes = await techUploadUrlPost(
        createNextRequest('http://localhost:3000/api/v1/tech/upload-url', {
          method: 'POST',
          headers: { authorization: `Bearer ${techToken}`, 'x-device-id': deviceId },
          jsonBody: { ticketId: missingTicketId, submissionId: crypto.randomUUID(), contentType: 'image/jpeg' },
        }),
      );
      assert.ok(
        uploadUrlMissingRes.status === 404 || uploadUrlMissingRes.status === 403,
        `API-08: Authenticated /tech/upload-url on missing ticket must fail closed (404/403), got ${uploadUrlMissingRes.status}`,
      );

      for (const badMime of ['text/html', 'image/svg+xml']) {
        const mimeLockRes = await techUploadUrlPost(
          createNextRequest('http://localhost:3000/api/v1/tech/upload-url', {
            method: 'POST',
            headers: { authorization: `Bearer ${techToken}`, 'x-device-id': deviceId },
            jsonBody: { ticketId: 'wo-2025-0842', submissionId: crypto.randomUUID(), contentType: badMime },
          }),
        );
        assert.ok(
          mimeLockRes.status === 400 || mimeLockRes.status === 415,
          `API-08: /tech/upload-url must reject ${badMime} (400/415), got ${mimeLockRes.status}`,
        );
      }

      const validUploadUrlRes = await techUploadUrlPost(
        createNextRequest('http://localhost:3000/api/v1/tech/upload-url', {
          method: 'POST',
          headers: { authorization: `Bearer ${techToken}`, 'x-device-id': deviceId },
          jsonBody: { ticketId: 'wo-2025-0842', submissionId: crypto.randomUUID(), contentType: 'image/jpeg' },
        }),
      );
      assert.strictEqual(validUploadUrlRes.status, 200);

      // 2. Spoofed SVG/HTML disguised with Content-Type: image/jpeg on /tech/tickets/[id]/upload MUST return 415
      const svgPayload = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');
      const fdSvg = new FormData();
      fdSvg.append('file', new File([svgPayload], 'xss.jpg', { type: 'image/jpeg' }));
      const svgRes = await techUploadPost(
        createMultipartNextRequest(
          'http://localhost:3000/api/v1/tech/tickets/wo-2025-0842/upload',
          fdSvg,
          { authorization: `Bearer ${techToken}`, 'x-device-id': deviceId },
        ),
        { params: Promise.resolve({ id: 'wo-2025-0842' }) },
      );
      assert.strictEqual(
        svgRes.status,
        415,
        `API-08: Spoofed SVG with image/jpeg Content-Type must fail magic-byte check with 415, got ${svgRes.status}`,
      );

      // 3. Spoofed HTML and 5MB+1 size limit on /admin/customers/photo MUST return 415 / 413
      restoreFns.push(
        stubMethod(prisma.customer, 'findUnique', (async () => ({
          id: crypto.randomUUID(),
          siaNumber: '100245',
          photoObjectKey: null,
          photoCaption: null,
        })) as unknown as typeof prisma.customer.findUnique),
      );
      const htmlPayload = Buffer.from('<!DOCTYPE html><script>alert(document.cookie)</script>');
      const fdHtml = new FormData();
      fdHtml.append('siaNumber', '100245');
      fdHtml.append('file', new File([htmlPayload], 'xss.png', { type: 'image/png' }));
      const htmlRes = await customerPhotoPost(
        createMultipartNextRequest(
          'http://localhost:3000/api/v1/admin/customers/photo',
          fdHtml,
          { cookie: `fiberops_session=${superToken}` },
        ),
      );
      assert.strictEqual(
        htmlRes.status,
        415,
        `API-08: Spoofed HTML on /admin/customers/photo must fail magic-byte check with 415, got ${htmlRes.status}`,
      );

      const over5MbCust = createMockJpegBuffer(5 * 1024 * 1024 + 1);
      const fdOverCust = new FormData();
      fdOverCust.append('siaNumber', '100245');
      fdOverCust.append('file', new File([new Uint8Array(over5MbCust)], 'huge.jpg', { type: 'image/jpeg' }));
      const overCustRes = await customerPhotoPost(
        createMultipartNextRequest(
          'http://localhost:3000/api/v1/admin/customers/photo',
          fdOverCust,
          { cookie: `fiberops_session=${superToken}` },
        ),
      );
      assert.strictEqual(
        overCustRes.status,
        413,
        `API-08: >5MB upload on /admin/customers/photo must return 413, got ${overCustRes.status}`,
      );

      // 4. Valid JPEG & PNG magic bytes succeed (201)
      const fdValidJpg = new FormData();
      fdValidJpg.append('file', new File([new Uint8Array(createMockJpegBuffer(2048))], 'opm.jpg', { type: 'image/jpeg' }));
      const validJpgRes = await techUploadPost(
        createMultipartNextRequest(
          'http://localhost:3000/api/v1/tech/tickets/wo-2025-0842/upload',
          fdValidJpg,
          { authorization: `Bearer ${techToken}`, 'x-device-id': deviceId },
        ),
        { params: Promise.resolve({ id: 'wo-2025-0842' }) },
      );
      assert.strictEqual(validJpgRes.status, 201);

      const fdValidPng = new FormData();
      fdValidPng.append('file', new File([new Uint8Array(createMockPngBuffer(2048))], 'opm.png', { type: 'image/png' }));
      const validPngRes = await techUploadPost(
        createMultipartNextRequest(
          'http://localhost:3000/api/v1/tech/tickets/wo-2025-0842/upload',
          fdValidPng,
          { authorization: `Bearer ${techToken}`, 'x-device-id': deviceId },
        ),
        { params: Promise.resolve({ id: 'wo-2025-0842' }) },
      );
      assert.strictEqual(validPngRes.status, 201);

      // 5. API-10: Upload to ticket #55 (beyond 50-row listTickets) succeeds (201) & unassigned ticket upload fails (403)
      const fdTicket55 = new FormData();
      fdTicket55.append('file', new File([new Uint8Array(createMockJpegBuffer(1024))], 't55.jpg', { type: 'image/jpeg' }));
      const upload55Res = await techUploadPost(
        createMultipartNextRequest(
          `http://localhost:3000/api/v1/tech/tickets/${ticket55Id}/upload`,
          fdTicket55,
          { authorization: `Bearer ${techToken}`, 'x-device-id': deviceId },
        ),
        { params: Promise.resolve({ id: ticket55Id }) },
      );
      assert.strictEqual(
        upload55Res.status,
        201,
        `API-10: /tech/tickets/[id]/upload must resolve ticket #55 directly (beyond 50-row listTickets), got ${upload55Res.status}`,
      );

      const fdUnassigned = new FormData();
      fdUnassigned.append('file', new File([new Uint8Array(createMockJpegBuffer(1024))], 'un.jpg', { type: 'image/jpeg' }));
      const uploadUnassignedRes = await techUploadPost(
        createMultipartNextRequest(
          `http://localhost:3000/api/v1/tech/tickets/${unassignedTicketId}/upload`,
          fdUnassigned,
          { authorization: `Bearer ${techToken}`, 'x-device-id': deviceId },
        ),
        { params: Promise.resolve({ id: unassignedTicketId }) },
      );
      assert.strictEqual(
        uploadUnassignedRes.status,
        403,
        `API-10: /tech/tickets/[id]/upload on unassigned ticket must return 403, got ${uploadUnassignedRes.status}`,
      );
    });
  });

  it('API-09: blocks cross-cluster ODP port hijack and rejects arbitrary external/traversal photoObjectKey', async () => {
    const { submitTicketSchema, createCustomerSchema, updateCustomerSchema } = await import('@repo/shared');

    // 1. submitTicketSchema & updateCustomerSchema must reject external https://evil.com and ../ traversal photoObjectKey
    const badSubmitExternal = submitTicketSchema.safeParse({
      submissionId: crypto.randomUUID(),
      splitterId: 'ODP-PLB-001',
      portNumber: 1,
      attenuationDbm: -19.5,
      photoObjectKey: 'https://evil.com/payload.html',
      submittedLat: -2.9833,
      submittedLng: 104.7644,
      isMockLocation: false,
    });
    assert.strictEqual(
      badSubmitExternal.success,
      false,
      'API-09: submitTicketSchema must reject arbitrary external https:// URL in photoObjectKey',
    );

    const badUpdateExternal = updateCustomerSchema.safeParse({
      siaNumber: '100245',
      photoObjectKey: 'https://evil.com/payload.html',
    });
    assert.strictEqual(
      badUpdateExternal.success,
      false,
      'API-09: updateCustomerSchema must reject arbitrary external https:// URL in photoObjectKey',
    );

    const badCustTraversal = createCustomerSchema.safeParse({
      siaNumber: 'SIA-990011',
      fullName: 'Test Customer',
      address: 'Jl. Merdeka Palembang',
      clusterCode: 'PLBHRAGA01',
      photoObjectKey: 'proofs/../../secret.txt',
    });
    assert.strictEqual(badCustTraversal.success, false, 'API-09: createCustomerSchema must reject .. traversal');

    // 2. Cross-cluster ODP splitter assignment in POST & PATCH (mutateSplitterPort) /api/v1/admin/customers must be rejected (403/400)
    const adminId = crypto.randomUUID();
    const adminToken = await mintTestJwt(
      {
        username: 'admin.plb01',
        role: 'Admin Operasional',
        userType: 'ADMIN',
        hierarchyLevel: 50,
        assignedClusters: ['PLBHRAGA01'],
        permissions: [PERMISSIONS.CUSTOMER_UPDATE],
        tokenType: 'access',
      },
      { subject: adminId, audience: 'web' },
    );

    await withMockTcpDbServer(async () => {
      restoreFns.push(
        stubMethod(prisma.user, 'findUnique', (async () => ({
          id: adminId,
          username: 'admin.plb01',
          fullName: 'Admin PLB01',
          userType: 'ADMIN',
          isActive: true,
          assignedClusters: ['PLBHRAGA01'],
          role: { name: 'Admin Operasional', hierarchyLevel: 50, permissions: [PERMISSIONS.CUSTOMER_UPDATE] },
        })) as unknown as typeof prisma.user.findUnique),
      );
      restoreFns.push(
        stubMethod(prisma.customer, 'findUnique', (async (args?: { where?: { siaNumber?: string } }) => {
          if (args?.where?.siaNumber === '100245') {
            return {
              id: 'cust-in-01',
              siaNumber: '100245',
              fullName: 'In Cluster Customer',
              address: 'Jl. HR Agam',
              status: 'ACTIVE',
              portNumber: 1,
              currentAttenuation: -20,
              updatedAt: new Date(),
              cluster: { id: 'cl-plb01', clusterCode: 'PLBHRAGA01', name: 'Palembang H. R. Agam' },
              splitter: { id: 'sp-in-01', splitterCode: 'ODP-PLB-001' },
              tickets: [],
              attenuations: [],
            };
          }
          return null;
        }) as unknown as typeof prisma.customer.findUnique),
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
          id: 'sp-other',
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
        stubMethod(prisma.customer, 'create', (async () => {
          throw new Error('Cross-cluster splitter must NOT allow customer.create');
        }) as unknown as typeof prisma.customer.create),
      );
      restoreFns.push(
        stubMethod(prisma.customer, 'update', (async () => {
          throw new Error('Cross-cluster splitter must NOT allow customer.update via mutateSplitterPort');
        }) as unknown as typeof prisma.customer.update),
      );

      const hijackPortRes = await customersPost(
        createNextRequest('http://localhost:3000/api/v1/admin/customers', {
          method: 'POST',
          cookies: { fiberops_session: adminToken },
          jsonBody: {
            siaNumber: '2026778899',
            fullName: 'Cross Cluster Hijack',
            address: 'Jl. HR Agam No 10',
            clusterCode: 'PLBHRAGA01',
            splitterCode: 'ODP-PLB-010',
            portNumber: 2,
            status: 'ACTIVE',
          },
        }),
      );
      assert.ok(
        hijackPortRes.status === 400 || hijackPortRes.status === 403,
        `API-09: Assigning customer in PLBHRAGA01 to splitter in PLBBSGGA01 must fail (400/403), got ${hijackPortRes.status}`,
      );

      // 3. PATCH /api/v1/admin/customers (mutateSplitterPort) moving PLBHRAGA01 customer to PLBBSGGA01 splitter must fail 400/403
      const mutateHijackRes = await customersPatch(
        createNextRequest('http://localhost:3000/api/v1/admin/customers', {
          method: 'PATCH',
          cookies: { fiberops_session: adminToken },
          jsonBody: {
            siaNumber: '100245',
            newSplitterCode: 'ODP-PLB-010',
            newPortNumber: 2,
          },
        }),
      );
      assert.ok(
        mutateHijackRes.status === 400 || mutateHijackRes.status === 403,
        `API-09: PATCH mutateSplitterPort moving PLBHRAGA01 customer to PLBBSGGA01 splitter must fail (400/403), got ${mutateHijackRes.status}`,
      );
    });
  });

  it('API-10: blocks unassigned ticket IDOR (assignedTechId === null) and fails closed 503 in STRICT_LIVE_DATA=true when DB offline', async () => {
    const techId = crypto.randomUUID();
    const deviceId = crypto.randomUUID();
    const unassignedTicketId = crypto.randomUUID();
    const techToken = await mintTestJwt(
      {
        username: 'tech.andi',
        role: 'Vendor / Teknisi Lapangan',
        userType: 'TECHNICIAN',
        hierarchyLevel: 10,
        assignedClusters: ['PLBHRAGA01'],
        deviceId,
        tokenType: 'access',
      },
      { subject: techId, audience: 'mobile' },
    );

    // 1. Offline DB + STRICT_LIVE_DATA=true on /api/v1/tech/tickets MUST return 503 (never FALLBACK_TICKETS)
    process.env.STRICT_LIVE_DATA = 'true';
    resetDatabaseHealthCache();
    const strictOfflineRes = await techTicketsGet(
      createNextRequest('http://localhost:3000/api/v1/tech/tickets', {
        headers: { authorization: `Bearer ${techToken}`, 'x-device-id': deviceId },
      }),
    );
    assert.strictEqual(
      strictOfflineRes.status,
      503,
      `API-10: STRICT_LIVE_DATA=true with offline DB must return 503 (not FALLBACK_TICKETS), got ${strictOfflineRes.status}`,
    );

    // 2. Unassigned ticket (assignedTechId === null) on start & submit MUST return 403 IDOR_VIOLATION
    await withMockTcpDbServer(async () => {
      restoreFns.push(
        stubMethod(prisma.user, 'findUnique', (async () => ({
          id: techId,
          username: 'tech.andi',
          fullName: 'Andi Pratama',
          userType: 'TECHNICIAN',
          isActive: true,
          assignedClusters: ['PLBHRAGA01'],
          role: { name: 'Technician', hierarchyLevel: 10, permissions: ['ticket:read', 'ticket:submit'] },
        })) as unknown as typeof prisma.user.findUnique),
      );
      restoreFns.push(
        stubMethod(prisma.userSession, 'findFirst', (async () => ({
          id: crypto.randomUUID(),
        })) as unknown as typeof prisma.userSession.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma.ticket, 'findFirst', (async () => ({
          id: unassignedTicketId,
          ticketNumber: 'WO-UNASSIGNED-01',
          ticketType: 'PSB',
          status: 'OPEN',
          assignedTechId: null,
          createdByAdminId: crypto.randomUUID(),
          customerId: crypto.randomUUID(),
          createdAt: new Date(),
          customer: {
            fullName: 'Unassigned Cust',
            siaNumber: '2026111',
            address: 'Jl. Test',
            cluster: { name: 'Palembang H. R. Agam', clusterCode: 'PLBHRAGA01' },
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
        stubMethod(prisma.ticket, 'update', (async () => ({
          id: unassignedTicketId,
          ticketNumber: 'WO-UNASSIGNED-01',
          ticketType: 'PSB',
          status: 'IN_PROGRESS',
          createdAt: new Date(),
          customer: {
            fullName: 'Unassigned Cust',
            siaNumber: '2026111',
            address: 'Jl. Test',
            cluster: { name: 'Palembang H. R. Agam', clusterCode: 'PLBHRAGA01' },
            splitter: null,
          },
          assignedTech: null,
        })) as unknown as typeof prisma.ticket.update),
      );
      restoreFns.push(
        stubMethod(prisma.activityLog, 'create', (async () => ({ id: 'log-1' })) as unknown as typeof prisma.activityLog.create),
      );

      const startUnassignedRes = await techStartPost(
        createNextRequest(`http://localhost:3000/api/v1/tech/tickets/${unassignedTicketId}/start`, {
          method: 'POST',
          headers: { authorization: `Bearer ${techToken}`, 'x-device-id': deviceId },
          jsonBody: {},
        }),
        { params: Promise.resolve({ id: unassignedTicketId }) },
      );
      assert.strictEqual(
        startUnassignedRes.status,
        403,
        `API-10: Starting unassigned ticket (assignedTechId=null) must return 403, got ${startUnassignedRes.status}`,
      );

      const submitUnassignedRes = await techSubmitPost(
        createNextRequest(`http://localhost:3000/api/v1/tech/tickets/${unassignedTicketId}/submit`, {
          method: 'POST',
          headers: { authorization: `Bearer ${techToken}`, 'x-device-id': deviceId },
          jsonBody: {
            submissionId: crypto.randomUUID(),
            splitterId: 'ODP-PLB-001',
            portNumber: 1,
            attenuationDbm: -19.2,
            photoObjectKey: 'opm-proofs/2026/02/t-1.jpg',
            submittedLat: -2.9833,
            submittedLng: 104.7644,
            isMockLocation: false,
            clientRecordedAt: new Date().toISOString(),
          },
        }),
        { params: Promise.resolve({ id: unassignedTicketId }) },
      );
      assert.strictEqual(
        submitUnassignedRes.status,
        403,
        `API-10: Submitting unassigned ticket (assignedTechId=null) must return 403, got ${submitUnassignedRes.status}`,
      );
    });
  });

  it('API-11 + MOB-05: requires auth on /tech/error-logs, overrides userId from token, redacts JWT secrets, and enforces rate limit', async () => {
    // 1. Unauthenticated POST /api/v1/tech/error-logs MUST return 401
    const unauthRes = await techErrorLogsPost(
      createNextRequest('http://localhost:3000/api/v1/tech/error-logs', {
        method: 'POST',
        jsonBody: { errorMessage: 'Crash report', userId: 'forged-user' },
      }),
    );
    assert.strictEqual(
      unauthRes.status,
      401,
      `API-11: Unauthenticated POST /tech/error-logs must return 401, got ${unauthRes.status}`,
    );

    const techId = crypto.randomUUID();
    const deviceId = crypto.randomUUID();
    const techToken = await mintTestJwt(
      {
        username: 'tech.andi',
        role: 'Vendor / Teknisi Lapangan',
        userType: 'TECHNICIAN',
        hierarchyLevel: 10,
        assignedClusters: ['PLBHRAGA01'],
        deviceId,
        tokenType: 'access',
      },
      { subject: techId, audience: 'mobile' },
    );

    await withMockTcpDbServer(async () => {
      let persistedLog = null as Record<string, unknown> | null;
      restoreFns.push(
        stubMethod(prisma.user, 'findUnique', (async () => ({
          id: techId,
          username: 'tech.andi',
          fullName: 'Andi Pratama',
          userType: 'TECHNICIAN',
          isActive: true,
          assignedClusters: ['PLBHRAGA01'],
          role: { name: 'Technician', hierarchyLevel: 10, permissions: ['ticket:read', 'ticket:submit'] },
        })) as unknown as typeof prisma.user.findUnique),
      );
      restoreFns.push(
        stubMethod(prisma.userSession, 'findFirst', (async () => ({
          id: crypto.randomUUID(),
        })) as unknown as typeof prisma.userSession.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma.clientErrorLog, 'create', (async (args: { data: Record<string, unknown> }) => {
          persistedLog = args.data;
          return { id: crypto.randomUUID(), createdAt: new Date() };
        }) as unknown as typeof prisma.clientErrorLog.create),
      );

      // 2. Authenticated log with forged userId and embedded Bearer JWT must overwrite userId & redact token
      const validRes = await techErrorLogsPost(
        createNextRequest('http://localhost:3000/api/v1/tech/error-logs', {
          method: 'POST',
          headers: { authorization: `Bearer ${techToken}`, 'x-device-id': deviceId },
          jsonBody: {
            userId: 'victim-admin-id',
            errorMessage: 'Network error with Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sig123',
            stackTrace: 'at ApiClient (token=eyJhbGciOiJIUzI1NiJ9.payload.sig)',
          },
        }),
      );
      assert.strictEqual(validRes.status, 200);
      assert.ok(persistedLog, 'Expected prisma.clientErrorLog.create to be called');
      assert.strictEqual(
        persistedLog!.userId,
        techId,
        `API-11: Persisted userId must come from verified JWT (${techId}), not body.userId`,
      );
      assert.doesNotMatch(
        String(persistedLog!.errorMessage),
        /eyJhbGciOiJIUzI1NiJ9/,
        'API-11: Bearer JWT in errorMessage must be redacted before storage',
      );
      assert.doesNotMatch(
        String(persistedLog!.stackTrace || ''),
        /eyJhbGciOiJIUzI1NiJ9/,
        'API-11: JWT in stackTrace must be redacted before storage',
      );

      // 3. Invalid Zod deviceInfo payload (e.g. non-string object or >200 chars) must return 400
      const invalidZodRes = await techErrorLogsPost(
        createNextRequest('http://localhost:3000/api/v1/tech/error-logs', {
          method: 'POST',
          headers: { authorization: `Bearer ${techToken}`, 'x-device-id': deviceId },
          jsonBody: {
            errorMessage: 'Valid message',
            deviceInfo: { spoofedNested: true },
          },
        }),
      );
      assert.strictEqual(
        invalidZodRes.status,
        400,
        `API-11: Malformed deviceInfo payload must fail Zod validation with 400, got ${invalidZodRes.status}`,
      );

      // 4. Rate limit burst on /api/v1/tech/error-logs must trigger 429
      let hit429 = false;
      for (let i = 0; i < 40; i++) {
        const burstRes = await techErrorLogsPost(
          createNextRequest('http://localhost:3000/api/v1/tech/error-logs', {
            method: 'POST',
            headers: {
              authorization: `Bearer ${techToken}`,
              'x-device-id': deviceId,
              'x-real-ip': '203.0.113.199',
            },
            jsonBody: {
              errorMessage: `Burst log ${i}`,
              deviceInfo: 'Android 14 / SM-A54',
            },
          }),
        );
        if (burstRes.status === 429) {
          hit429 = true;
          break;
        }
      }
      assert.strictEqual(hit429, true, 'API-11: Burst requests to /tech/error-logs must trigger 429 rate limit');
    });
  });

  it('API-14: prevents global aggregate leak in clusters/audit, fail-open !meta in clusters/history, and cleans up SSE stream', async () => {
    const adminId = crypto.randomUUID();
    const adminToken = await mintTestJwt(
      {
        username: 'admin.plb01',
        role: 'Admin Operasional',
        userType: 'ADMIN',
        hierarchyLevel: 50,
        assignedClusters: ['PLBHRAGA01'],
        permissions: [PERMISSIONS.NETWORK_READ, PERMISSIONS.TICKET_READ],
        tokenType: 'access',
      },
      { subject: adminId, audience: 'web' },
    );

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
            permissions: [PERMISSIONS.NETWORK_READ, PERMISSIONS.TICKET_READ],
          },
        })) as unknown as typeof prisma.user.findUnique),
      );
      // 1. clusters/audit must NOT leak global totals across other clusters
      restoreFns.push(
        stubMethod(NetworkService, 'runNetworkAudit', async () => ({
          auditedAt: new Date().toISOString(),
          totalClusters: 4,
          totalSplitters: 90,
          totalPorts: 720,
          usedPorts: 310,
          warningSplitters: 5,
          criticalAttenuationCount: 9,
          doubleBookedPorts: 2,
          geofenceAnomalies: 3,
          findings: [
            {
              id: 'f1',
              severity: 'critical',
              category: 'ATTENUATION',
              clusterCode: 'PLBHRAGA01',
              splitterCode: 'ODP-PLB-001',
              title: 'In-cluster finding',
              description: 'Desc',
            },
            {
              id: 'f2',
              severity: 'critical',
              category: 'ATTENUATION',
              clusterCode: 'PLBBSGGA01',
              splitterCode: 'ODP-PLB-010',
              title: 'Out-of-cluster finding',
              description: 'Desc',
            },
          ],
        })),
      );
      restoreFns.push(
        stubMethod(NetworkService, 'listClusters', async () => [
          {
            id: 'sp-1',
            clusterCode: 'PLBHRAGA01',
            name: 'Palembang H. R. Agam',
            splitterCode: 'ODP-PLB-001',
            usedPorts: 2,
            maxPorts: 8,
            lat: -2.98,
            lng: 104.76,
            ports: [],
          },
          {
            id: 'sp-2',
            clusterCode: 'PLBBSGGA01',
            name: 'Palembang Basuki Rahmat',
            splitterCode: 'ODP-PLB-010',
            usedPorts: 6,
            maxPorts: 8,
            lat: -2.97,
            lng: 104.75,
            ports: [],
          },
        ]),
      );

      const auditRes = await clustersAuditPost(
        createNextRequest('http://localhost:3000/api/v1/admin/clusters/audit', {
          method: 'POST',
          cookies: { fiberops_session: adminToken },
        }),
      );
      assert.strictEqual(auditRes.status, 200);
      const auditJson = (await auditRes.json()) as {
        data: {
          totalClusters: number;
          totalSplitters: number;
          findings: Array<{ clusterCode: string }>;
        };
      };
      assert.strictEqual(auditJson.data.findings.length, 1);
      assert.ok(
        auditJson.data.totalSplitters < 90 && auditJson.data.totalClusters === 1,
        `API-14: Non-global admin clusters/audit must scope aggregate counts (got clusters=${auditJson.data.totalClusters}, splitters=${auditJson.data.totalSplitters})`,
      );

      // 2. clusters/history must exclude entries with unknown splitterCode (!meta) for non-global admin
      restoreFns.push(
        stubMethod(NetworkService, 'getOdpHistoryLogs', async () => [
          {
            id: 'h-in',
            ticketNumber: 'WO-1',
            customerName: 'In Cluster',
            siaNumber: '1001',
            splitterCode: 'ODP-PLB-001',
            portNumber: 1,
            actionType: 'PEMASANGAN',
            oldAttenuation: -20,
            newAttenuation: -19,
            technicianName: 'Andi',
            distanceToSplitterM: 10,
            isLocationFlagged: false,
            timestamp: new Date().toISOString(),
          },
          {
            id: 'h-unknown',
            ticketNumber: 'WO-2',
            customerName: 'Unknown Splitter',
            siaNumber: '1002',
            splitterCode: 'ODP-UNKNOWN-999',
            portNumber: 1,
            actionType: 'MAINTENANCE',
            oldAttenuation: -20,
            newAttenuation: -29,
            technicianName: 'Rizky',
            distanceToSplitterM: 500,
            isLocationFlagged: true,
            timestamp: new Date().toISOString(),
          },
        ]),
      );
      restoreFns.push(
        stubMethod(NetworkService, 'listClusterOptions', async () => [
          {
            id: 'cl-1',
            clusterCode: 'PLBHRAGA01',
            name: 'Palembang H. R. Agam',
            centerLat: -2.98,
            centerLng: 104.76,
            isActive: true,
            splittersCount: 1,
          },
        ]),
      );

      const historyRes = await clustersHistoryGet(
        createNextRequest('http://localhost:3000/api/v1/admin/clusters/history', {
          cookies: { fiberops_session: adminToken },
        }),
      );
      assert.strictEqual(historyRes.status, 200);
      const historyJson = (await historyRes.json()) as {
        data: Array<{ splitterCode: string }>;
      };
      assert.strictEqual(
        historyJson.data.some((e) => e.splitterCode === 'ODP-UNKNOWN-999'),
        false,
        'API-14: clusters/history must fail closed when !meta for non-global admin',
      );

      // 2b. Positive SUPER_ADMIN global audit returns all clusters & findings
      const superAdminId = crypto.randomUUID();
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
      const superAuditRes = await clustersAuditPost(
        createNextRequest('http://localhost:3000/api/v1/admin/clusters/audit', {
          method: 'POST',
          cookies: { fiberops_session: superToken },
        }),
      );
      assert.strictEqual(superAuditRes.status, 200);
      const superAuditJson = (await superAuditRes.json()) as {
        data: { findings: Array<{ clusterCode: string }> };
      };
      assert.strictEqual(
        superAuditJson.data.findings.length,
        2,
        'API-14: SUPER_ADMIN global audit must receive findings across all clusters',
      );

      // 3. SSE connection cap + periodic revocation re-check + clean AbortController teardown (zero hanging timers)
      const webRequire = createRequire(`${resolveRepoRoot()}/apps/web/package.json`);
      const nextServer = webRequire('next/server') as typeof import('next/server');
      const controllers: AbortController[] = [];
      const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
      try {
        let hit429 = false;
        for (let i = 0; i < 6; i++) {
          const ac = new AbortController();
          controllers.push(ac);
          const req = new nextServer.NextRequest(
            'http://localhost:3000/api/v1/admin/stream/reports',
            {
              headers: { cookie: `fiberops_session=${adminToken}` },
              signal: ac.signal,
            },
          );
          const res = await streamReportsGet(req);
          if (res.status === 429) {
            hit429 = true;
            break;
          }
          assert.strictEqual(res.status, 200);
          if (res.body) {
            const reader = res.body.getReader();
            readers.push(reader);
            const chunk = await reader.read();
            const text = new TextDecoder().decode(chunk.value ?? new Uint8Array());
            assert.match(text, /event:\s*connected/);
          }
        }
        assert.strictEqual(
          hit429,
          true,
          'API-14: Opening excessive concurrent SSE streams per user must return 429',
        );
      } finally {
        for (const r of readers) {
          await r.cancel().catch(() => {});
        }
        for (const ac of controllers) {
          ac.abort();
        }
      }

      // 4. Active SSE stream must terminate when admin JWT jti is revoked mid-stream
      const sseJti = crypto.randomUUID();
      const revocableToken = await mintTestJwt(
        {
          username: 'admin.plb01',
          role: 'Admin Operasional',
          userType: 'ADMIN',
          hierarchyLevel: 50,
          assignedClusters: ['PLBHRAGA01'],
          permissions: [PERMISSIONS.NETWORK_READ, PERMISSIONS.TICKET_READ],
          tokenType: 'access',
        },
        { subject: adminId, audience: 'web', jti: sseJti },
      );
      const revAc = new AbortController();
      let revReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      mock.timers.enable({ apis: ['setInterval'] });
      try {
        const revReq = new nextServer.NextRequest(
          'http://localhost:3000/api/v1/admin/stream/reports',
          {
            headers: { cookie: `fiberops_session=${revocableToken}` },
            signal: revAc.signal,
          },
        );
        const revRes = await streamReportsGet(revReq);
        assert.strictEqual(revRes.status, 200);
        revReader = revRes.body?.getReader();
        assert.ok(revReader);
        const firstChunk = await revReader.read();
        assert.match(new TextDecoder().decode(firstChunk.value ?? new Uint8Array()), /event:\s*connected/);

        await redisManager.blacklistSession(sseJti, 300);
        mock.timers.tick(30_000);

        const nextRead = await Promise.race([
          revReader.read(),
          new Promise<{ done: false; value: Uint8Array }>((resolve) =>
            setTimeout(() => resolve({ done: false, value: new TextEncoder().encode('TIMEOUT_NO_CLOSE') }), 50),
          ),
        ]);
        const decoded = new TextDecoder().decode(nextRead.value ?? new Uint8Array());
        assert.ok(
          nextRead.done === true || /revoked/i.test(decoded),
          `API-14: Active SSE stream must terminate on periodic session revocation re-check (got done=${nextRead.done}, data=${decoded})`,
        );
      } finally {
        mock.timers.reset();
        await revReader?.cancel().catch(() => {});
        revAc.abort();
      }
    });
  });
});
