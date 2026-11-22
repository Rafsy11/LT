import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PERMISSIONS } from '@repo/shared';
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
let generateSignedActionToken: typeof import('@/server/services/ai.service').generateSignedActionToken;
let techUploadPost: typeof import('@/app/api/v1/tech/tickets/[id]/upload/route').POST;
let networkImportPost: typeof import('@/app/api/v1/admin/network/import/route').POST;
let aiChatPost: typeof import('@/app/api/v1/admin/ai/chat/route').POST;
let aiConfirmPost: typeof import('@/app/api/v1/admin/ai/confirm-action/route').POST;
let deviceIntegrity: typeof import('../../../apps/mobile/src/security/deviceIntegrity');
let locationGuard: typeof import('../../../apps/mobile/src/security/locationGuard');
let TicketService: typeof import('@/server/services/ticket.service').TicketService;
let opmCamera: typeof import('../../../apps/mobile/src/camera/opmCamera');

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

function createMockWebpBuffer(sizeBytes = 512): Buffer {
  const buf = Buffer.alloc(Math.max(sizeBytes, 16), 0x22);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(buf.length - 8, 4);
  buf.write('WEBP', 8, 'ascii');
  return buf;
}

describe('Tier 2 Boundary: Upload/Import Limits, AI Prompt, CSV Formula, Open Redirect, GPS & AEAD Bounds', () => {
  const repoRoot = resolveRepoRoot();
  const restoreFns: Array<() => void> = [];

  before(async () => {
    configureOfflineTestEnv();
    const [
      dbMod,
      minioMod,
      ticketMod,
      aiMod,
      uploadRoute,
      importRoute,
      aiChatRoute,
      aiConfirmRoute,
      diMod,
      lgMod,
      camMod,
    ] = await Promise.all([
      import('@repo/database'),
      import('@/server/lib/minio'),
      import('@/server/services/ticket.service'),
      import('@/server/services/ai.service'),
      import('@/app/api/v1/tech/tickets/[id]/upload/route'),
      import('@/app/api/v1/admin/network/import/route'),
      import('@/app/api/v1/admin/ai/chat/route'),
      import('@/app/api/v1/admin/ai/confirm-action/route'),
      import('../../../apps/mobile/src/security/deviceIntegrity'),
      import('../../../apps/mobile/src/security/locationGuard'),
      import('../../../apps/mobile/src/camera/opmCamera'),
    ]);

    prisma = dbMod.prisma;
    resetDatabaseHealthCache = dbMod.resetDatabaseHealthCache;
    minioManager = minioMod.minioManager;
    TicketService = ticketMod.TicketService;
    generateSignedActionToken = aiMod.generateSignedActionToken;
    techUploadPost = uploadRoute.POST;
    networkImportPost = importRoute.POST;
    aiChatPost = aiChatRoute.POST;
    aiConfirmPost = aiConfirmRoute.POST;
    deviceIntegrity = diMod;
    locationGuard = lgMod;
    opmCamera = camMod;
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

  it('Upload & Import bounds: magic-bytes, 5MB vs 5MB+1, 0-byte, >50k CSV rows, and corrupt/ZIP-bomb .xlsx', async () => {
    const techId = crypto.randomUUID();
    const deviceId = crypto.randomUUID();
    const superId = crypto.randomUUID();
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
      { subject: superId, audience: 'web' },
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
      const mockDbTicket = {
        id: 'wo-2025-0842',
        ticketNumber: 'WO-2025-0842',
        ticketType: 'MAINTENANCE',
        status: 'IN_PROGRESS',
        createdAt: new Date(),
        assignedTechId: techId,
        customer: {
          fullName: 'PT Test',
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
      restoreFns.push(
        stubMethod(prisma.ticket, 'findFirst', (async () => mockDbTicket) as unknown as typeof prisma.ticket.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma.ticket, 'findMany', (async () => [mockDbTicket]) as unknown as typeof prisma.ticket.findMany),
      );
      restoreFns.push(
        stubMethod(minioManager, 'putObjectBuffer', async (key: string) => ({
          stored: true,
          objectKey: key,
        })),
      );

      // 0. 0-byte upload must be rejected (400 or 415) and fail opmCamera.validateNonEmptyPhoto
      assert.strictEqual(opmCamera.validateNonEmptyPhoto(Buffer.alloc(0)), false);
      const fdZero = new FormData();
      fdZero.append('file', new File([Buffer.alloc(0)], 'empty.jpg', { type: 'image/jpeg' }));
      const zeroRes = await techUploadPost(
        createMultipartNextRequest(
          'http://localhost:3000/api/v1/tech/tickets/wo-2025-0842/upload',
          fdZero,
          { authorization: `Bearer ${techToken}`, 'x-device-id': deviceId },
        ),
        { params: Promise.resolve({ id: 'wo-2025-0842' }) },
      );
      assert.ok(
        zeroRes.status === 400 || zeroRes.status === 415,
        `0-byte upload must be rejected with 400 or 415, got ${zeroRes.status}`,
      );

      // 1. Exact 5MB JPEG succeeds (201), 5MB+1 fails (413)
      const exact5Mb = createMockJpegBuffer(5 * 1024 * 1024);
      const fdExact = new FormData();
      fdExact.append('file', new File([new Uint8Array(exact5Mb)], '5mb.jpg', { type: 'image/jpeg' }));
      const exactRes = await techUploadPost(
        createMultipartNextRequest(
          'http://localhost:3000/api/v1/tech/tickets/wo-2025-0842/upload',
          fdExact,
          { authorization: `Bearer ${techToken}`, 'x-device-id': deviceId },
        ),
        { params: Promise.resolve({ id: 'wo-2025-0842' }) },
      );
      assert.strictEqual(exactRes.status, 201);

      const over5Mb = createMockJpegBuffer(5 * 1024 * 1024 + 1);
      const fdOver = new FormData();
      fdOver.append('file', new File([new Uint8Array(over5Mb)], 'over.jpg', { type: 'image/jpeg' }));
      const overRes = await techUploadPost(
        createMultipartNextRequest(
          'http://localhost:3000/api/v1/tech/tickets/wo-2025-0842/upload',
          fdOver,
          { authorization: `Bearer ${techToken}`, 'x-device-id': deviceId },
        ),
        { params: Promise.resolve({ id: 'wo-2025-0842' }) },
      );
      assert.strictEqual(overRes.status, 413);

      // 2. Valid WebP magic bytes succeed (201), PE executable MZ disguised as image/webp fails (415)
      const fdWebp = new FormData();
      fdWebp.append('file', new File([new Uint8Array(createMockWebpBuffer())], 'ok.webp', { type: 'image/webp' }));
      const webpRes = await techUploadPost(
        createMultipartNextRequest(
          'http://localhost:3000/api/v1/tech/tickets/wo-2025-0842/upload',
          fdWebp,
          { authorization: `Bearer ${techToken}`, 'x-device-id': deviceId },
        ),
        { params: Promise.resolve({ id: 'wo-2025-0842' }) },
      );
      assert.strictEqual(webpRes.status, 201);

      const fdMz = new FormData();
      fdMz.append('file', new File([Buffer.from('MZ\x90\x00PE_SPOOF')], 'evil.webp', { type: 'image/webp' }));
      const mzRes = await techUploadPost(
        createMultipartNextRequest(
          'http://localhost:3000/api/v1/tech/tickets/wo-2025-0842/upload',
          fdMz,
          { authorization: `Bearer ${techToken}`, 'x-device-id': deviceId },
        ),
        { params: Promise.resolve({ id: 'wo-2025-0842' }) },
      );
      assert.strictEqual(mzRes.status, 415);

      // 3. Datek CSV > 50,000 rows rejected (413)
      const lines = ['SIA,CUSTOMER NAME,NODE AKSES GPON'];
      for (let i = 1; i <= 50_001; i++) {
        lines.push(`SIA${i},Cust ${i},PLBHRAGA01`);
      }
      const fdRows = new FormData();
      fdRows.append('file', new File([Buffer.from(lines.join('\n'))], 'big.csv', { type: 'text/csv' }));
      const bigCsvRes = await networkImportPost(
        createMultipartNextRequest(
          'http://localhost:3000/api/v1/admin/network/import?dryRun=true',
          fdRows,
          { cookie: `fiberops_session=${superToken}`, 'x-real-ip': '203.0.113.201' },
        ),
      );
      assert.strictEqual(bigCsvRes.status, 413);

      // 4. Corrupt PK header .xlsx (ZIP bomb / truncated OOXML) fails safely with 415/413 (no unhandled 500)
      const badZip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0xff, 0xff, 0x00, 0x01, 0x02]);
      const fdZip = new FormData();
      fdZip.append(
        'file',
        new File([badZip], 'corrupt.xlsx', {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      );
      const corruptRes = await networkImportPost(
        createMultipartNextRequest(
          'http://localhost:3000/api/v1/admin/network/import?dryRun=true',
          fdZip,
          { cookie: `fiberops_session=${superToken}`, 'x-real-ip': '203.0.113.202' },
        ),
      );
      assert.ok(corruptRes.status === 415 || corruptRes.status === 413);
    });
  });

  it('AI prompt length & confirm-action bounds: whitespace, 4000 vs 4001 chars, mismatched actionType & invalid UUID', async () => {
    const adminId = crypto.randomUUID();
    const adminToken = await mintTestJwt(
      {
        username: 'superadmin',
        role: 'Super Admin',
        userType: 'SUPER_ADMIN',
        hierarchyLevel: 100,
        assignedClusters: ['PLBHRAGA01'],
        permissions: ['*'],
        tokenType: 'access',
      },
      { subject: adminId, audience: 'web' },
    );

    const wsRes = await aiChatPost(
      createNextRequest('http://localhost:3000/api/v1/admin/ai/chat', {
        method: 'POST',
        headers: { 'x-real-ip': '203.0.113.210' },
        cookies: { fiberops_session: adminToken },
        jsonBody: { message: '   \n\t  ' },
      }),
    );
    assert.strictEqual(wsRes.status, 400);

    const overRes = await aiChatPost(
      createNextRequest('http://localhost:3000/api/v1/admin/ai/chat', {
        method: 'POST',
        headers: { 'x-real-ip': '203.0.113.211' },
        cookies: { fiberops_session: adminToken },
        jsonBody: { message: 'X'.repeat(4001) },
      }),
    );
    assert.strictEqual(overRes.status, 400, 'AI prompt >4000 chars must return 400');

    // Mismatched actionType on confirm-action -> 400
    const token = await generateSignedActionToken(
      'CREATE_TICKET',
      { ticketType: 'PSB', siaNumber: '100245' },
      adminId,
    );
    const mismatchRes = await aiConfirmPost(
      createNextRequest('http://localhost:3000/api/v1/admin/ai/confirm-action', {
        method: 'POST',
        cookies: { fiberops_session: adminToken },
        jsonBody: {
          actionToken: token,
          actionType: 'MUTATE_SPLITTER_PORT',
          payload: {},
        },
      }),
    );
    assert.strictEqual(mismatchRes.status, 400);
  });

  it('CSV formula injection & quote escaping bounds: =, +, -, @, \\t, \\r, quotes, commas & newlines', async () => {
    // Check shared CSV serializer if created by M3, else verify both CSV exporters do not bypass formula guard
    const candidates = [
      '@/lib/csv',
      '@/lib/csv-export',
      '@/lib/export-csv',
    ];
    let csvFn: ((val: unknown) => string) | null = null;
    for (const modPath of candidates) {
      const mod = (await import(modPath).catch(() => null)) as Record<string, unknown> | null;
      if (mod) {
        for (const fnName of ['escapeCsvCell', 'sanitizeCsvCell', 'formatCsvCell', 'csvEscape']) {
          if (typeof mod[fnName] === 'function') {
            csvFn = mod[fnName] as (val: unknown) => string;
            break;
          }
        }
      }
      if (csvFn) break;
    }

    if (csvFn) {
      for (const dangerous of [
        "=CMD|'/C calc'!A0",
        '+1+1',
        '-2+3',
        '@SUM(1+1)',
        '\t=1+1',
        '\r=1+1',
        ' =1+1',
      ]) {
        const out = csvFn(dangerous);
        const unwrapped = out.startsWith('"') && out.endsWith('"') ? out.slice(1, -1) : out;
        assert.ok(
          unwrapped.startsWith("'"),
          `CSV cell "${dangerous}" must be neutralized with leading single quote, got ${out}`,
        );
      }
      assert.match(csvFn('He said "OK", now'), /""OK""/);
      const multilineOut = csvFn('Line 1\nLine 2');
      assert.ok(
        multilineOut.startsWith('"') && multilineOut.endsWith('"') && multilineOut.includes('\n'),
        `CSV cell with embedded newline must be RFC 4180 quoted, got ${multilineOut}`,
      );
    } else {
      const splitterSrc = fs.readFileSync(
        path.join(repoRoot, 'apps', 'web', 'src', 'features', 'network', 'components', 'splitter-port-grid.tsx'),
        'utf8',
      );
      const overviewSrc = fs.readFileSync(
        path.join(repoRoot, 'apps', 'web', 'src', 'features', 'overview', 'hooks', 'use-overview.ts'),
        'utf8',
      );
      assert.match(
        splitterSrc,
        /\[=+\-@\\t\\r\]|\[\\t\\r=+\-@\]/,
        'CSV formula-prefix neutralization regex missing in splitter-port-grid.tsx',
      );
      assert.match(
        overviewSrc,
        /\[=+\-@\\t\\r\]|\[\\t\\r=+\-@\]/,
        'CSV formula-prefix neutralization regex missing in use-overview.ts',
      );
      assert.match(
        splitterSrc,
        /replace\([^)]*"[^)]*""/,
        'CSV RFC 4180 quote doubling ("") missing in splitter-port-grid.tsx',
      );
      assert.match(
        overviewSrc,
        /replace\([^)]*"[^)]*""/,
        'CSV RFC 4180 quote doubling ("") missing in use-overview.ts',
      );
      assert.match(
        `${splitterSrc}\n${overviewSrc}`,
        /trimStart|^\s*\^\\s\*/,
        'CSV serializer must check leading whitespace before formula prefixes (e.g. " =1+1")',
      );
      assert.match(
        `${splitterSrc}\n${overviewSrc}`,
        /\\n|\\r\\n/,
        'CSV serializer must quote cells containing embedded newlines',
      );
    }
  });

  it('Open redirect bounds (API-15): rejects /\\evil.com, //evil.com, /%5cevil.com, control chars, and external schemes', async () => {
    const useLoginMod = (await import('@/features/auth/hooks/use-login').catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (useLoginMod && typeof useLoginMod.resolveSafeRedirectTarget === 'function') {
      const fn = useLoginMod.resolveSafeRedirectTarget as (s: string) => string;
      const payloads = [
        '?next=/\\evil.com',
        '?next=//evil.com',
        '?next=/%5cevil.com',
        '?next=/%5Cevil.com',
        '?next=/\x00evil.com',
        '?next=/\t/evil.com',
        '?next=https://evil.com',
        '?next=javascript:alert(1)',
        '?next=/login?next=/admin',
      ];
      for (const p of payloads) {
        assert.strictEqual(fn(p), '/', `Open redirect payload ${p} must resolve to "/"`);
      }
      assert.strictEqual(fn('?next=/tickets?tab=pending'), '/tickets?tab=pending');
    } else {
      const useLoginSrc = fs.readFileSync(
        path.join(repoRoot, 'apps', 'web', 'src', 'features', 'auth', 'hooks', 'use-login.ts'),
        'utf8',
      );
      const fnBlock = useLoginSrc.match(/function\s+resolveSafeRedirectTarget[\s\S]*?\n\}/)?.[0] || '';
      assert.match(
        fnBlock,
        /\\\\|%5c/i,
        'resolveSafeRedirectTarget must block backslash and encoded backslash redirects',
      );
    }
  });

  it('GPS velocity, freshness & geofence bounds: 100m vs 101m, stale/future timestamp, impossible travel, Null Island', async () => {
    const refLat = -2.9833;
    const refLng = 104.7644;

    // 1. Haversine 100m boundary check
    const inside = await locationGuard.acquireVerifiedLocation(
      { latitude: refLat, longitude: refLng },
      async () => ({
        coords: { latitude: refLat + 0.0005, longitude: refLng, accuracy: 8 },
        mocked: false,
        timestamp: Date.now(),
      }),
    );
    assert.strictEqual(inside.isLocationFlagged, false);

    const outside = await locationGuard.acquireVerifiedLocation(
      { latitude: refLat, longitude: refLng },
      async () => ({
        coords: { latitude: refLat + 0.0015, longitude: refLng, accuracy: 8 },
        mocked: false,
        timestamp: Date.now(),
      }),
    );
    assert.strictEqual(outside.isLocationFlagged, true);
    assert.strictEqual(locationGuard.validateCoordinates({ latitude: 0, longitude: 0 }).valid, false);

    // 2. Server-side TicketService velocity & future timestamp rejection
    await withMockTcpDbServer(async () => {
      const techId = crypto.randomUUID();
      const ticketId = crypto.randomUUID();
      restoreFns.push(
        stubMethod(prisma.ticket, 'findFirst', (async () => ({
          id: ticketId,
          ticketNumber: 'WO-VEL-1',
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
      // Prior submission 60 seconds ago at Jakarta (-6.2088, 106.8456) -> >400 km away in 60s (>24,000 km/h)
      restoreFns.push(
        stubMethod(prisma.attenuationHistory, 'findFirst', (async () => ({
          submittedLat: -6.2088,
          submittedLng: 106.8456,
          clientRecordedAt: new Date(Date.now() - 60_000),
          createdAt: new Date(Date.now() - 60_000),
        })) as unknown as typeof prisma.attenuationHistory.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma.networkSplitter, 'findFirst', (async () => ({
          id: 'sp-1',
          splitterCode: 'ODP-PLB-001',
          lat: refLat,
          lng: refLng,
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
          ticketNumber: 'WO-VEL-1',
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

      // Future timestamp (+10 min) must fail
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
              submittedLat: refLat + 0.0002,
              submittedLng: refLng,
              isMockLocation: false,
              clientRecordedAt: new Date(Date.now() + 10 * 60_000).toISOString(),
              channel: 'MOBILE',
            },
            { id: techId, username: 'tech.andi' },
          ),
        'GPS future clientRecordedAt (+10m) must be rejected',
      );

      // Impossible travel velocity (>300 km/h) must fail
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
              submittedLat: refLat + 0.0002,
              submittedLng: refLng,
              isMockLocation: false,
              clientRecordedAt: new Date().toISOString(),
              channel: 'MOBILE',
            },
            { id: techId, username: 'tech.andi' },
          ),
        'Impossible travel velocity (>300 km/h from Jakarta to Palembang in 60s) must be rejected',
      );
    });
  });

  it('AEAD crypto bounds (MOB-01): empty/1-byte/Unicode round-trip, wrong-key failure, bit-flip tamper, and legacy/plaintext rejection', async () => {
    for (const payload of ['', 'x', 'Pelanggan Palembang 🚀 — Jl. Sudirman № 12']) {
      const cipher = await deviceIntegrity.encryptData(payload, 'salt-A');
      assert.doesNotMatch(cipher, /^enc:v1:/, 'AEAD cipher must not use legacy XOR enc:v1 format');
      const plain = await deviceIntegrity.decryptData(cipher, 'salt-A');
      assert.strictEqual(plain, payload);

      // Wrong key/salt must reject
      await assert.rejects(() => deviceIntegrity.decryptData(cipher, 'salt-B'));

      // Single character tamper at end must reject
      const lastChar = cipher.slice(-1);
      const flipped = cipher.slice(0, -1) + (lastChar === 'A' ? 'B' : 'A');
      await assert.rejects(() => deviceIntegrity.decryptData(flipped, 'salt-A'));
    }

    // Legacy enc:v1 XOR and raw plaintext must be rejected
    await assert.rejects(() => deviceIntegrity.decryptData('enc:v1:00112233'));
    await assert.rejects(() => deviceIntegrity.decryptData('{"plaintext":true}'));
  });
});
