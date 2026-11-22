import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { ERROR_CODES, PERMISSIONS, type UserSessionContext } from '@repo/shared';
import {
  configureOfflineTestEnv,
  closeServerHandles,
  restoreTestEnv,
  mintTestJwt,
  createNextRequest,
  createTelegramCaptureFetch,
  runIsolatedTsxScript,
  resolveRepoRoot,
  stubMethod,
  TEST_JWT_SECRET,
  TEST_TELEGRAM_WEBHOOK_SECRET,
  OFFLINE_DATABASE_URL,
} from '../helpers/auth-test-harness';

let AuthService: typeof import('@/server/services/auth.service').AuthService;
let RoleService: typeof import('@/server/services/role.service').RoleService;
let SystemService: typeof import('@/server/services/system.service').SystemService;
let adminAuth: typeof import('@/server/lib/admin-auth');
let techAuth: typeof import('@/server/lib/tech-auth');
let telegramLib: typeof import('@/server/lib/telegram');
let minioLib: typeof import('@/server/lib/minio');
let ollamaLib: typeof import('@/server/lib/ollama');
let redisManager: typeof import('@/server/lib/redis').redisManager;
let prisma: typeof import('@repo/database').prisma;
let resetDatabaseHealthCache: typeof import('@repo/database').resetDatabaseHealthCache;

let telegramWebhookPost: typeof import('@/app/api/v1/telegram/webhook/route').POST;
let authLoginPost: typeof import('@/app/api/v1/auth/login/route').POST;
let authVerifyOtpPost: typeof import('@/app/api/v1/auth/verify-otp/route').POST;
let authResendOtpPost: typeof import('@/app/api/v1/auth/resend-otp/route').POST;
let adminRolesGet: typeof import('@/app/api/v1/admin/roles/route').GET;
let adminRolesPost: typeof import('@/app/api/v1/admin/roles/route').POST;
let adminRolesPatch: typeof import('@/app/api/v1/admin/roles/route').PATCH;
let adminUsersGet: typeof import('@/app/api/v1/admin/users/route').GET;
let adminUsersPatch: typeof import('@/app/api/v1/admin/users/[id]/route').PATCH;
let adminSettingsGet: typeof import('@/app/api/v1/admin/settings/route').GET;
let adminSettingsPut: typeof import('@/app/api/v1/admin/settings/route').PUT;
let adminBackupPost: typeof import('@/app/api/v1/admin/settings/backup/route').POST;
let otaManifestGet: typeof import('@/app/api/v1/ota/manifest/route').GET;
let healthGet: typeof import('@/app/api/v1/health/route').GET;
let apkDownloadGet: typeof import('@/app/download/mobile-latest.apk/route').GET;
let techTicketsGet: typeof import('@/app/api/v1/tech/tickets/route').GET;

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

