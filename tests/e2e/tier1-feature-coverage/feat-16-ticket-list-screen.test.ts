import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { ERROR_CODES, MOBILE_HISTORY_LIMIT } from '@repo/shared';
import {
  configureOfflineTestEnv,
  closeServerHandles,
  restoreTestEnv,
  mintTestJwt,
  createNextRequest,
  stubMethod,
  OFFLINE_DATABASE_URL,
} from '../helpers/auth-test-harness';

let techTicketsGet: typeof import('@/app/api/v1/tech/tickets/route').GET;
let techMediaPresignGet: typeof import('@/app/api/v1/tech/media/presign/route').GET;
let AuthService: typeof import('@/server/services/auth.service').AuthService;
let TicketService: typeof import('@/server/services/ticket.service').TicketService;
let prisma: typeof import('@repo/database').prisma;
let resetDatabaseHealthCache: typeof import('@repo/database').resetDatabaseHealthCache;

const restoreFns: Array<() => void> = [];

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

describe('Tier 1: Feature 16 - Field Ticket List Screen (apps/mobile/src/screens/TicketListScreen.tsx)', () => {
  const screenPath = path.resolve(
    process.cwd(),
    '../../apps/mobile/src/screens/TicketListScreen.tsx',
  );
  const fileContent = fs.readFileSync(screenPath, 'utf-8');

  before(async () => {
    configureOfflineTestEnv();
    const [ticketsMod, presignMod, authMod, ticketServiceMod, dbMod] = await Promise.all([
      import('@/app/api/v1/tech/tickets/route'),
      import('@/app/api/v1/tech/media/presign/route'),
      import('@/server/services/auth.service'),
      import('@/server/services/ticket.service'),
      import('@repo/database'),
    ]);
    techTicketsGet = ticketsMod.GET;
    techMediaPresignGet = presignMod.GET;
    AuthService = authMod.AuthService;
    TicketService = ticketServiceMod.TicketService;
    prisma = dbMod.prisma;
    resetDatabaseHealthCache = dbMod.resetDatabaseHealthCache;
  });

  afterEach(() => {
    while (restoreFns.length > 0) {
      const restore = restoreFns.pop();
      restore?.();
    }
  });

  after(async () => {
    await closeServerHandles();
    restoreTestEnv();
  });

  it('declares and exports TicketListScreen with MobileTicketItem and SplitterItem contracts', () => {
    assert.ok(fs.existsSync(screenPath), 'TicketListScreen.tsx must exist');
    assert.match(fileContent, /export (function|const) TicketListScreen/);
    assert.match(fileContent, /export interface MobileTicketItem/);
    assert.match(fileContent, /export interface SplitterItem/);
    assert.match(fileContent, /export interface TicketListScreenProps/);
  });

  it('strictly adheres to antislop copywriting with zero em-dashes (—)', () => {
    const emDashPattern = /\u2014|—/g;
    const matches = fileContent.match(emDashPattern);
    assert.strictEqual(
      matches,
      null,
      `Found ${matches?.length || 0} em-dashes in TicketListScreen.tsx. Antislop prohibits em-dashes.`,
    );
  });

  it('provides sticky offline queue banner with manual sync trigger', () => {
    assert.match(fileContent, /offlineQueue\.flush/);
    assert.match(fileContent, /handleManualSync/);
    assert.match(fileContent, /offlineItems/);
  });

  it('supports comprehensive search filtering across ticketNumber, customer name, and SIA', () => {
    assert.match(fileContent, /searchQuery/);
    assert.match(fileContent, /filterType/);
    assert.match(fileContent, /filtersByTab/);
    assert.match(fileContent, /ticketNumber\.toLowerCase\(\)/);
    assert.match(fileContent, /customer\.fullName\.toLowerCase\(\)/);
  });

  it('enforces 4px-8px border radii and strictly zero 9999px pills on cards and badges', () => {
    assert.strictEqual(
      fileContent.includes('9999px') || fileContent.includes('rounded-full'),
      false,
      'TicketListScreen must not use 9999px pill radii',
    );
    const radiusMatches = fileContent.match(/borderRadius:\s*['"]?(\d+)px?['"]?/g) || [];
    for (const match of radiusMatches) {
      const num = parseInt(match.replace(/[^0-9]/g, ''), 10);
      assert.ok(
        num >= 4 && num <= 8,
        `Found border radius ${num}px in TicketListScreen.tsx outside permitted 4-8px range`,
      );
    }
  });

  it('implements completed history task features, audit details (without geofence), OPM presign, and 50-item cap without pagination', () => {
    assert.match(fileContent, /STORAGE_KEY_CACHED_HISTORY_TICKETS/);
    assert.match(fileContent, /@fiberops_cached_history_tickets_v1/);
    assert.match(fileContent, /activeTab/);
    assert.match(fileContent, /Tugas Aktif/);
    assert.match(fileContent, /Riwayat Selesai/);
    assert.match(fileContent, /formatWibDateTime/);
    assert.match(fileContent, /Detail Riwayat Pekerjaan/);
    assert.match(fileContent, /setSelectedHistoryTicket\(null\)/);
    assert.match(fileContent, /selectedHistoryTicket/);
    assert.match(fileContent, /e\.key === 'Escape'/);
    assert.match(fileContent, /role="tabpanel"/);
    assert.match(fileContent, /ArrowRight/);
    assert.match(fileContent, /ArrowLeft/);
    assert.match(fileContent, /\/api\/v1\/tech\/media\/presign/);
    assert.match(fileContent, /historyMeta\?\.technicianNotes/);
    assert.match(fileContent, /createdByAdmin/);
    assert.match(fileContent, /selectedHistoryTicket\.locationPlace/);
    assert.match(fileContent, /extends MobileTicketItemDto/);
    const presignRoutePath = path.resolve(
      process.cwd(),
      'src/app/api/v1/tech/media/presign/route.ts',
    );
    const presignRouteContent = fs.readFileSync(presignRoutePath, 'utf-8');
    assert.match(
      presignRouteContent,
      /TicketService\.presignTechnicianMedia/,
      'GET /api/v1/tech/media/presign must delegate business logic to TicketService (Law 1)',
    );
    assert.strictEqual(
      fileContent.includes('Andi Pratama'),
      false,
      'TicketListScreen must not hardcode technician fallback name',
    );
    assert.strictEqual(
      fileContent.includes('backdropFilter'),
      false,
      'Modal overlay must avoid backdropFilter blur per antislop dialog rules',
    );
    assert.strictEqual(
      fileContent.includes('distanceToSplitterM') || fileContent.includes('isLocationFlagged'),
      false,
      'History detail UI must omit geofence status fields per requirement',
    );
    assert.strictEqual(
      fileContent.includes('Muat Lebih Banyak'),
      false,
      'Initial release enforces 50-item cap without pagination button',
    );

    const authProviderPath = path.resolve(
      process.cwd(),
      'src/providers/auth-provider.tsx',
    );
    const authProviderContent = fs.readFileSync(authProviderPath, 'utf-8');
    assert.match(
      authProviderContent,
      /isMobileShellPath/,
      'AuthProvider must exempt /mobile so technicians are not redirected to Web Admin /login',
    );
  });

  it('GET /api/v1/tech/tickets returns historyTickets and audit metadata scoped to authenticated technician', async () => {
    const techId = crypto.randomUUID();
    const deviceId = crypto.randomUUID();
    const techToken = await mintTestJwt(
      {
        username: 'tech.andi',
        fullName: 'Andi Pratama',
        role: 'Vendor / Teknisi Lapangan',
        userType: 'TECHNICIAN',
        hierarchyLevel: 10,
        assignedClusters: ['PLB-01'],
        deviceId,
        tokenType: 'access',
      },
      { subject: techId, audience: 'mobile' },
    );

    const req = createNextRequest('http://localhost:3000/api/v1/tech/tickets', {
      headers: {
        authorization: `Bearer ${techToken}`,
        'x-device-id': deviceId,
      },
    });

    const res = await techTicketsGet(req);
    assert.strictEqual(res.status, 200);

    const body = (await res.json()) as {
      success: boolean;
      data: {
        tickets: Array<{ id: string; ticketNumber: string; status: string }>;
        historyTickets: Array<{
          id: string;
          ticketNumber: string;
          status: string;
          completedAt: string | null;
          createdByAdmin?: { id: string; username: string; fullName: string } | null;
          assignedTech?: { id: string; username: string; fullName: string } | null;
          historyMeta?: {
            oldAttenuation: number | null;
            newAttenuation: number | null;
            photoObjectKey: string | null;
            technicianNotes: string | null;
            approvedBy: string | null;
            distanceToSplitterM?: unknown;
            isLocationFlagged?: unknown;
          } | null;
          customer: {
            siaNumber: string;
            fullName: string;
            address: string;
            splitterCode: string | null;
            portNumber: number | null;
            currentAttenuation: number | null;
            attenuationHistory: number[];
          };
        }>;
        splitters: Array<{ splitterCode: string }>;
      };
      meta: {
        activeTicketsCount: number;
        historyTicketsCount: number;
        historyTotalCount: number;
        historyLimit: number;
        splittersCount: number;
      };
    };

    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.data.tickets), 'data.tickets must be an array');
    assert.ok(Array.isArray(body.data.historyTickets), 'data.historyTickets must be an array');
    assert.strictEqual(body.meta.activeTicketsCount, body.data.tickets.length);
    assert.strictEqual(body.meta.historyTicketsCount, body.data.historyTickets.length);
    assert.strictEqual(body.meta.historyLimit, MOBILE_HISTORY_LIMIT);

    const completedTicket = body.data.historyTickets.find((t) => t.ticketNumber === 'WO-2025-0840');
    assert.ok(completedTicket, 'WO-2025-0840 must be returned in tech.andi history');
    assert.strictEqual(completedTicket.status, 'COMPLETED');
    assert.ok(completedTicket.completedAt, 'completedAt must be provided');
    assert.strictEqual(completedTicket.customer.siaNumber, 'SLA-100243-0840');
    assert.strictEqual(completedTicket.customer.fullName, 'Bank Sumsel Babel Kantor Kas');
    assert.strictEqual(completedTicket.customer.splitterCode, 'ODP-PLB-034');
    assert.strictEqual(completedTicket.customer.portNumber, 1);
    assert.strictEqual(typeof completedTicket.customer.currentAttenuation, 'number');
    assert.ok(completedTicket.createdByAdmin?.username);
    assert.ok(completedTicket.historyMeta?.approvedBy);
    assert.ok(completedTicket.historyMeta?.technicianNotes);
    assert.strictEqual('distanceToSplitterM' in (completedTicket.historyMeta || {}), false);
    assert.strictEqual('isLocationFlagged' in (completedTicket.historyMeta || {}), false);

    // Anti-IDOR check: tech.andi must NOT receive tech.rizky's completed ticket WO-2025-0841
    const rizkyTicket = body.data.historyTickets.find((t) => t.ticketNumber === 'WO-2025-0841');
    assert.strictEqual(rizkyTicket, undefined, 'tech.andi must not receive tech.rizky history tickets');
  });

  it('strictly rejects SUPER_ADMIN and ADMIN across /api/v1/tech/tickets, /api/v1/tech/media/presign, and mobile OTP login', async () => {
    const roles: Array<{ userType: 'SUPER_ADMIN' | 'ADMIN'; username: string; role: string }> = [
      { userType: 'SUPER_ADMIN', username: 'superadmin', role: 'Super Admin' },
      { userType: 'ADMIN', username: 'admin.noc', role: 'Admin NOC' },
    ];

    for (const actorRole of roles) {
      const token = await mintTestJwt(
        {
          username: actorRole.username,
          fullName: actorRole.role,
          role: actorRole.role,
          userType: actorRole.userType,
          hierarchyLevel: actorRole.userType === 'SUPER_ADMIN' ? 100 : 50,
          assignedClusters: ['Global Scope'],
          tokenType: 'access',
        },
        { subject: crypto.randomUUID(), audience: 'mobile' },
      );

      const ticketsRes = await techTicketsGet(
        createNextRequest('http://localhost:3000/api/v1/tech/tickets', {
          headers: { authorization: `Bearer ${token}` },
        }),
      );
      assert.strictEqual(
        ticketsRes.status,
        403,
        `${actorRole.userType} must be rejected with 403 on GET /api/v1/tech/tickets`,
      );

      const presignRes = await techMediaPresignGet(
        createNextRequest(
          'http://localhost:3000/api/v1/tech/media/presign?ticketId=wo-2025-0840&key=opm-proofs/sample.jpg',
          { headers: { authorization: `Bearer ${token}` } },
        ),
      );
      assert.strictEqual(
        presignRes.status,
        403,
        `${actorRole.userType} must be rejected with 403 on GET /api/v1/tech/media/presign`,
      );
    }

    await withMockTcpDbServer(async () => {
      for (const actorRole of roles) {
        const mockUserId = crypto.randomUUID();
        const restoreUser = stubMethod(prisma.user, 'findUnique', (async () => ({
          id: mockUserId,
          nik: '000001',
          username: actorRole.username,
          fullName: actorRole.role,
          vendorCompany: null,
          passwordHash: '',
          telegramChatId: '7072749677',
          twoFactorEnabled: true,
          userType: actorRole.userType,
          isActive: true,
          assignedClusters: ['Global Scope'],
          role: {
            id: `role-${actorRole.userType}`,
            name: actorRole.role,
            hierarchyLevel: actorRole.userType === 'SUPER_ADMIN' ? 100 : 50,
            permissions: ['ticket:read', 'ticket:create'],
          },
        })) as unknown as typeof prisma.user.findUnique);

        try {
          await assert.rejects(
            () =>
              AuthService.loginMobile(
                actorRole.username,
                'password123',
                'DEV-ADMIN-BLOCK-TEST',
                'Pixel 8',
                '1.0.0',
              ),
            (err: Error & { code?: string; statusCode?: number }) =>
              err.code === ERROR_CODES.FORBIDDEN && err.statusCode === 403,
            `${actorRole.userType} must be rejected with 403 FORBIDDEN on AuthService.loginMobile`,
          );
        } finally {
          restoreUser();
        }
      }

      const otpStore = await import('@/server/lib/otp-store');
      const superAdminId = '00000000-0000-4000-8000-000000000001';
      const challenge = await otpStore.createOtpChallenge({
        userId: superAdminId,
        username: 'superadmin',
        telegramChatId: '7072749677',
        deliveryStatus: 'SENT',
      });
      const adminPreAuth = await AuthService.generatePreAuthToken({
        userId: superAdminId,
        username: 'superadmin',
        challengeId: challenge.record.challengeId,
        channel: 'mobile',
        deviceId: 'DEV-ADMIN-BLOCK',
      });

      restoreFns.push(
        stubMethod(prisma.user, 'findUnique', (async () => ({
          id: superAdminId,
          nik: '000001',
          username: 'superadmin',
          fullName: 'Super Administrator',
          vendorCompany: null,
          passwordHash: '',
          telegramChatId: '7072749677',
          twoFactorEnabled: true,
          userType: 'SUPER_ADMIN',
          isActive: true,
          assignedClusters: ['Global Scope'],
          role: {
            id: 'role-superadmin',
            name: 'Super Admin',
            hierarchyLevel: 100,
            permissions: ['ticket:read', 'ticket:create'],
          },
        })) as unknown as typeof prisma.user.findUnique),
      );

      await assert.rejects(
        () => AuthService.resendWebOtp(adminPreAuth),
        (err: Error & { code?: string; statusCode?: number }) =>
          err.code === ERROR_CODES.FORBIDDEN && err.statusCode === 403,
        'SUPER_ADMIN mobile pre-auth must be rejected on OTP resend',
      );

      await assert.rejects(
        () =>
          AuthService.verifyMobileOtp(adminPreAuth, challenge.otpCode, {
            deviceId: 'DEV-ADMIN-BLOCK',
          }),
        (err: Error & { code?: string; statusCode?: number }) =>
          err.code === ERROR_CODES.FORBIDDEN && err.statusCode === 403,
        'SUPER_ADMIN pre-auth must be rejected with 403 FORBIDDEN on verifyMobileOtp',
      );
    });
  });

  it('TicketService.listTechnicianTicketsForMobile aggregates ActivityLog audit metadata, enforces 50-item cap, and prevents history clusters from expanding splitters', async () => {
    const techId = crypto.randomUUID();
    const adminId = crypto.randomUUID();
    const completedTicketId = crypto.randomUUID();

    await withMockTcpDbServer(async () => {
      restoreFns.push(
        stubMethod(prisma.user, 'findUnique', (async () => ({
          id: techId,
          username: 'tech.andi',
          fullName: 'Andi Pratama',
          userType: 'TECHNICIAN',
          isActive: true,
          assignedClusters: ['PLB-01'],
          role: { name: 'Technician', hierarchyLevel: 10, permissions: ['ticket:read'] },
        })) as unknown as typeof prisma.user.findUnique),
      );

      restoreFns.push(
        stubMethod(prisma.ticket, 'findMany', (async (args?: { where?: { status?: unknown }; take?: number }) => {
          const isCompletedQuery = args?.where?.status === 'COMPLETED';
          if (!isCompletedQuery) {
            return [];
          }
          assert.strictEqual(args?.take, 50, 'DB history query must cap at 50 rows');
          return [
            {
              id: completedTicketId,
              ticketNumber: 'WO-2025-9001',
              ticketType: 'MAINTENANCE',
              status: 'COMPLETED',
              vendorName: 'PT Mitra Fiber Nusantara',
              complaintSummary: 'Redaman turun setelah perbaikan splice.',
              customerPhone: '+628123456789',
              serviceAddress: 'Jl. Veteran No. 10, Palembang',
              locationPlace: 'Ruko Veteran',
              targetLat: -2.975,
              targetLng: 104.745,
              adminNotes: 'Pastikan redaman di bawah -22 dBm.',
              rejectionReason: null,
              dispatchedAt: new Date('2026-10-01T01:00:00.000Z'),
              assignedAt: new Date('2026-10-01T01:00:00.000Z'),
              startedAt: new Date('2026-10-01T02:00:00.000Z'),
              completedAt: new Date('2026-10-01T04:00:00.000Z'),
              createdAt: new Date('2026-10-01T00:30:00.000Z'),
              pendingPayload: null,
              createdByAdmin: {
                id: adminId,
                username: 'admin.noc',
                fullName: 'Admin NOC Palembang',
              },
              assignedTech: {
                id: techId,
                username: 'tech.andi',
                fullName: 'Andi Pratama',
                vendorCompany: 'PT Mitra Fiber Nusantara',
              },
              customer: {
                id: crypto.randomUUID(),
                siaNumber: 'SLA-9001',
                fullName: 'PT Veteran Mandiri',
                address: 'Jl. Veteran No. 10, Palembang',
                lat: -2.975,
                lng: 104.745,
                currentAttenuation: -21.0,
                // Even if customer resides in another cluster historically, it must NOT leak into active splitter scopes
                cluster: { name: 'Cluster Sejarah Luar', clusterCode: 'BDG-HIST-99' },
                splitter: { splitterCode: 'ODP-BDG-999' },
                portNumber: 4,
              },
              attenuations: [
                {
                  oldAttenuation: null,
                  newAttenuation: -19.2,
                  portNumber: 4,
                  photoObjectKey: 'opm-proofs/2026/10/wo-9001.jpg',
                  clientRecordedAt: new Date('2026-10-01T03:00:00.000Z'),
                  splitter: { splitterCode: 'ODP-PLB-034' },
                },
              ],
            },
          ];
        }) as unknown as typeof prisma.ticket.findMany),
      );

      restoreFns.push(
        stubMethod(prisma.activityLog, 'findMany', (async () => [
          {
            actionType: 'TICKET_APPROVED_BY_ADMIN',
            targetId: completedTicketId,
            oldPayload: null,
            newPayload: {
              status: 'COMPLETED',
              approvedBy: 'admin.noc',
              attenuationDbm: -19.2,
            },
            createdAt: new Date('2026-10-01T04:00:00.000Z'),
          },
          {
            actionType: 'TICKET_SUBMITTED_FOR_VERIFICATION',
            targetId: completedTicketId,
            oldPayload: {
              status: 'IN_PROGRESS',
              oldAttenuation: -29.4,
            },
            newPayload: {
              channel: 'MOBILE',
              attenuationDbm: -19.2,
              technicianNotes: 'Re-splicing konektor SC/APC selesai dan normal.',
            },
            createdAt: new Date('2026-10-01T03:05:00.000Z'),
          },
        ]) as unknown as typeof prisma.activityLog.findMany),
      );

      let capturedSplitterClusters: string[] = [];
      restoreFns.push(
        stubMethod(prisma.networkSplitter, 'findMany', (async (args?: { where?: { cluster?: { clusterCode?: { in?: string[] } } } }) => {
          capturedSplitterClusters = args?.where?.cluster?.clusterCode?.in || [];
          return [];
        }) as unknown as typeof prisma.networkSplitter.findMany),
      );

      const response = await TicketService.listTechnicianTicketsForMobile(
        {
          userId: techId,
          username: 'tech.andi',
          canonicalUsername: 'andi.pratama',
          fullName: 'Andi Pratama',
          userType: 'TECHNICIAN',
          channel: 'MOBILE',
        },
        { historyLimit: 999 },
      );

      assert.strictEqual(response.meta.historyLimit, 50, 'Service must clamp historyLimit to 50');
      assert.strictEqual(response.data.historyTickets.length, 1);
      const item = response.data.historyTickets[0];
      assert.strictEqual(item.createdByAdmin?.username, 'admin.noc');
      assert.strictEqual(item.assignedTech?.fullName, 'Andi Pratama');
      assert.strictEqual(item.historyMeta?.oldAttenuation, -29.4);
      assert.strictEqual(item.historyMeta?.newAttenuation, -19.2);
      assert.strictEqual(item.historyMeta?.technicianNotes, 'Re-splicing konektor SC/APC selesai dan normal.');
      assert.strictEqual(item.historyMeta?.approvedBy, 'admin.noc');
      assert.strictEqual(item.historyMeta?.submissionChannel, 'MOBILE');
      assert.strictEqual(item.historyMeta?.photoObjectKey, 'opm-proofs/2026/10/wo-9001.jpg');
      assert.deepStrictEqual(item.customer.attenuationHistory, [-29.4, -19.2]);
      assert.strictEqual(
        capturedSplitterClusters.includes('BDG-HIST-99'),
        false,
        'Completed history cluster must NEVER expand active technician splitter access',
      );
    });
  });

  it('GET /api/v1/tech/media/presign enforces traversal guard, IDOR ownership, clean seed handling, and valid presign', async () => {
    const techId = crypto.randomUUID();
    const otherTechId = crypto.randomUUID();
    const deviceId = crypto.randomUUID();

    const techToken = await mintTestJwt(
      {
        username: 'tech.andi',
        fullName: 'Andi Pratama',
        role: 'Vendor / Teknisi Lapangan',
        userType: 'TECHNICIAN',
        hierarchyLevel: 10,
        assignedClusters: ['PLB-01'],
        deviceId,
        tokenType: 'access',
      },
      { subject: techId, audience: 'mobile' },
    );

    const traversalRes = await techMediaPresignGet(
      createNextRequest(
        'http://localhost:3000/api/v1/tech/media/presign?ticketId=wo-1&key=../backups/db.sql',
        {
          headers: { authorization: `Bearer ${techToken}`, 'x-device-id': deviceId },
        },
      ),
    );
    assert.strictEqual(traversalRes.status, 400, 'Path traversal key must be rejected with 400');

    await withMockTcpDbServer(async () => {
      restoreFns.push(
        stubMethod(prisma.user, 'findUnique', (async () => ({
          id: techId,
          username: 'tech.andi',
          fullName: 'Andi Pratama',
          userType: 'TECHNICIAN',
          isActive: true,
        })) as unknown as typeof prisma.user.findUnique),
      );

      // 1. IDOR: ticket assigned to another technician -> 403
      restoreFns.push(
        stubMethod(prisma.ticket, 'findFirst', (async () => ({
          id: 'wo-other',
          assignedTechId: otherTechId,
          pendingPayload: null,
          attenuations: [{ id: 'att-other', photoObjectKey: 'opm-proofs/other.jpg' }],
        })) as unknown as typeof prisma.ticket.findFirst),
      );

      const idorRes = await techMediaPresignGet(
        createNextRequest(
          'http://localhost:3000/api/v1/tech/media/presign?ticketId=wo-other&key=opm-proofs/other.jpg',
          {
            headers: { authorization: `Bearer ${techToken}`, 'x-device-id': deviceId },
          },
        ),
      );
      assert.strictEqual(idorRes.status, 403, 'Accessing another technician photo must return 403');
      restoreFns.pop()?.();

      // 2. Seed asset key -> clean 404 (not 500)
      restoreFns.push(
        stubMethod(prisma.ticket, 'findFirst', (async () => ({
          id: 'wo-seed',
          assignedTechId: techId,
          pendingPayload: null,
          attenuations: [{ id: 'att-seed', photoObjectKey: 'seed/wo-2025-0841-opm.jpg' }],
        })) as unknown as typeof prisma.ticket.findFirst),
      );

      const seedRes = await techMediaPresignGet(
        createNextRequest(
          'http://localhost:3000/api/v1/tech/media/presign?ticketId=wo-seed&key=seed/wo-2025-0841-opm.jpg',
          {
            headers: { authorization: `Bearer ${techToken}`, 'x-device-id': deviceId },
          },
        ),
      );
      assert.strictEqual(seedRes.status, 404, 'Seed asset photo key must return clean 404 rather than 500');
      restoreFns.pop()?.();

      // 3. Valid owned OPM proof key -> 200 presign URL
      restoreFns.push(
        stubMethod(prisma.ticket, 'findFirst', (async () => ({
          id: 'wo-valid',
          assignedTechId: techId,
          pendingPayload: null,
          attenuations: [{ id: 'att-valid', photoObjectKey: 'opm-proofs/2026/10/proof.jpg' }],
        })) as unknown as typeof prisma.ticket.findFirst),
      );

      const okRes = await techMediaPresignGet(
        createNextRequest(
          'http://localhost:3000/api/v1/tech/media/presign?ticketId=wo-valid&key=opm-proofs/2026/10/proof.jpg',
          {
            headers: { authorization: `Bearer ${techToken}`, 'x-device-id': deviceId },
          },
        ),
      );
      assert.strictEqual(okRes.status, 200);
      const okJson = (await okRes.json()) as {
        success: boolean;
        data: { key: string; url: string; isMockFallback: boolean };
      };
      assert.strictEqual(okJson.success, true);
      assert.strictEqual(okJson.data.key, 'opm-proofs/2026/10/proof.jpg');
      assert.ok(okJson.data.url.includes('opm-proofs/2026/10/proof.jpg'));
    });
  });
});