describe('Tier 1: Security Auth, Telegram, Secrets & RBAC (AUTH-01..03, 06..08, 10, 13, 14)', () => {
  const repoRoot = resolveRepoRoot();
  const restoreFns: Array<() => void> = [];

  before(async () => {
    configureOfflineTestEnv();
    const [
      authMod,
      roleMod,
      sysMod,
      adminAuthMod,
      techAuthMod,
      tgLibMod,
      minioMod,
      ollamaMod,
      redisMod,
      dbMod,
      tgRoute,
      loginRoute,
      verifyRoute,
      resendRoute,
      rolesRoute,
      usersRoute,
      usersIdRoute,
      settingsRoute,
      backupRoute,
      otaRoute,
      healthRoute,
      apkRoute,
      techTicketsRoute,
    ] = await Promise.all([
      import('@/server/services/auth.service'),
      import('@/server/services/role.service'),
      import('@/server/services/system.service'),
      import('@/server/lib/admin-auth'),
      import('@/server/lib/tech-auth'),
      import('@/server/lib/telegram'),
      import('@/server/lib/minio'),
      import('@/server/lib/ollama'),
      import('@/server/lib/redis'),
      import('@repo/database'),
      import('@/app/api/v1/telegram/webhook/route'),
      import('@/app/api/v1/auth/login/route'),
      import('@/app/api/v1/auth/verify-otp/route'),
      import('@/app/api/v1/auth/resend-otp/route'),
      import('@/app/api/v1/admin/roles/route'),
      import('@/app/api/v1/admin/users/route'),
      import('@/app/api/v1/admin/users/[id]/route'),
      import('@/app/api/v1/admin/settings/route'),
      import('@/app/api/v1/admin/settings/backup/route'),
      import('@/app/api/v1/ota/manifest/route'),
      import('@/app/api/v1/health/route'),
      import('@/app/download/mobile-latest.apk/route'),
      import('@/app/api/v1/tech/tickets/route'),
    ]);

    AuthService = authMod.AuthService;
    RoleService = roleMod.RoleService;
    SystemService = sysMod.SystemService;
    adminAuth = adminAuthMod;
    techAuth = techAuthMod;
    telegramLib = tgLibMod;
    minioLib = minioMod;
    ollamaLib = ollamaMod;
    redisManager = redisMod.redisManager;
    prisma = dbMod.prisma;
    resetDatabaseHealthCache = dbMod.resetDatabaseHealthCache;

    telegramWebhookPost = tgRoute.POST;
    authLoginPost = loginRoute.POST;
    authVerifyOtpPost = verifyRoute.POST;
    authResendOtpPost = resendRoute.POST;
    adminRolesGet = rolesRoute.GET;
    adminRolesPost = rolesRoute.POST;
    adminRolesPatch = rolesRoute.PATCH;
    adminUsersGet = usersRoute.GET;
    adminUsersPatch = usersIdRoute.PATCH;
    adminSettingsGet = settingsRoute.GET;
    adminSettingsPut = settingsRoute.PUT;
    adminBackupPost = backupRoute.POST;
    otaManifestGet = otaRoute.GET;
    healthGet = healthRoute.GET;
    apkDownloadGet = apkRoute.GET;
    techTicketsGet = techTicketsRoute.GET;
  });

  afterEach(() => {
    while (restoreFns.length > 0) {
      const fn = restoreFns.pop();
      fn?.();
    }
    configureOfflineTestEnv();
  });

  after(async () => {
    await closeServerHandles();
    restoreTestEnv();
  });

  it('AUTH-01: Telegram webhook fails closed without valid secret, blocks unauthenticated NIK hijack, and forbids substring chatId matching', async () => {
    const tgFetch = createTelegramCaptureFetch();
    restoreFns.push(tgFetch.install());

    // 1. Wrong webhook secret (same length & unequal length) -> 401, and webhook uses timingSafeEqual
    const wrongSecretReq = createNextRequest('http://localhost:3000/api/v1/telegram/webhook', {
      headers: { 'x-telegram-bot-api-secret-token': 'wrong-secret-token' },
      jsonBody: { update_id: 1001, message: { message_id: 1, chat: { id: 999001, type: 'private' }, text: '/start' } },
    });
    const wrongSecretRes = await telegramWebhookPost(wrongSecretReq);
    assert.strictEqual(wrongSecretRes.status, 401, 'Wrong Telegram webhook secret must return 401');

    const unequalLenReq = createNextRequest('http://localhost:3000/api/v1/telegram/webhook', {
      headers: { 'x-telegram-bot-api-secret-token': TEST_TELEGRAM_WEBHOOK_SECRET.slice(0, 8) },
      jsonBody: { update_id: 10011, message: { message_id: 11, chat: { id: 999001, type: 'private' }, text: '/start' } },
    });
    const unequalLenRes = await telegramWebhookPost(unequalLenReq);
    assert.strictEqual(unequalLenRes.status, 401, 'Unequal-length prefix secret must return 401');

    const webhookRouteSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'web', 'src', 'app', 'api', 'v1', 'telegram', 'webhook', 'route.ts'),
      'utf8',
    );
    assert.match(
      webhookRouteSrc,
      /timingSafeEqual/,
      'AUTH-01: Telegram webhook secret comparison must use crypto.timingSafeEqual',
    );

    // 2. Missing TELEGRAM_WEBHOOK_SECRET env must fail closed (401/503, NEVER 200)
    const prevSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    process.env.TELEGRAM_WEBHOOK_SECRET = '';
    const unconfiguredReq = createNextRequest('http://localhost:3000/api/v1/telegram/webhook', {
      jsonBody: { update_id: 1002, message: { message_id: 2, chat: { id: 999002, type: 'private' }, text: '/start 882041' } },
    });
    const unconfiguredRes = await telegramWebhookPost(unconfiguredReq);
    process.env.TELEGRAM_WEBHOOK_SECRET = prevSecret;
    assert.ok(
      unconfiguredRes.status === 401 || unconfiguredRes.status === 503,
      `AUTH-01: Missing TELEGRAM_WEBHOOK_SECRET must fail closed (401/503), got ${unconfiguredRes.status}`,
    );

    // 3. Valid secret + unauthenticated `/start 882041` AND bare-numeric NIK "882041" must NOT bind or leak account info
    const hijackReq = createNextRequest('http://localhost:3000/api/v1/telegram/webhook', {
      headers: { 'x-telegram-bot-api-secret-token': TEST_TELEGRAM_WEBHOOK_SECRET },
      jsonBody: {
        update_id: 1003,
        message: {
          message_id: 3,
          chat: { id: 777666555, type: 'private' },
          text: '/start 882041',
        },
      },
    });
    const hijackRes = await telegramWebhookPost(hijackReq);
    const hijackJson = (await hijackRes.json()) as Record<string, unknown>;
    assert.notStrictEqual(
      hijackJson.action,
      'bound_success',
      'AUTH-01: Unauthenticated /start <NIK> must NEVER bind SUPER_ADMIN account',
    );
    assert.strictEqual(hijackJson.userId, undefined, 'AUTH-01: Webhook must not leak userId on NIK attempt');

    const bareNikReq = createNextRequest('http://localhost:3000/api/v1/telegram/webhook', {
      headers: { 'x-telegram-bot-api-secret-token': TEST_TELEGRAM_WEBHOOK_SECRET },
      jsonBody: {
        update_id: 1004,
        message: {
          message_id: 4,
          chat: { id: 777666556, type: 'private' },
          text: '882041',
        },
      },
    });
    const bareNikRes = await telegramWebhookPost(bareNikReq);
    const bareNikJson = (await bareNikRes.json()) as Record<string, unknown>;
    assert.notStrictEqual(
      bareNikJson.action,
      'bound_success',
      'AUTH-01: Unauthenticated bare-numeric NIK "882041" must NEVER self-bind account',
    );
    assert.strictEqual(bareNikJson.userId, undefined, 'AUTH-01: Bare NIK must not leak userId');

    // 4. Substring chatId must NOT match another user's longer or comma-separated chatId, while exact token in "11111,12345" MUST match
    await withMockTcpDbServer(async () => {
      const victimRow = {
        id: crypto.randomUUID(),
        nik: '882043',
        username: 'tech.andi',
        fullName: 'Andi Pratama',
        vendorCompany: null,
        passwordHash: 'hash',
        telegramChatId: '11111,12345',
        twoFactorEnabled: true,
        userType: 'TECHNICIAN',
        isActive: true,
        assignedClusters: ['PLB-01'],
        role: { id: 'r1', name: 'Technician', hierarchyLevel: 10, permissions: ['ticket:read'] },
      };

      type TelegramChatIdFilter =
        | string
        | {
            equals?: string;
            contains?: string;
            startsWith?: string;
            endsWith?: string;
          };
      type FindFirstClause = {
        telegramChatId?: TelegramChatIdFilter;
        isActive?: boolean;
      };
      const matchesTelegramFilter = (value: string, filter: TelegramChatIdFilter): boolean => {
        if (typeof filter === 'string') {
          return value === filter;
        }
        if (typeof filter.equals === 'string' && value !== filter.equals) {
          return false;
        }
        if (typeof filter.startsWith === 'string' && !value.startsWith(filter.startsWith)) {
          return false;
        }
        if (typeof filter.endsWith === 'string' && !value.endsWith(filter.endsWith)) {
          return false;
        }
        if (typeof filter.contains === 'string' && !value.includes(filter.contains)) {
          return false;
        }
        return (
          typeof filter.equals === 'string' ||
          typeof filter.startsWith === 'string' ||
          typeof filter.endsWith === 'string' ||
          typeof filter.contains === 'string'
        );
      };
      const evaluateFindFirst = (where?: {
        OR?: FindFirstClause[];
        telegramChatId?: TelegramChatIdFilter;
      }) => {
        if (where?.telegramChatId !== undefined) {
          return matchesTelegramFilter(victimRow.telegramChatId, where.telegramChatId)
            ? victimRow
            : null;
        }
        const clauses = where?.OR ?? [];
        for (const clause of clauses) {
          if (clause.isActive === false) continue;
          const tc = clause.telegramChatId;
          if (tc !== undefined && matchesTelegramFilter(victimRow.telegramChatId, tc)) {
            return victimRow;
          }
        }
        return null;
      };

      restoreFns.push(
        stubMethod(prisma.user, 'findFirst', (async (args?: {
          where?: { OR?: FindFirstClause[]; telegramChatId?: TelegramChatIdFilter };
        }) => evaluateFindFirst(args?.where)) as unknown as typeof prisma.user.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma.user, 'findMany', (async () => [victimRow]) as unknown as typeof prisma.user.findMany),
      );

      const matchedSub = await AuthService.resolveAccountByTelegramChatId('123');
      assert.strictEqual(
        matchedSub,
        null,
        'AUTH-01: Substring "123" must NOT match telegramChatId "11111,12345"',
      );

      const matchedPartialToken = await AuthService.resolveAccountByTelegramChatId('1234');
      assert.strictEqual(
        matchedPartialToken,
        null,
        'AUTH-01: Partial token "1234" must NOT match comma-separated "11111,12345"',
      );

      const matchedExactToken = await AuthService.resolveAccountByTelegramChatId('12345');
      assert.strictEqual(
        matchedExactToken?.username,
        'tech.andi',
        'AUTH-01: Exact comma-separated token "12345" inside "11111,12345" must resolve the user',
      );
    });
  });

  it('AUTH-02: env.ts and middleware.ts fail closed in production on missing/placeholder secrets and reject hardcoded fallback JWTs', async () => {
    const middlewareSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'web', 'src', 'middleware.ts'),
      'utf8',
    );
    assert.doesNotMatch(
      middlewareSrc,
      /fiberops_on_premise_super_secure_jwt_secret_key_32chars/,
      'AUTH-02: middleware.ts must not contain hardcoded fallback JWT secret',
    );

    // Subprocess 1: placeholder JWT_SECRET in production must throw on env import
    const placeholderEnvRes = await runIsolatedTsxScript(
      `import './src/env'; console.log('UNEXPECTED_PASS');`,
      {
        NODE_ENV: 'production',
        NEXT_PHASE: '',
        npm_lifecycle_event: '',
        DATABASE_URL: 'postgresql://u:StrongPass123@db.local:5432/fiberops',
        REDIS_URL: 'redis://:StrongRedisPass@redis.local:6379',
        MINIO_ACCESS_KEY: 'prod_minio_key',
        MINIO_SECRET_KEY: 'prod_minio_secret_strong',
        JWT_SECRET: 'fiberops_on_premise_super_secure_jwt_secret_key_32chars',
        HMAC_ACTION_SECRET: 'valid-hmac-secret-at-least-32-characters-long-01',
        TELEGRAM_WEBHOOK_SECRET: 'valid-tg-secret-at-least-32-characters-long-01',
      },
    );
    assert.notStrictEqual(
      placeholderEnvRes.exitCode,
      0,
      `AUTH-02: env.ts must reject hardcoded placeholder JWT_SECRET in production (stdout=${placeholderEnvRes.stdout})`,
    );

    // Subprocess 2: short/placeholder HMAC_ACTION_SECRET in production must throw on env import
    const badHmacRes = await runIsolatedTsxScript(
      `import './src/env'; console.log('UNEXPECTED_PASS');`,
      {
        NODE_ENV: 'production',
        NEXT_PHASE: '',
        npm_lifecycle_event: '',
        DATABASE_URL: 'postgresql://u:StrongPass123@db.local:5432/fiberops',
        REDIS_URL: 'redis://:StrongRedisPass@redis.local:6379',
        MINIO_ACCESS_KEY: 'prod_minio_key',
        MINIO_SECRET_KEY: 'prod_minio_secret_strong',
        JWT_SECRET: 'valid-prod-jwt-secret-at-least-32-characters-long-01',
        HMAC_ACTION_SECRET: 'fiberops_action_secret_token_default_32_chars',
        TELEGRAM_WEBHOOK_SECRET: 'valid-tg-secret-at-least-32-characters-long-01',
      },
    );
    assert.notStrictEqual(
      badHmacRes.exitCode,
      0,
      'AUTH-02: env.ts must reject placeholder HMAC_ACTION_SECRET in production',
    );

    // Subprocess 3: middleware.ts in production without valid JWT_SECRET must fail closed even if attacker signs token with old hardcoded secret
    const forgedToken = await mintTestJwt(
      {
        username: 'superadmin',
        userType: 'SUPER_ADMIN',
        hierarchyLevel: 100,
        tokenType: 'access',
      },
      {
        secret: 'fiberops_on_premise_super_secure_jwt_secret_key_32chars',
        subject: crypto.randomUUID(),
        audience: 'web',
      },
    );
    const mwRes = await runIsolatedTsxScript(
      `
      import { NextRequest } from 'next/server';
      import { middleware } from './src/middleware';
      const req = new NextRequest('http://localhost:3000/api/v1/admin/overview', {
        headers: { cookie: 'fiberops_session=${forgedToken}' },
      });
      const res = await middleware(req);
      console.log(JSON.stringify({ status: res.status, next: res.headers.get('x-middleware-next') }));
      `,
      {
        NODE_ENV: 'production',
        NEXT_PHASE: '',
        npm_lifecycle_event: '',
        JWT_SECRET: 'short',
      },
    );
    if (mwRes.exitCode === 0) {
      const lastLine = mwRes.stdout.trim().split('\n').pop() ?? '';
      assert.ok(lastLine.startsWith('{'), `AUTH-02: middleware must output fail-closed JSON or exit non-zero, got stdout=${mwRes.stdout}`);
      const parsed = JSON.parse(lastLine) as { status: number; next: string | null };
      assert.ok(
        parsed.status >= 400 && parsed.next !== '1',
        `AUTH-02: middleware must fail closed on short/invalid JWT_SECRET, got status=${parsed.status}, next=${parsed.next}`,
      );
    }

    // Subprocess 4: middleware.ts with MISSING JWT_SECRET in production must NOT fall back to hardcoded secret
    const mwMissingRes = await runIsolatedTsxScript(
      `
      import { NextRequest } from 'next/server';
      import { middleware } from './src/middleware';
      const req = new NextRequest('http://localhost:3000/api/v1/admin/overview', {
        headers: { cookie: 'fiberops_session=${forgedToken}' },
      });
      const res = await middleware(req);
      console.log(JSON.stringify({ status: res.status, next: res.headers.get('x-middleware-next') }));
      `,
      {
        NODE_ENV: 'production',
        NEXT_PHASE: '',
        npm_lifecycle_event: '',
        JWT_SECRET: undefined,
      },
    );
    if (mwMissingRes.exitCode === 0) {
      const lastLine = mwMissingRes.stdout.trim().split('\n').pop() ?? '';
      assert.ok(lastLine.startsWith('{'), `AUTH-02: middleware must fail closed when JWT_SECRET is unset, stdout=${mwMissingRes.stdout}`);
      const parsed = JSON.parse(lastLine) as { status: number; next: string | null };
      assert.ok(
        parsed.status >= 400 && parsed.next !== '1',
        `AUTH-02: middleware with missing JWT_SECRET must reject forged fallback token, got status=${parsed.status}, next=${parsed.next}`,
      );
    }

    // Subprocess 5: TELEGRAM_WEBHOOK_SECRET missing or placeholder in prod env.ts must fail closed
    const missingTgSecretRes = await runIsolatedTsxScript(
      `import './src/env'; console.log('UNEXPECTED_PASS');`,
      {
        NODE_ENV: 'production',
        NEXT_PHASE: '',
        npm_lifecycle_event: '',
        DATABASE_URL: 'postgresql://u:StrongPass123@db.local:5432/fiberops',
        REDIS_URL: 'redis://:StrongRedisPass@redis.local:6379',
        MINIO_ACCESS_KEY: 'prod_minio_key',
        MINIO_SECRET_KEY: 'prod_minio_secret_strong',
        JWT_SECRET: 'valid-prod-jwt-secret-at-least-32-characters-long-01',
        HMAC_ACTION_SECRET: 'valid-hmac-secret-at-least-32-characters-long-01',
        TELEGRAM_WEBHOOK_SECRET: '',
      },
    );
    assert.notStrictEqual(
      missingTgSecretRes.exitCode,
      0,
      'AUTH-02: env.ts must reject missing/empty TELEGRAM_WEBHOOK_SECRET in production',
    );

    // Compose & Nginx configuration checks: no hardcoded default secrets, enforce ${VAR:?}, no public /s3/ gateway
    const composeSrc = fs.readFileSync(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'utf8');
    assert.doesNotMatch(
      composeSrc,
      /fiberops_on_premise_super_secure_jwt_secret_key_32chars|fiberops_action_secret_token_default_32_chars|fiberops_secure_pass|fiberops_minio_secret_pass/,
      'AUTH-02: docker-compose.yml must not contain hardcoded default passwords or JWT/HMAC/MinIO secrets',
    );
    assert.match(
      composeSrc,
      /\$\{JWT_SECRET:\?/,
      'AUTH-02: docker-compose.yml must require JWT_SECRET via ${JWT_SECRET:?} fail-closed syntax',
    );

    const nginxSrc = fs.readFileSync(path.join(repoRoot, 'docker', 'nginx', 'nginx.conf'), 'utf8');
    assert.doesNotMatch(
      nginxSrc,
      /location\s+\/s3\//,
      'AUTH-02: docker/nginx/nginx.conf must remove public generic /s3/ MinIO gateway',
    );
  });

  it('AUTH-03: prevents vertical privilege escalation via Global Scope cluster, role name spoofing, and self-edit bypass', async (t) => {
    const spoofedAdmin: UserSessionContext = {
      userId: crypto.randomUUID(),
      username: 'rogue.admin',
      fullName: 'Rogue Admin',
      role: 'Super Admin',
      userType: 'ADMIN',
      hierarchyLevel: 50,
      assignedClusters: ['Global Scope', 'PLB-01'],
    };

    assert.strictEqual(
      adminAuth.isGlobalScopeActor(spoofedAdmin),
      false,
      'AUTH-03: Level-50 ADMIN with role="Super Admin" and assignedClusters=["Global Scope"] must NOT get global scope',
    );

    t.mock.method(RoleService, 'listRoles', async () => []);
    const perms = await adminAuth.getActorPermissions(spoofedAdmin);
    assert.strictEqual(
      perms.includes(PERMISSIONS.ALL),
      false,
      'AUTH-03: Non-SUPER_ADMIN must NEVER receive wildcard PERMISSIONS.ALL (*)',
    );

    // Block creating a case-variant "super admin" role
    const adminActorId = crypto.randomUUID();
    const adminToken = await mintTestJwt(
      {
        username: 'admin.noc',
        role: 'Admin Operasional',
        userType: 'ADMIN',
        hierarchyLevel: 50,
        assignedClusters: ['PLB-01'],
        permissions: ['role:edit', 'ticket:read'],
        tokenType: 'access',
      },
      { subject: adminActorId, audience: 'web' },
    );

    await withMockTcpDbServer(async () => {
      restoreFns.push(
        stubMethod(prisma.user, 'findUnique', (async () => ({
          id: adminActorId,
          nik: '882042',
          username: 'admin.noc',
          fullName: 'Budi Hartono',
          vendorCompany: null,
          userType: 'ADMIN',
          isActive: true,
          assignedClusters: ['PLB-01'],
          role: {
            id: 'role-noc-admin',
            name: 'Admin Operasional',
            hierarchyLevel: 50,
            permissions: ['role:edit', 'ticket:read'],
          },
        })) as unknown as typeof prisma.user.findUnique),
      );
      restoreFns.push(
        stubMethod(prisma.role, 'findFirst', (async () => ({
          id: 'role-noc-admin',
          name: 'Admin Operasional',
          hierarchyLevel: 50,
          permissions: ['role:edit', 'ticket:read'],
        })) as unknown as typeof prisma.role.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma.role, 'create', (async () => {
          throw new Error('Should not reach prisma.role.create for forbidden super admin name');
        }) as unknown as typeof prisma.role.create),
      );

      const createRoleReq = createNextRequest('http://localhost:3000/api/v1/admin/roles', {
        method: 'POST',
        cookies: { fiberops_session: adminToken },
        jsonBody: {
          name: 'super admin',
          permissions: ['ticket:read'],
          hierarchyLevel: 40,
        },
      });
      const createRoleRes = await adminRolesPost(createRoleReq);
      assert.ok(
        createRoleRes.status === 400 || createRoleRes.status === 403 || createRoleRes.status === 409,
        `AUTH-03: Creating role named "super admin" by level-50 admin must be blocked (400/403/409), got ${createRoleRes.status}`,
      );

      // Block creating substring variant "Junior Super Admin" as well
      const substringRoleReq = createNextRequest('http://localhost:3000/api/v1/admin/roles', {
        method: 'POST',
        cookies: { fiberops_session: adminToken },
        jsonBody: {
          name: 'Junior Super Admin',
          permissions: ['ticket:read'],
          hierarchyLevel: 40,
        },
      });
      const substringRoleRes = await adminRolesPost(substringRoleReq);
      assert.ok(
        substringRoleRes.status === 400 || substringRoleRes.status === 403 || substringRoleRes.status === 409,
        `AUTH-03: Creating role named "Junior Super Admin" must be blocked (400/403/409), got ${substringRoleRes.status}`,
      );

      // Block self-editing assignedClusters to Global Scope or disabling 2FA
      const selfEditReq = createNextRequest(`http://localhost:3000/api/v1/admin/users/${adminActorId}`, {
        method: 'PATCH',
        cookies: { fiberops_session: adminToken },
        jsonBody: {
          assignedClusters: ['Global Scope'],
          twoFactorEnabled: false,
        },
      });
      const selfEditRes = await adminUsersPatch(selfEditReq, {
        params: Promise.resolve({ id: adminActorId }),
      });
      assert.strictEqual(
        selfEditRes.status,
        403,
        `AUTH-03: Self-editing assignedClusters or twoFactorEnabled must return 403, got ${selfEditRes.status}`,
      );

      // Cross-cluster isolation on GET /api/v1/admin/users and PATCH /api/v1/admin/users/[id]
      const inClusterTechId = crypto.randomUUID();
      const outClusterTechId = crypto.randomUUID();
      restoreFns.push(
        stubMethod(prisma.user, 'findMany', (async () => [
          {
            id: inClusterTechId,
            nik: '882101',
            username: 'tech.plb1',
            fullName: 'Tech PLB1',
            vendorCompany: 'PT Mitra',
            roleId: 'role-tech',
            userType: 'TECHNICIAN',
            assignedClusters: ['PLB-01'],
            isActive: true,
            twoFactorEnabled: false,
            telegramChatId: null,
            createdAt: new Date(),
            role: { id: 'role-tech', name: 'Technician', hierarchyLevel: 10 },
            sessions: [],
          },
          {
            id: outClusterTechId,
            nik: '882102',
            username: 'tech.plb2',
            fullName: 'Tech PLB2',
            vendorCompany: 'PT Mitra',
            roleId: 'role-tech',
            userType: 'TECHNICIAN',
            assignedClusters: ['PLB-02'],
            isActive: true,
            twoFactorEnabled: false,
            telegramChatId: null,
            createdAt: new Date(),
            role: { id: 'role-tech', name: 'Technician', hierarchyLevel: 10 },
            sessions: [],
          },
        ]) as unknown as typeof prisma.user.findMany),
      );

      const listUsersRes = await adminUsersGet(
        createNextRequest('http://localhost:3000/api/v1/admin/users', {
          cookies: { fiberops_session: adminToken },
        }),
      );
      assert.strictEqual(listUsersRes.status, 200);
      const listUsersJson = (await listUsersRes.json()) as { data: Array<{ id: string }> };
      const listedIds = listUsersJson.data.map((u) => u.id);
      assert.strictEqual(
        listedIds.includes(outClusterTechId),
        false,
        'AUTH-03: GET /admin/users must filter out users outside level-50 admin assignedClusters',
      );

      // PATCH /api/v1/admin/users/[id] targeting out-of-cluster user must return 403
      restoreFns.push(
        stubMethod(prisma.user, 'findUnique', (async (args: { where: { id: string } }) => {
          if (args.where.id === adminActorId) {
            return {
              id: adminActorId,
              nik: '882042',
              username: 'admin.noc',
              fullName: 'Budi Hartono',
              vendorCompany: null,
              userType: 'ADMIN',
              isActive: true,
              assignedClusters: ['PLB-01'],
              role: {
                id: 'role-noc-admin',
                name: 'Admin Operasional',
                hierarchyLevel: 50,
                permissions: ['role:edit', 'ticket:read'],
              },
            };
          }
          if (args.where.id === outClusterTechId) {
            return {
              id: outClusterTechId,
              nik: '882102',
              username: 'tech.plb2',
              fullName: 'Tech PLB2',
              vendorCompany: 'PT Mitra',
              roleId: 'role-tech',
              userType: 'TECHNICIAN',
              assignedClusters: ['PLB-02'],
              isActive: true,
              twoFactorEnabled: false,
              telegramChatId: null,
              createdAt: new Date(),
              role: { id: 'role-tech', name: 'Technician', hierarchyLevel: 10 },
              sessions: [],
            };
          }
          return {
            id: inClusterTechId,
            nik: '882101',
            username: 'tech.plb1',
            fullName: 'Tech PLB1',
            vendorCompany: 'PT Mitra',
            roleId: 'role-tech',
            userType: 'TECHNICIAN',
            assignedClusters: ['PLB-01'],
            isActive: true,
            twoFactorEnabled: false,
            telegramChatId: null,
            createdAt: new Date(),
            role: { id: 'role-tech', name: 'Technician', hierarchyLevel: 10 },
            sessions: [],
          };
        }) as unknown as typeof prisma.user.findUnique),
      );

      const crossClusterPatchRes = await adminUsersPatch(
        createNextRequest(`http://localhost:3000/api/v1/admin/users/${outClusterTechId}`, {
          method: 'PATCH',
          cookies: { fiberops_session: adminToken },
          jsonBody: { fullName: 'Hijacked Name' },
        }),
        { params: Promise.resolve({ id: outClusterTechId }) },
      );
      assert.strictEqual(
        crossClusterPatchRes.status,
        403,
        `AUTH-03: Level-50 admin modifying user outside assignedClusters must return 403, got ${crossClusterPatchRes.status}`,
      );

      // Granting out-of-cluster assignedClusters ['PLB-01', 'PLB-02'] to an in-cluster user must return 403
      const grantOutClusterRes = await adminUsersPatch(
        createNextRequest(`http://localhost:3000/api/v1/admin/users/${inClusterTechId}`, {
          method: 'PATCH',
          cookies: { fiberops_session: adminToken },
          jsonBody: { assignedClusters: ['PLB-01', 'PLB-02'] },
        }),
        { params: Promise.resolve({ id: inClusterTechId }) },
      );
      assert.strictEqual(
        grantOutClusterRes.status,
        403,
        `AUTH-03: Level-50 admin granting out-of-cluster assignedClusters must return 403, got ${grantOutClusterRes.status}`,
      );
    });
  });

  it('AUTH-06: rate limiting resists leftmost X-Forwarded-For spoofing, enforces per-challenge OTP limits, and escapes Telegram HTML', async () => {
    const tgFetch = createTelegramCaptureFetch();
    restoreFns.push(tgFetch.install());

    // 1. Login rate limit must NOT be bypassed by rotating leftmost X-Forwarded-For while x-real-ip is constant
    const targetUser = `ratelimit.user.${Date.now()}`;
    let lastStatus = 0;
    let lastRetryAfter: string | null = null;
    for (let i = 1; i <= 7; i++) {
      const req = createNextRequest('http://localhost:3000/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'x-forwarded-for': `198.51.100.${i}, 203.0.113.10`,
          'x-real-ip': '203.0.113.10',
        },
        jsonBody: { username: targetUser, password: 'WrongPassword123!' },
      });
      const res = await authLoginPost(req);
      lastStatus = res.status;
      lastRetryAfter = res.headers.get('Retry-After');
    }
    assert.strictEqual(
      lastStatus,
      429,
      'AUTH-06: Rotating leftmost X-Forwarded-For must NOT bypass login rate limit when x-real-ip is fixed',
    );
    assert.ok(lastRetryAfter && Number(lastRetryAfter) >= 1, 'AUTH-06: 429 response must include Retry-After header');

    // 2. verify-otp rate limit must ALSO key by challengeId/account across varying client IPs
    const preAuth = await AuthService.generatePreAuthToken({
      userId: crypto.randomUUID(),
      username: 'superadmin',
      challengeId: crypto.randomUUID(),
      channel: 'web',
    });
    let otpLimitStatus = 0;
    for (let i = 1; i <= 8; i++) {
      const req = createNextRequest('http://localhost:3000/api/v1/auth/verify-otp', {
        method: 'POST',
        headers: {
          'x-real-ip': `192.0.2.${i}`,
        },
        jsonBody: { preAuthToken: preAuth, otpCode: '000000' },
      });
      const res = await authVerifyOtpPost(req);
      otpLimitStatus = res.status;
      if (otpLimitStatus === 429) break;
    }
    assert.strictEqual(
      otpLimitStatus,
      429,
      'AUTH-06: verify-otp must enforce per-challengeId/user rate limiting even when client IP rotates',
    );

    // 3. resend-otp must resist XFF spoofing and enforce per-challengeId rate limit across rotating IPs
    const resendPreAuth = await AuthService.generatePreAuthToken({
      userId: crypto.randomUUID(),
      username: 'superadmin',
      challengeId: crypto.randomUUID(),
      channel: 'web',
    });
    restoreFns.push(
      stubMethod(AuthService, 'resendWebOtp', (async () => ({
        requiresTwoFactor: true as const,
        preAuthToken: resendPreAuth,
        expiresIn: 300,
        resendCooldown: 30,
        deliveryStatus: 'SENT' as const,
        maskedChatId: '••••9677',
        botUsername: 'FiberOpsNOCBot',
      })) as unknown as typeof AuthService.resendWebOtp),
    );

    let resendXffStatus = 0;
    let resendXffRetryAfter: string | null = null;
    for (let i = 1; i <= 6; i++) {
      const req = createNextRequest('http://localhost:3000/api/v1/auth/resend-otp', {
        method: 'POST',
        headers: {
          'x-forwarded-for': `198.51.100.${i}, 203.0.113.88`,
          'x-real-ip': '203.0.113.88',
        },
        jsonBody: { preAuthToken: resendPreAuth },
      });
      const res = await authResendOtpPost(req);
      resendXffStatus = res.status;
      resendXffRetryAfter = res.headers.get('Retry-After');
      if (resendXffStatus === 429) break;
    }
    assert.strictEqual(
      resendXffStatus,
      429,
      'AUTH-06: Rotating leftmost XFF on resend-otp must NOT bypass rate limit',
    );
    assert.ok(resendXffRetryAfter && Number(resendXffRetryAfter) >= 1);

    const perChallengePreAuth = await AuthService.generatePreAuthToken({
      userId: crypto.randomUUID(),
      username: 'superadmin',
      challengeId: crypto.randomUUID(),
      channel: 'web',
    });
    let resendChallengeLimitStatus = 0;
    for (let i = 1; i <= 7; i++) {
      const req = createNextRequest('http://localhost:3000/api/v1/auth/resend-otp', {
        method: 'POST',
        headers: { 'x-real-ip': `198.51.100.${100 + i}` },
        jsonBody: { preAuthToken: perChallengePreAuth },
      });
      const res = await authResendOtpPost(req);
      resendChallengeLimitStatus = res.status;
      if (resendChallengeLimitStatus === 429) break;
    }
    assert.strictEqual(
      resendChallengeLimitStatus,
      429,
      'AUTH-06: resend-otp must enforce per-challengeId rate limit even when client IP rotates',
    );

    // 4. Telegram HTML escaping on OTP AND non-OTP dynamic fields
    await telegramLib.sendTelegramOtpMessage({
      chatId: '7072749677',
      otpCode: '654321',
      username: 'op<script>xss</script>',
      fullName: 'Budi <img src=x onerror=alert(1)>',
      clientIp: '<b>spoofed</b>',
    });
    assert.ok(tgFetch.capturedMessages.length > 0, 'Expected Telegram sendMessage fetch call');
    const sentText = tgFetch.capturedMessages[tgFetch.capturedMessages.length - 1]!.text;
    assert.doesNotMatch(sentText, /<script>|<img\s+src=x|<b>spoofed<\/b>/i, 'AUTH-06: Unescaped HTML tags must not appear in Telegram HTML body');
    assert.match(sentText, /&lt;script&gt;|&lt;img/, 'AUTH-06: Dynamic fields in Telegram messages must be HTML-escaped');

    await telegramLib.sendVendorTaskDispatchTelegram({
      chatId: '7072749677',
      vendorDisplayName: 'Tech <script>evil()</script>',
      ticketNumber: 'WO-2026-001',
      ticketType: 'MAINTENANCE',
      customerName: 'PT <img src=x onerror=alert(1)>',
      siaNumber: '100245',
      complaintSummary: '<a href="https://evil.com">Click</a>',
    });
    const dispatchMsg = tgFetch.capturedMessages[tgFetch.capturedMessages.length - 1]!.text;
    assert.doesNotMatch(
      dispatchMsg,
      /<script>|<img\s+src=x|<a href="https:\/\/evil\.com">/i,
      'AUTH-06: Non-OTP dispatch Telegram message must escape HTML injection in dynamic fields',
    );

    await telegramLib.sendVendorVerificationResultTelegram({
      chatId: '7072749677',
      ticketNumber: 'WO-2026-001',
      customerName: 'Cust <script>alert(1)</script>',
      approved: false,
      reason: '<b>Injected</b> <img src=x>',
    });
    const verifyMsg = tgFetch.capturedMessages[tgFetch.capturedMessages.length - 1]!.text;
    assert.doesNotMatch(
      verifyMsg,
      /<script>|<b>Injected<\/b>|<img\s+src=x>/i,
      'AUTH-06: Verification result Telegram message must escape HTML injection in reason/customerName',
    );
  });

  it('AUTH-07: resolveTechActor enforces JWT verification, DB isActive, and active non-revoked UserSession', async (t) => {
    const techId = crypto.randomUUID();
    const deviceId = crypto.randomUUID();
    const techToken = await mintTestJwt(
      {
        username: 'tech.andi',
        role: 'Vendor / Teknisi Lapangan',
        userType: 'TECHNICIAN',
        hierarchyLevel: 10,
        assignedClusters: ['PLB-01'],
        deviceId,
        tokenType: 'access',
      },
      { subject: techId, audience: 'mobile' },
    );

    // 1. Spoofed internal headers WITHOUT JWT must be rejected
    const spoofedHeaderReq = createNextRequest('http://localhost:3000/api/v1/tech/tickets', {
      headers: {
        'x-user-id': techId,
        'x-username': 'tech.andi',
        'x-user-type': 'TECHNICIAN',
      },
    });
    await assert.rejects(
      () => techAuth.resolveTechActor(spoofedHeaderReq),
      'AUTH-07: resolveTechActor must reject raw x-user-id/x-username headers without verified JWT',
    );

    await withMockTcpDbServer(async () => {
      // 2. Deactivated technician (isActive: false) must be rejected even with valid JWT
      restoreFns.push(
        stubMethod(prisma.user, 'findUnique', (async () => ({
          id: techId,
          nik: '882043',
          username: 'tech.andi',
          fullName: 'Andi Pratama',
          vendorCompany: 'PT Mitra',
          userType: 'TECHNICIAN',
          isActive: false,
          assignedClusters: ['PLB-01'],
          role: { name: 'Technician', hierarchyLevel: 10, permissions: ['ticket:read', 'ticket:submit'] },
        })) as unknown as typeof prisma.user.findUnique),
      );
      restoreFns.push(
        stubMethod(prisma.userSession, 'findFirst', (async () => ({
          id: crypto.randomUUID(),
        })) as unknown as typeof prisma.userSession.findFirst),
      );

      const deactivatedReq = createNextRequest('http://localhost:3000/api/v1/tech/tickets', {
        headers: {
          authorization: `Bearer ${techToken}`,
          'x-device-id': deviceId,
        },
      });
      const deactivatedRes = await techTicketsGet(deactivatedReq);
      assert.strictEqual(
        deactivatedRes.status,
        401,
        `AUTH-07: Deactivated technician (isActive: false) must receive 401, got ${deactivatedRes.status}`,
      );

      // 3. Active tech but revoked UserSession (findFirst returns null) must be rejected
      restoreFns.push(
        stubMethod(prisma.user, 'findUnique', (async () => ({
          id: techId,
          nik: '882043',
          username: 'tech.andi',
          fullName: 'Andi Pratama',
          vendorCompany: 'PT Mitra',
          userType: 'TECHNICIAN',
          isActive: true,
          assignedClusters: ['PLB-01'],
          role: { name: 'Technician', hierarchyLevel: 10, permissions: ['ticket:read', 'ticket:submit'] },
        })) as unknown as typeof prisma.user.findUnique),
      );
      restoreFns.push(
        stubMethod(prisma.userSession, 'findFirst', (async () => null) as unknown as typeof prisma.userSession.findFirst),
      );

      const revokedSessionReq = createNextRequest('http://localhost:3000/api/v1/tech/tickets', {
        headers: {
          authorization: `Bearer ${techToken}`,
          'x-device-id': deviceId,
        },
      });
      const revokedSessionRes = await techTicketsGet(revokedSessionReq);
      assert.strictEqual(
        revokedSessionRes.status,
        401,
        `AUTH-07: Technician with revoked UserSession must receive 401, got ${revokedSessionRes.status}`,
      );
    });
  });

  it('AUTH-08: PATCH /api/v1/admin/roles sanitizes DTO (no passwordHash), syncs userType, validates permission subset and Zod input', async (t) => {
    const superAdminId = crypto.randomUUID();
    const targetUserId = crypto.randomUUID();
    const techRoleId = crypto.randomUUID();
    const superToken = await mintTestJwt(
      {
        username: 'superadmin',
        role: 'Super Admin',
        userType: 'SUPER_ADMIN',
        hierarchyLevel: 100,
        assignedClusters: ['PLB-01', 'PLB-02'],
        permissions: ['*'],
        tokenType: 'access',
      },
      { subject: superAdminId, audience: 'web' },
    );

    const limitedAdminId = crypto.randomUUID();
    const limitedToken = await mintTestJwt(
      {
        username: 'role.editor',
        role: 'Role Editor',
        userType: 'ADMIN',
        hierarchyLevel: 50,
        assignedClusters: ['PLB-01'],
        permissions: ['role:edit', 'ticket:read'],
        tokenType: 'access',
      },
      { subject: limitedAdminId, audience: 'web' },
    );

    await withMockTcpDbServer(async () => {
      // 1. Malformed payload must fail Zod validation with 400
      const badReq = createNextRequest('http://localhost:3000/api/v1/admin/roles', {
        method: 'PATCH',
        cookies: { fiberops_session: superToken },
        jsonBody: { targetUserId: 'not-a-uuid', newRoleId: '' },
      });
      const badRes = await adminRolesPatch(badReq);
      assert.strictEqual(badRes.status, 400, 'AUTH-08: Malformed PATCH /admin/roles payload must return 400');

      // 2. Admin without network:update permission attempting to grant network:update must get 403
      restoreFns.push(
        stubMethod(prisma.user, 'findUnique', (async (args: { where: { id: string } }) => {
          if (args.where.id === limitedAdminId) {
            return {
              id: limitedAdminId,
              nik: '882050',
              username: 'role.editor',
              fullName: 'Role Editor',
              vendorCompany: null,
              userType: 'ADMIN',
              isActive: true,
              assignedClusters: ['PLB-01'],
              role: {
                id: 'role-editor',
                name: 'Role Editor',
                hierarchyLevel: 50,
                permissions: ['role:edit', 'ticket:read'],
              },
            };
          }
          return null;
        }) as unknown as typeof prisma.user.findUnique),
      );
      restoreFns.push(
        stubMethod(prisma.role, 'findUnique', (async () => ({
          id: techRoleId,
          name: 'NOC Monitoring',
          hierarchyLevel: 30,
          permissions: ['ticket:read'],
        })) as unknown as typeof prisma.role.findUnique),
      );
      restoreFns.push(
        stubMethod(prisma.role, 'findFirst', (async () => ({
          id: 'role-editor',
          name: 'Role Editor',
          hierarchyLevel: 50,
          permissions: ['role:edit', 'ticket:read'],
        })) as unknown as typeof prisma.role.findFirst),
      );

      const escalatePermReq = createNextRequest('http://localhost:3000/api/v1/admin/roles', {
        method: 'PATCH',
        cookies: { fiberops_session: limitedToken },
        jsonBody: {
          roleId: techRoleId,
          permissions: ['ticket:read', 'network:update'],
        },
      });
      const escalatePermRes = await adminRolesPatch(escalatePermReq);
      assert.strictEqual(
        escalatePermRes.status,
        403,
        `AUTH-08: Granting unpossessed permission via PATCH /admin/roles must return 403, got ${escalatePermRes.status}`,
      );

      // 3. Reassigning user role must NEVER return passwordHash/raw telegramChatId, MUST sync userType, and MUST revoke sessions
      let capturedUserUpdateData = null as Record<string, unknown> | null;
      let userSessionUpdateManyCalled = false;
      let redisBlacklistCalled = false;
      restoreFns.push(
        stubMethod(redisManager, 'blacklistSession', (async () => {
          redisBlacklistCalled = true;
        }) as unknown as typeof redisManager.blacklistSession),
      );
      restoreFns.push(
        stubMethod(prisma.user, 'findUnique', (async (args: { where: { id: string } }) => {
          if (args.where.id === superAdminId) {
            return {
              id: superAdminId,
              nik: '882041',
              username: 'superadmin',
              fullName: 'Aditya Saputra',
              vendorCompany: null,
              userType: 'SUPER_ADMIN',
              isActive: true,
              assignedClusters: ['PLB-01', 'PLB-02'],
              role: { id: 'role-super-admin', name: 'Super Admin', hierarchyLevel: 100, permissions: ['*'] },
            };
          }
          return {
            id: targetUserId,
            nik: '882099',
            username: 'ops.demote',
            fullName: 'Ops User',
            vendorCompany: null,
            passwordHash: '$2b$10$SECRET_HASH_MUST_NOT_LEAK',
            telegramChatId: '7072749677',
            roleId: 'role-admin-ops',
            userType: 'ADMIN',
            assignedClusters: ['PLB-01'],
            isActive: true,
            twoFactorEnabled: true,
            createdAt: new Date(),
            sessions: [{ deviceId: 'dev-ops-demote-1' }],
            role: { id: 'role-admin-ops', name: 'Admin Operasional', hierarchyLevel: 50, permissions: ['ticket:read'] },
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
        stubMethod(prisma.user, 'update', (async (args: { data: Record<string, unknown> }) => {
          capturedUserUpdateData = args.data;
          return {
            id: targetUserId,
            nik: '882099',
            username: 'ops.demote',
            fullName: 'Ops User',
            vendorCompany: null,
            passwordHash: '$2b$10$SECRET_HASH_MUST_NOT_LEAK',
            telegramChatId: '7072749677',
            roleId: techRoleId,
            userType: args.data.userType ?? 'ADMIN',
            assignedClusters: ['PLB-01'],
            isActive: true,
            twoFactorEnabled: true,
            createdAt: new Date(),
            role: { id: techRoleId, name: 'Vendor / Teknisi Lapangan', hierarchyLevel: 10 },
          };
        }) as unknown as typeof prisma.user.update),
      );
      restoreFns.push(
        stubMethod(prisma.userSession, 'updateMany', (async () => {
          userSessionUpdateManyCalled = true;
          return { count: 1 };
        }) as unknown as typeof prisma.userSession.updateMany),
      );
      restoreFns.push(
        stubMethod(prisma.activityLog, 'create', (async () => ({
          id: 'log-1',
        })) as unknown as typeof prisma.activityLog.create),
      );

      const reassignReq = createNextRequest('http://localhost:3000/api/v1/admin/roles', {
        method: 'PATCH',
        cookies: { fiberops_session: superToken },
        jsonBody: { targetUserId, newRoleId: techRoleId },
      });
      const reassignRes = await adminRolesPatch(reassignReq);
      assert.strictEqual(reassignRes.status, 200);
      const reassignBody = await reassignRes.text();
      assert.strictEqual(
        reassignBody.includes('SECRET_HASH_MUST_NOT_LEAK') || reassignBody.includes('passwordHash'),
        false,
        'AUTH-08: PATCH /admin/roles response must NEVER leak passwordHash',
      );
      assert.strictEqual(
        reassignBody.includes('7072749677'),
        false,
        'AUTH-08: PATCH /admin/roles response must NOT leak raw telegramChatId',
      );
      assert.strictEqual(
        capturedUserUpdateData?.userType,
        'TECHNICIAN',
        'AUTH-08: Reassigning ADMIN to Technician role must synchronize userType to TECHNICIAN',
      );
      assert.strictEqual(
        userSessionUpdateManyCalled,
        true,
        'AUTH-08: Reassigning user role via PATCH /admin/roles must revoke active UserSession rows in DB',
      );
      assert.strictEqual(
        redisBlacklistCalled,
        true,
        'AUTH-08: Reassigning user role must blacklist active sessions in Redis',
      );
    });
  });

  it('AUTH-10: restricts /admin/settings and backup to SUPER_ADMIN, encrypts backups, and serves /ota/manifest without infra probes', async (t) => {
    const level50AdminToken = await mintTestJwt(
      {
        username: 'admin.noc',
        role: 'Admin Operasional / NOC',
        userType: 'ADMIN',
        hierarchyLevel: 50,
        assignedClusters: ['PLB-01'],
        permissions: ['ticket:read', 'tech:manage'],
        tokenType: 'access',
      },
      { subject: crypto.randomUUID(), audience: 'web' },
    );

    const getSettingsRes = await adminSettingsGet(
      createNextRequest('http://localhost:3000/api/v1/admin/settings', {
        cookies: { fiberops_session: level50AdminToken },
      }),
    );
    assert.strictEqual(
      getSettingsRes.status,
      403,
      `AUTH-10: Level-50 Admin must be denied GET /admin/settings (403), got ${getSettingsRes.status}`,
    );

    const putSettingsRes = await adminSettingsPut(
      createNextRequest('http://localhost:3000/api/v1/admin/settings', {
        method: 'PUT',
        cookies: { fiberops_session: level50AdminToken },
        jsonBody: { companyName: 'Hijacked ISP' },
      }),
    );
    assert.strictEqual(
      putSettingsRes.status,
      403,
      `AUTH-10: Level-50 Admin must be denied PUT /admin/settings (403), got ${putSettingsRes.status}`,
    );

    const postBackupRes = await adminBackupPost(
      createNextRequest('http://localhost:3000/api/v1/admin/settings/backup', {
        method: 'POST',
        cookies: { fiberops_session: level50AdminToken },
      }),
    );
    assert.strictEqual(
      postBackupRes.status,
      403,
      `AUTH-10: Level-50 Admin must be denied POST /admin/settings/backup (403), got ${postBackupRes.status}`,
    );

    // Verify SUPER_ADMIN GET /admin/settings does not leak backup encryption keys or server secrets
    const superAdminToken = await mintTestJwt(
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
    const superGetSettingsRes = await adminSettingsGet(
      createNextRequest('http://localhost:3000/api/v1/admin/settings', {
        cookies: { fiberops_session: superAdminToken },
      }),
    );
    assert.strictEqual(
      superGetSettingsRes.status,
      200,
      `AUTH-10: SUPER_ADMIN GET /admin/settings must return 200, got ${superGetSettingsRes.status}`,
    );
    const settingsText = await superGetSettingsRes.text();
    assert.strictEqual(
      settingsText.includes(TEST_JWT_SECRET) ||
        settingsText.includes(TEST_TELEGRAM_WEBHOOK_SECRET) ||
        /minioSecretKey|backupEncryptionKey|jwtSecret|hmacActionSecret/i.test(settingsText),
      false,
      'AUTH-10: GET /admin/settings must never leak server secrets or backup encryption keys',
    );

    // Verify backup encryption (ciphertext must NOT start with raw gzip magic 1f 8b) and dedicated MINIO_BACKUP_BUCKET
    const uploadedBuffers: Array<{ key: string; buf: Buffer; bucket?: string }> = [];
    const managerObj = minioLib.minioManager as unknown as Record<string, unknown>;
    restoreFns.push(
      stubMethod(minioLib.minioManager, 'putObjectBuffer', (async (
        key: string,
        buf: Buffer,
        _contentType?: string,
        bucket?: string,
      ) => {
        uploadedBuffers.push({ key, buf, bucket });
        return { stored: true, objectKey: key };
      }) as typeof minioLib.minioManager.putObjectBuffer),
    );
    if (typeof managerObj.putBackupObjectBuffer === 'function') {
      const origPutBackup = managerObj.putBackupObjectBuffer;
      managerObj.putBackupObjectBuffer = async (key: string, buf: Buffer) => {
        uploadedBuffers.push({ key, buf, bucket: process.env.MINIO_BACKUP_BUCKET || 'fiberops-backups' });
        return { stored: true, objectKey: key };
      };
      restoreFns.push(() => {
        managerObj.putBackupObjectBuffer = origPutBackup;
      });
    }

    const superActor: UserSessionContext = {
      userId: crypto.randomUUID(),
      username: 'superadmin',
      fullName: 'Aditya',
      role: 'Super Admin',
      userType: 'SUPER_ADMIN',
      hierarchyLevel: 100,
      assignedClusters: ['PLB-01'],
    };

    await withMockTcpDbServer(async () => {
      restoreFns.push(stubMethod(prisma.systemConfig, 'findUnique', (async () => null) as unknown as typeof prisma.systemConfig.findUnique));
      restoreFns.push(stubMethod(prisma.backupRecord, 'findMany', (async () => []) as unknown as typeof prisma.backupRecord.findMany));
      restoreFns.push(stubMethod(prisma.networkCluster, 'findMany', (async () => []) as unknown as typeof prisma.networkCluster.findMany));
      restoreFns.push(stubMethod(prisma.networkSplitter, 'findMany', (async () => []) as unknown as typeof prisma.networkSplitter.findMany));
      restoreFns.push(stubMethod(prisma.customer, 'findMany', (async () => []) as unknown as typeof prisma.customer.findMany));
      restoreFns.push(stubMethod(prisma.ticket, 'findMany', (async () => []) as unknown as typeof prisma.ticket.findMany));
      restoreFns.push(stubMethod(prisma.role, 'findMany', (async () => []) as unknown as typeof prisma.role.findMany));
      restoreFns.push(stubMethod(prisma.attenuationHistory, 'count', (async () => 0) as unknown as typeof prisma.attenuationHistory.count));
      restoreFns.push(
        stubMethod(prisma, '$transaction', (async (cb: (tx: unknown) => Promise<unknown>) => {
          return await cb({
            backupRecord: { create: async () => ({ id: crypto.randomUUID() }) },
            activityLog: { create: async () => ({ id: crypto.randomUUID() }) },
          });
        }) as unknown as typeof prisma.$transaction),
      );

      await SystemService.triggerBackupSnapshot(superActor);
    });

    assert.strictEqual(
      uploadedBuffers.length,
      1,
      `AUTH-10: triggerBackupSnapshot must upload exactly 1 encrypted backup object, got ${uploadedBuffers.length}`,
    );
    const buf = uploadedBuffers[0]!.buf;
    const isRawGzip = buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
    assert.strictEqual(
      isRawGzip,
      false,
      'AUTH-10: Backup payload must be encrypted (AES-256-GCM), not raw plaintext gzip (1f 8b)',
    );
    const systemSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'web', 'src', 'server', 'services', 'system.service.ts'),
      'utf8',
    );
    const minioSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'web', 'src', 'server', 'lib', 'minio.ts'),
      'utf8',
    );
    assert.match(
      `${systemSrc}\n${minioSrc}`,
      /MINIO_BACKUP_BUCKET/,
      'AUTH-10: Backup storage must use a dedicated MINIO_BACKUP_BUCKET isolated from fiberops-proofs',
    );

    // Verify /api/v1/ota/manifest does not invoke MinIO listObjectsV2 / Ollama health probes
    let minioStatsCalled = false;
    let ollamaProbeCalled = false;
    t.mock.method(minioLib.minioManager, 'getBucketUsageStats', async () => {
      minioStatsCalled = true;
      return { objectCount: 0, totalBytes: 0 };
    });
    t.mock.method(ollamaLib.ollamaClient, 'isHealthy', async () => {
      ollamaProbeCalled = true;
      return false;
    });

    const otaRes = await otaManifestGet();
    assert.strictEqual(otaRes.status, 200);
    const otaJson = (await otaRes.json()) as { success: boolean; data: Record<string, unknown> };
    assert.strictEqual(otaJson.success, true);
    assert.ok(otaJson.data.runtimeVersion);
    assert.strictEqual(minioStatsCalled, false, 'AUTH-10: /ota/manifest must not scan MinIO bucket');
    assert.strictEqual(ollamaProbeCalled, false, 'AUTH-10: /ota/manifest must not probe Ollama');
  });

  it('AUTH-13: Telegram /lapor rejects missing GPS/photo without fabrication and createUser does not assign FiberOps#2026', async (t) => {
    const tgFetch = createTelegramCaptureFetch();
    restoreFns.push(tgFetch.install());

    // 1. /lapor without GPS and photo must NOT submit report with fabricated target coords or .txt proof
    await withMockTcpDbServer(async () => {
      const techId = '00000000-0000-4000-8000-000000000003';
      restoreFns.push(
        stubMethod(prisma.user, 'findFirst', (async () => ({
          id: techId,
          nik: '882043',
          username: 'tech.andi',
          fullName: 'Andi Pratama',
          vendorCompany: 'PT Mitra',
          passwordHash: 'hash',
          telegramChatId: '555444333',
          twoFactorEnabled: true,
          userType: 'TECHNICIAN',
          isActive: true,
          assignedClusters: ['PLB-01'],
          role: { id: 'r1', name: 'Technician', hierarchyLevel: 10, permissions: ['ticket:read', 'ticket:submit'] },
        })) as unknown as typeof prisma.user.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma.user, 'findMany', (async () => []) as unknown as typeof prisma.user.findMany),
      );

      const laporReq = createNextRequest('http://localhost:3000/api/v1/telegram/webhook', {
        headers: { 'x-telegram-bot-api-secret-token': TEST_TELEGRAM_WEBHOOK_SECRET },
        jsonBody: {
          update_id: 2001,
          message: {
            message_id: 10,
            chat: { id: 555444333, type: 'private' },
            text: '/lapor WO-2025-0842 | ODP-PLB-034 | 2 | -19.2 | Done without photo or GPS',
          },
        },
      });
      const laporRes = await telegramWebhookPost(laporReq);
      const laporJson = (await laporRes.json()) as { action?: string };
      assert.notStrictEqual(
        laporJson.action,
        'report_submitted',
        'AUTH-13: Telegram /lapor without genuine photo and GPS location must be rejected (no .txt or coordinate fabrication)',
      );

      // 1b. /lapor WITH GPS location but WITHOUT photo must NOT fabricate a .txt proof objectKey
      const laporGpsNoPhotoReq = createNextRequest('http://localhost:3000/api/v1/telegram/webhook', {
        headers: { 'x-telegram-bot-api-secret-token': TEST_TELEGRAM_WEBHOOK_SECRET },
        jsonBody: {
          update_id: 2002,
          message: {
            message_id: 11,
            chat: { id: 555444333, type: 'private' },
            text: '/lapor WO-2025-0842 | ODP-PLB-034 | 2 | -19.2 | GPS only without photo',
            location: { latitude: -2.976383, longitude: 104.741487 },
          },
        },
      });
      const laporGpsNoPhotoRes = await telegramWebhookPost(laporGpsNoPhotoReq);
      const laporGpsNoPhotoJson = (await laporGpsNoPhotoRes.json()) as { action?: string };
      assert.notStrictEqual(
        laporGpsNoPhotoJson.action,
        'report_submitted',
        'AUTH-13: Telegram /lapor with GPS but WITHOUT photo must be rejected (never fabricate .txt proof)',
      );
    });

    // 1c. downloadTelegramFileBuffer must enforce >10MB size cap and reject non-image magic bytes
    const origFetch = globalThis.fetch;
    try {
      // Case A: >10MB payload
      globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/getFile')) {
          return new Response(JSON.stringify({ ok: true, result: { file_path: 'photos/huge.jpg', file_size: 11 * 1024 * 1024 } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(new Uint8Array(11 * 1024 * 1024), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(11 * 1024 * 1024) },
        });
      };
      const hugeRes = await telegramLib.downloadTelegramFileBuffer('file-huge-11mb');
      assert.strictEqual(hugeRes, null, 'AUTH-13: downloadTelegramFileBuffer must reject files >10MB');

      // Case B: Non-image magic bytes (HTML masquerading as image/jpeg)
      globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/getFile')) {
          return new Response(JSON.stringify({ ok: true, result: { file_path: 'photos/fake.jpg', file_size: 64 } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('<html><script>alert(1)</script></html>', {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        });
      };
      const fakeImgRes = await telegramLib.downloadTelegramFileBuffer('file-fake-html');
      assert.strictEqual(fakeImgRes, null, 'AUTH-13: downloadTelegramFileBuffer must reject non-image magic bytes');
    } finally {
      globalThis.fetch = origFetch;
    }

    // 2. createUser without password must NOT silently assign default 'FiberOps#2026'
    await withMockTcpDbServer(async () => {
      const superActor: UserSessionContext = {
        userId: crypto.randomUUID(),
        username: 'superadmin',
        fullName: 'Aditya',
        role: 'Super Admin',
        userType: 'SUPER_ADMIN',
        hierarchyLevel: 100,
        assignedClusters: ['PLB-01'],
      };
      let storedPasswordHash: string | null = null;
      restoreFns.push(
        stubMethod(prisma.role, 'findFirst', (async () => ({
          id: 'role-tech',
          name: 'Vendor / Teknisi Lapangan',
          hierarchyLevel: 10,
          permissions: ['ticket:read', 'ticket:submit'],
        })) as unknown as typeof prisma.role.findFirst),
      );
      restoreFns.push(
        stubMethod(prisma.user, 'findFirst', (async () => null) as unknown as typeof prisma.user.findFirst),
      );

      // Call createUser expecting either an explicit password-validation error OR a non-default CSPRNG password
      let validatedMissingPasswordRejection = false;
      try {
        const webRequire = createRequire(`${resolveRepoRoot()}/apps/web/package.json`);
        const bcrypt = webRequire('bcryptjs') as typeof import('bcryptjs');
        restoreFns.push(
          stubMethod(prisma, '$transaction', (async (cb: (tx: unknown) => Promise<unknown>) => {
            const mockTx = {
              user: {
                create: async (args: { data: { passwordHash: string } }) => {
                  storedPasswordHash = args.data.passwordHash;
                  return {
                    id: crypto.randomUUID(),
                    nik: '991122',
                    username: 'new.tech.user',
                    fullName: 'New Tech',
                    vendorCompany: null,
                    roleId: 'role-tech',
                    userType: 'TECHNICIAN',
                    assignedClusters: ['PLB-01'],
                    isActive: true,
                    twoFactorEnabled: false,
                    telegramChatId: null,
                    createdAt: new Date(),
                    role: { id: 'role-tech', name: 'Vendor / Teknisi Lapangan', hierarchyLevel: 10 },
                  };
                },
              },
              activityLog: { create: async () => ({ id: 'a1' }) },
            };
            return await cb(mockTx);
          }) as unknown as typeof prisma.$transaction),
        );

        await RoleService.createUser(superActor, {
          fullName: 'New Tech',
          nik: '991122',
          username: 'new.tech.user',
          roleName: 'Vendor / Teknisi Lapangan',
          assignedClusters: ['PLB-01'],
        });

        if (storedPasswordHash) {
          const matchesStaticDefault = await bcrypt.compare('FiberOps#2026', storedPasswordHash);
          assert.strictEqual(
            matchesStaticDefault,
            false,
            'AUTH-13: createUser must NEVER assign static default password FiberOps#2026',
          );
        }
      } catch (err: unknown) {
        const e = err as Error & { code?: string; statusCode?: number };
        const isValidationError =
          e.statusCode === 400 ||
          e.code === ERROR_CODES.VALIDATION_ERROR ||
          /password|sandi/i.test(e.message);
        assert.strictEqual(
          isValidationError,
          true,
          `AUTH-13: Expected explicit password validation error, got unexpected error: ${e.message}`,
        );
        validatedMissingPasswordRejection = true;
      }
      assert.ok(
        validatedMissingPasswordRejection || storedPasswordHash !== null,
        'AUTH-13: createUser must either reject missing password with validation error or generate non-static CSPRNG password',
      );
    });
  });

  it('AUTH-14: hardens /health disclosure, /download/mobile-latest.apk missing-APK leakage, GET /admin/roles RBAC, and pre-2FA login PII leak', async (t) => {
    const tgFetch = createTelegramCaptureFetch();
    restoreFns.push(tgFetch.install());

    // 1. /health must omit strictLiveData and stack/version/env disclosure
    const healthRes = await healthGet();
    const healthJson = (await healthRes.json()) as Record<string, unknown>;
    assert.strictEqual(
      healthJson.strictLiveData,
      undefined,
      'AUTH-14: /api/v1/health must not disclose strictLiveData internal config flag',
    );
    assert.strictEqual(healthJson.stack, undefined, 'AUTH-14: /health must not disclose stack');
    assert.strictEqual(healthJson.nodeVersion, undefined, 'AUTH-14: /health must not disclose nodeVersion');
    assert.strictEqual(healthJson.env, undefined, 'AUTH-14: /health must not disclose env');
    assert.strictEqual(healthJson.databaseUrl, undefined, 'AUTH-14: /health must not disclose databaseUrl');

    // 2. /download/mobile-latest.apk when binary missing must return 404/503 without buildRunbook shell commands
    const prevApkPath = process.env.APK_FILE_PATH;
    process.env.APK_FILE_PATH = path.join(repoRoot, 'nonexistent-apk-file-e2e.apk');
    const apkRes = await apkDownloadGet();
    if (prevApkPath === undefined) {
      delete process.env.APK_FILE_PATH;
    } else {
      process.env.APK_FILE_PATH = prevApkPath;
    }
    const apkBodyText = await apkRes.text();
    assert.ok(
      apkRes.status === 404 || apkRes.status === 503,
      `AUTH-14: Missing APK must return 404/503, got ${apkRes.status}`,
    );
    assert.strictEqual(
      apkBodyText.includes('pnpm --filter') || apkBodyText.includes('buildRunbook'),
      false,
      'AUTH-14: Missing APK response must not leak buildRunbook shell commands',
    );

    // 3. GET /api/v1/admin/roles without role:read/role:edit permission must return 403
    const dispatcherToken = await mintTestJwt(
      {
        username: 'dispatcher',
        role: 'Dispatcher / Helpdesk',
        userType: 'ADMIN',
        hierarchyLevel: 30,
        assignedClusters: ['PLB-01'],
        permissions: ['ticket:read', 'ticket:create', 'customer:read'],
        tokenType: 'access',
      },
      { subject: crypto.randomUUID(), audience: 'web' },
    );
    const getRolesRes = await adminRolesGet(
      createNextRequest('http://localhost:3000/api/v1/admin/roles', {
        cookies: { fiberops_session: dispatcherToken },
      }),
    );
    assert.strictEqual(
      getRolesRes.status,
      403,
      `AUTH-14: GET /admin/roles without role:read must return 403, got ${getRolesRes.status}`,
    );

    // 4. Pre-2FA login response must not expose nik or permissions before OTP is verified
    const passwordHash = await AuthService.hashPassword('StrongAdminPass!2026');
    await withMockTcpDbServer(async () => {
      restoreFns.push(
        stubMethod(prisma.user, 'findUnique', (async () => ({
          id: crypto.randomUUID(),
          nik: '882041',
          username: 'superadmin',
          fullName: 'Aditya Saputra',
          vendorCompany: null,
          passwordHash,
          telegramChatId: '7072749677',
          twoFactorEnabled: true,
          userType: 'SUPER_ADMIN',
          isActive: true,
          assignedClusters: ['PLB-01'],
          role: { id: 'role-super-admin', name: 'Super Admin', hierarchyLevel: 100, permissions: ['*'] },
        })) as unknown as typeof prisma.user.findUnique),
      );

      const loginRes = await authLoginPost(
        createNextRequest('http://localhost:3000/api/v1/auth/login', {
          method: 'POST',
          headers: { 'x-real-ip': '203.0.113.77' },
          jsonBody: { username: 'superadmin', password: 'StrongAdminPass!2026' },
        }),
      );
      assert.strictEqual(loginRes.status, 200);
      const loginJson = (await loginRes.json()) as {
        success: boolean;
        data: { user?: Record<string, unknown> };
      };
      assert.strictEqual(
        loginJson.data.user?.nik,
        undefined,
        'AUTH-14: Pre-2FA login response must omit user.nik before OTP verification',
      );
      assert.strictEqual(
        loginJson.data.user?.permissions,
        undefined,
        'AUTH-14: Pre-2FA login response must omit user.permissions before OTP verification',
      );
    });

    // 5. Password reset via RoleService.updateUser must revoke all active UserSession rows & blacklist Redis sessions
    await withMockTcpDbServer(async () => {
      const superActor: UserSessionContext = {
        userId: crypto.randomUUID(),
        username: 'superadmin',
        fullName: 'Aditya Saputra',
        role: 'Super Admin',
        userType: 'SUPER_ADMIN',
        hierarchyLevel: 100,
        assignedClusters: ['PLB-01'],
      };
      const targetTechId = crypto.randomUUID();
      let dbSessionRevoked = false;
      const blacklistedDevices: string[] = [];

      restoreFns.push(
        stubMethod(redisManager, 'blacklistSession', (async (deviceId: string) => {
          blacklistedDevices.push(deviceId);
        }) as unknown as typeof redisManager.blacklistSession),
      );
      restoreFns.push(
        stubMethod(prisma.user, 'findUnique', (async () => ({
          id: targetTechId,
          nik: '882043',
          username: 'tech.andi',
          fullName: 'Andi Pratama',
          vendorCompany: 'PT Mitra',
          roleId: 'role-tech',
          userType: 'TECHNICIAN',
          assignedClusters: ['PLB-01'],
          isActive: true,
          twoFactorEnabled: false,
          telegramChatId: null,
          createdAt: new Date(),
          role: { id: 'role-tech', name: 'Vendor / Teknisi Lapangan', hierarchyLevel: 10 },
          sessions: [{ deviceId: 'dev-pwd-reset-1' }],
        })) as unknown as typeof prisma.user.findUnique),
      );
      restoreFns.push(
        stubMethod(prisma, '$transaction', (async (cb: (tx: unknown) => Promise<unknown>) => {
          const mockTx = {
            user: {
              update: async () => ({
                id: targetTechId,
                nik: '882043',
                username: 'tech.andi',
                fullName: 'Andi Pratama',
                vendorCompany: 'PT Mitra',
                roleId: 'role-tech',
                userType: 'TECHNICIAN',
                assignedClusters: ['PLB-01'],
                isActive: true,
                twoFactorEnabled: false,
                telegramChatId: null,
                createdAt: new Date(),
                role: { id: 'role-tech', name: 'Vendor / Teknisi Lapangan', hierarchyLevel: 10 },
                sessions: [],
              }),
            },
            userSession: {
              updateMany: async (args: { data?: { revokedAt?: Date } }) => {
                if (args.data?.revokedAt) dbSessionRevoked = true;
                return { count: 1 };
              },
            },
            activityLog: { create: async () => ({ id: 'log-pwd' }) },
          };
          return await cb(mockTx);
        }) as unknown as typeof prisma.$transaction),
      );

      await RoleService.updateUser(superActor, targetTechId, {
        password: 'NewStrongPassword!2026',
      });

      assert.strictEqual(
        dbSessionRevoked,
        true,
        'AUTH-14: Password reset via RoleService.updateUser must revoke active UserSession rows in DB',
      );
      assert.strictEqual(
        blacklistedDevices.includes('dev-pwd-reset-1'),
        true,
        'AUTH-14: Password reset via RoleService.updateUser must blacklist active session devices in Redis',
      );
    });
  });
});
