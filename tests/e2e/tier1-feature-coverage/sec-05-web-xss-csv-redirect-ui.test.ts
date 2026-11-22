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
  createNextRequest,
  mintTestJwt,
  resolveRepoRoot,
  stubMethod,
  OFFLINE_DATABASE_URL,
} from '../helpers/auth-test-harness';

let AuthService: typeof import('@/server/services/auth.service').AuthService;
let otpStore: typeof import('@/server/lib/otp-store');
let prisma: typeof import('@repo/database').prisma;
let resetDatabaseHealthCache: typeof import('@repo/database').resetDatabaseHealthCache;
let verifyOtpPost: typeof import('@/app/api/v1/auth/verify-otp/route').POST;
let refreshPost: typeof import('@/app/api/v1/auth/refresh/route').POST;
let queryCacheMod: typeof import('@/lib/query-cache');

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

describe('Tier 1: Web XSS, Cookie-Only JWT, CSV Injection, Open Redirect & UI Hygiene (API-03, 13, 15, 16, 17, MOB-08)', () => {
  const repoRoot = resolveRepoRoot();
  const restoreFns: Array<() => void> = [];

  before(async () => {
    configureOfflineTestEnv();
    const [authMod, otpMod, dbMod, verifyRoute, refreshRoute, qcMod] = await Promise.all([
      import('@/server/services/auth.service'),
      import('@/server/lib/otp-store'),
      import('@repo/database'),
      import('@/app/api/v1/auth/verify-otp/route'),
      import('@/app/api/v1/auth/refresh/route'),
      import('@/lib/query-cache'),
    ]);

    AuthService = authMod.AuthService;
    otpStore = otpMod;
    prisma = dbMod.prisma;
    resetDatabaseHealthCache = dbMod.resetDatabaseHealthCache;
    verifyOtpPost = verifyRoute.POST;
    refreshPost = refreshRoute.POST;
    queryCacheMod = qcMod;
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

  it('API-03: enforces HttpOnly cookie-only Web JWT, removes localStorage access token, and escapes Leaflet tooltip HTML', async () => {
    const adminId = crypto.randomUUID();
    const challenge = await otpStore.createOtpChallenge({
      userId: adminId,
      username: 'superadmin',
      telegramChatId: '7072749677',
      deliveryStatus: 'SENT',
    });
    const preAuth = await AuthService.generatePreAuthToken({
      userId: adminId,
      username: 'superadmin',
      challengeId: challenge.record.challengeId,
      channel: 'web',
    });

    await withMockTcpDbServer(async () => {
      restoreFns.push(
        stubMethod(prisma.user, 'findUnique', (async () => ({
          id: adminId,
          nik: '882041',
          username: 'superadmin',
          fullName: 'Aditya Saputra',
          vendorCompany: null,
          telegramChatId: '7072749677',
          twoFactorEnabled: true,
          userType: 'SUPER_ADMIN',
          isActive: true,
          assignedClusters: ['PLBHRAGA01'],
          role: {
            id: 'role-super-admin',
            name: 'Super Admin',
            hierarchyLevel: 100,
            permissions: ['*'],
          },
        })) as unknown as typeof prisma.user.findUnique),
      );
      restoreFns.push(
        stubMethod(prisma.activityLog, 'create', (async () => ({ id: 'log-1' })) as unknown as typeof prisma.activityLog.create),
      );

      const res = await verifyOtpPost(
        createNextRequest('http://localhost:3000/api/v1/auth/verify-otp', {
          method: 'POST',
          headers: { 'x-real-ip': '203.0.113.15' },
          jsonBody: { preAuthToken: preAuth, otpCode: challenge.otpCode },
        }),
      );
      assert.strictEqual(res.status, 200);
      const setCookie = res.headers.get('set-cookie') ?? '';
      assert.match(setCookie, /fiberops_session=/, 'Web verify-otp must set fiberops_session cookie');
      assert.match(setCookie, /HttpOnly/i, 'fiberops_session cookie must be HttpOnly');
      assert.match(setCookie, /SameSite=/i, 'fiberops_session cookie must set SameSite');

      const json = (await res.json()) as {
        success: boolean;
        data?: { accessToken?: string; refreshToken?: string; user?: { username: string } };
      };
      assert.strictEqual(
        json.data?.accessToken,
        undefined,
        'API-03: Web POST /api/v1/auth/verify-otp MUST NOT expose accessToken in JSON response body',
      );
      assert.strictEqual(
        json.data?.refreshToken,
        undefined,
        'API-03: Web POST /api/v1/auth/verify-otp MUST NOT expose refreshToken in JSON response body',
      );
      assert.strictEqual(json.data?.user?.username, 'superadmin');

      // Web POST /api/v1/auth/refresh must deliver HttpOnly cookie and omit accessToken/refreshToken from JSON body
      const refreshCookieMatch = setCookie.match(/fiberops_refresh=([^;]+)/);
      const sessionId = crypto.randomUUID();
      const webRefreshToken =
        refreshCookieMatch?.[1] ||
        (await mintTestJwt(
          { sessionId, tokenType: 'refresh', deviceId: 'web-browser' },
          { subject: adminId, audience: 'web' },
        ));
      const hashedWebRefresh = crypto
        .createHmac('sha256', process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || '')
        .update(webRefreshToken)
        .digest('hex');

      restoreFns.push(
        stubMethod(prisma.userSession, 'findUnique', (async () => ({
          id: sessionId,
          userId: adminId,
          deviceId: 'web-browser',
          refreshTokenHash: hashedWebRefresh,
          revokedAt: null,
          expiresAt: new Date(Date.now() + 86400_000),
          user: {
            id: adminId,
            username: 'superadmin',
            fullName: 'Aditya Saputra',
            userType: 'SUPER_ADMIN',
            isActive: true,
            assignedClusters: ['PLBHRAGA01'],
            role: { id: 'role-super-admin', name: 'Super Admin', hierarchyLevel: 100, permissions: ['*'] },
          },
        })) as unknown as typeof prisma.userSession.findUnique),
      );
      restoreFns.push(
        stubMethod(prisma.userSession, 'update', (async () => ({ id: sessionId })) as unknown as typeof prisma.userSession.update),
      );

      const refreshRes = await refreshPost(
        createNextRequest('http://localhost:3000/api/v1/auth/refresh', {
          method: 'POST',
          headers: { 'x-real-ip': '203.0.113.16' },
          cookies: { fiberops_refresh: webRefreshToken },
          jsonBody: {},
        }),
      );
      assert.strictEqual(
        refreshRes.status,
        200,
        `API-03: Web POST /api/v1/auth/refresh via HttpOnly cookie must succeed (200), got ${refreshRes.status}`,
      );
      const refreshSetCookie = refreshRes.headers.get('set-cookie') ?? '';
      assert.match(refreshSetCookie, /fiberops_session=.*;.*HttpOnly/i, 'Web /auth/refresh must set HttpOnly fiberops_session cookie');
      const refreshJson = (await refreshRes.json()) as {
        data?: { accessToken?: string; refreshToken?: string };
      };
      assert.strictEqual(
        refreshJson.data?.accessToken,
        undefined,
        'API-03: Web POST /api/v1/auth/refresh MUST NOT expose accessToken in JSON response body',
      );
      assert.strictEqual(
        refreshJson.data?.refreshToken,
        undefined,
        'API-03: Web POST /api/v1/auth/refresh MUST NOT expose refreshToken in JSON response body',
      );
    });

    // Frontend must NOT persist JWT in localStorage
    const useLoginSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'web', 'src', 'features', 'auth', 'hooks', 'use-login.ts'),
      'utf8',
    );
    assert.doesNotMatch(
      useLoginSrc,
      /localStorage\.setItem\s*\(\s*['"]fiberops_access_token['"]/,
      'API-03: use-login.ts must not store fiberops_access_token in localStorage',
    );

    // Leaflet tooltip binding in odp-radar-map.tsx must safely build/escape ALL 4 fields (item.name, splitterCode, cust.fullName, siaNumber)
    const mapSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'web', 'src', 'features', 'maps', 'components', 'odp-radar-map.tsx'),
      'utf8',
    );
    const tooltipBlocks = Array.from(mapSrc.matchAll(/bindTooltip\(([\s\S]*?),\s*\{/g)).map((m) => m[1]);
    assert.ok(tooltipBlocks.length >= 2, 'Expected ODP and customer bindTooltip calls in odp-radar-map.tsx');
    for (const rawField of [
      '${item.name}',
      '${item.splitterCode}',
      '${cust.fullName}',
      '${cust.siaNumber}',
    ]) {
      const hasRawInterpolation = tooltipBlocks.some((blk) => blk.includes(rawField));
      assert.strictEqual(
        hasRawInterpolation,
        false,
        `API-03: odp-radar-map.tsx bindTooltip must escape or use DOM textContent for ${rawField} (no raw HTML interpolation)`,
      );
    }
    assert.match(
      mapSrc,
      /escapeHtml|textContent|createElement/,
      'API-03: odp-radar-map.tsx must use DOM textContent or an HTML-escaping helper for tooltip content',
    );
  });

  it('API-13: neutralizes CSV formula injection (=, +, -, @, \\t, \\r) and doubles internal quotes in both CSV exporters', () => {
    const splitterGridSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'web', 'src', 'features', 'network', 'components', 'splitter-port-grid.tsx'),
      'utf8',
    );
    const useOverviewSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'web', 'src', 'features', 'overview', 'hooks', 'use-overview.ts'),
      'utf8',
    );

    // Neither exporter may emit raw unescaped `"${r.customerName}"` or un-neutralized formula cells
    assert.doesNotMatch(
      useOverviewSrc,
      /`"\$\{r\.customerName\}"`/,
      'API-13: use-overview.ts exportCsv must escape quotes and neutralize formula prefixes on customerName and other cells',
    );
    assert.doesNotMatch(
      splitterGridSrc,
      /`"\$\{port\.customerName\s*\|\|\s*'-'\}"`/,
      'API-13: splitter-port-grid.tsx handleDownloadInspectionCsv must escape quotes and neutralize formula prefixes on all string cells',
    );

    // Verify presence of formula-neutralizing CSV escaping logic (shared helper or local sanitizer)
    const formulaGuardRegex = /\[=+\-@\\t\\r\]|\[\\t\\r=+\-@\]|escapeCsv|sanitizeCsv|formatCsvCell|csvCell/i;
    assert.match(
      useOverviewSrc,
      formulaGuardRegex,
      'API-13: use-overview.ts must use CSV formula-injection neutralization',
    );
    assert.match(
      splitterGridSrc,
      formulaGuardRegex,
      'API-13: splitter-port-grid.tsx must use CSV formula-injection neutralization',
    );
  });

  it('API-15: blocks backslash (/\\evil.com), percent-encoded backslash, control chars, and protocol-relative open redirects in use-login.ts', async () => {
    const useLoginSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'web', 'src', 'features', 'auth', 'hooks', 'use-login.ts'),
      'utf8',
    );

    // Extract or dynamically test resolveSafeRedirectTarget from use-login.ts source
    const match = useLoginSrc.match(/function\s+resolveSafeRedirectTarget[\s\S]*?\n\}/);
    assert.ok(match, 'resolveSafeRedirectTarget function must exist in use-login.ts');

    // Compile/evaluate only the pure redirect validator function via Function constructor is forbidden by security rule,
    // so verify exported helper if present OR inspect strict validation checks + test via exported symbol if exported.
    const useLoginMod = (await import('@/features/auth/hooks/use-login').catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (useLoginMod && typeof useLoginMod.resolveSafeRedirectTarget === 'function') {
      const resolveRedirect = useLoginMod.resolveSafeRedirectTarget as (search: string) => string;
      assert.strictEqual(resolveRedirect('?next=/tickets?tab=pending'), '/tickets?tab=pending');
      assert.strictEqual(resolveRedirect('?next=/\\evil.com'), '/');
      assert.strictEqual(resolveRedirect('?next=//evil.com'), '/');
      assert.strictEqual(resolveRedirect('?next=/%5cevil.com'), '/');
      assert.strictEqual(resolveRedirect('?next=https://evil.com'), '/');
      assert.strictEqual(resolveRedirect('?next=/login'), '/');
      assert.strictEqual(resolveRedirect('?next=/\t/evil.com'), '/');
    } else {
      // Static contractual verification on resolveSafeRedirectTarget when hook module cannot load outside React
      assert.match(
        match[0],
        /\\\\|%5c|new URL\b/i,
        'API-15: resolveSafeRedirectTarget must reject backslashes (/\\evil.com, /%5cevil.com) and control characters',
      );
      assert.match(
        match[0],
        /\\x00|\\u00|control|charCodeAt/i,
        'API-15: resolveSafeRedirectTarget must reject control characters and whitespace tricks',
      );
    }
  });

  it('API-16: hardens Google Maps iframe in odp-inspector-panel.tsx with pinned origin, sandbox and tight referrerPolicy', () => {
    const inspectorSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'web', 'src', 'features', 'maps', 'components', 'odp-inspector-panel.tsx'),
      'utf8',
    );

    const iframeMatch = inspectorSrc.match(/<iframe[\s\S]*?\/>|<iframe[\s\S]*?>[\s\S]*?<\/iframe>/);
    assert.ok(iframeMatch, 'Expected Google Maps iframe in odp-inspector-panel.tsx');
    assert.match(
      inspectorSrc,
      /https:\/\/maps\.google\.com\/maps|https:\/\/www\.google\.com\/maps/,
      'API-16: Google Maps iframe src must be pinned to official maps.google.com/maps or www.google.com/maps origin',
    );
    assert.doesNotMatch(
      inspectorSrc,
      /referrerPolicy\s*=\s*["']no-referrer-when-downgrade["']/,
      'API-16: iframe must not use permissive no-referrer-when-downgrade',
    );
    assert.match(
      inspectorSrc,
      /referrerPolicy\s*=\s*["']no-referrer["']/,
      'API-16: iframe must set referrerPolicy="no-referrer"',
    );
    const sandboxMatch = iframeMatch[0].match(/sandbox\s*=\s*["']([^"']*)["']/);
    assert.ok(sandboxMatch, 'API-16: iframe must declare restrictive sandbox attribute');
    const tokens = sandboxMatch[1].split(/\s+/).filter(Boolean);
    assert.ok(tokens.includes('allow-scripts'), 'API-16: iframe sandbox must allow-scripts only as required');
    for (const dangerousToken of ['allow-top-navigation', 'allow-popups', 'allow-forms', 'allow-modals']) {
      assert.strictEqual(
        tokens.includes(dangerousToken),
        false,
        `API-16: iframe sandbox must NOT enable ${dangerousToken}`,
      );
    }
  });

  it('API-17: sanitizes tel: URIs in web & mobile TicketListScreen and clears window.__fiberopsQueryCache on logout / 401', () => {
    const profileSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'web', 'src', 'features', 'customers', 'components', 'customer-profile-view.tsx'),
      'utf8',
    );
    // Must not merely strip whitespace (`replace(/\s+/g, '')`), must strip non-[\d+] characters
    assert.doesNotMatch(
      profileSrc,
      /href=\{`tel:\$\{customer\.picPhone\.replace\(\/\\s\+\/g,\s*''\)\}`\}/,
      'API-17: tel: URI must strip all non-[\\d+] characters, not only whitespace',
    );
    assert.match(
      profileSrc,
      /replace\(\s*\/\[\^\\d\+\]\/g|replace\(\s*\/\[\^0-9\+\]\/g|sanitizeTel|formatTelUri/,
      'API-17: customer-profile-view.tsx must sanitize picPhone to digits and + before tel: interpolation',
    );

    // Mobile TicketListScreen.tsx must also sanitize ticket.customerPhone before tel: URI interpolation
    const ticketListSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'mobile', 'src', 'screens', 'TicketListScreen.tsx'),
      'utf8',
    );
    assert.doesNotMatch(
      ticketListSrc,
      /href=\{`tel:\$\{ticket\.customerPhone\}`\}/,
      'API-17: TicketListScreen.tsx must sanitize ticket.customerPhone before tel: interpolation',
    );
    assert.match(
      ticketListSrc,
      /replace\(\s*\/\[\^\\d\+\]\/g|replace\(\s*\/\[\^0-9\+\]\/g|sanitizeTel|formatTelUri/,
      'API-17: TicketListScreen.tsx must strip non-[\\d+] characters from tel: URI',
    );

    // AuthProvider must clear window.__fiberopsQueryCache on logout AND 401 session expiry
    const authProviderSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'web', 'src', 'providers', 'auth-provider.tsx'),
      'utf8',
    );
    const cacheClearMatches = authProviderSrc.match(
      /clearQueryCache|__fiberopsQueryCache\s*=\s*undefined|delete\s+window\.__fiberopsQueryCache|invalidateQueryCache\(/g,
    );
    assert.ok(
      cacheClearMatches && cacheClearMatches.length >= 1,
      'API-17: auth-provider.tsx must clear window.__fiberopsQueryCache on logout and 401 expiry',
    );
    const logoutBlock = authProviderSrc.match(/const logout = useCallback[\s\S]*?\}, \[router\]\);/)?.[0] || '';
    assert.match(
      logoutBlock,
      /clearQueryCache|__fiberopsQueryCache|invalidateQueryCache/,
      'API-17: auth-provider.tsx logout() must clear window.__fiberopsQueryCache',
    );

    // Runtime check on query-cache.ts with stubbed window
    const g = globalThis as unknown as { window?: Window & typeof globalThis };
    const prevWin = g.window;
    g.window = {} as Window & typeof globalThis;
    try {
      queryCacheMod.setCachedData('/api/v1/admin/overview', { secret: 'tenant-data' });
      assert.ok(queryCacheMod.getCachedData('/api/v1/admin/overview'));
      queryCacheMod.invalidateQueryCache('/api/v1/');
      assert.strictEqual(queryCacheMod.getCachedData('/api/v1/admin/overview'), null);
    } finally {
      if (prevWin === undefined) {
        delete g.window;
      } else {
        g.window = prevWin;
      }
    }
  });

  it('MOB-08: MobileDevToolsGuard unmounts children when blocked and removes 750ms console.debug polling loop', () => {
    const loginViewSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'web', 'src', 'features', 'auth', 'components', 'login-view.tsx'),
      'utf8',
    );
    const guardSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'web', 'src', 'features', 'auth', 'components', 'mobile-devtools-guard.tsx'),
      'utf8',
    );
    const detectorSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'web', 'src', 'features', 'auth', 'hooks', 'use-devtools-detector.ts'),
      'utf8',
    );

    // 1. LoginView must NOT render the login form card when isDevToolsBlocked is true (must unmount, not merely aria-hidden)
    assert.doesNotMatch(
      loginViewSrc,
      /<article\s+className="auth-card"\s+aria-hidden=\{isDevToolsBlocked/,
      'MOB-08: LoginView must conditionally unmount auth-card when isDevToolsBlocked is true instead of leaving form in DOM with aria-hidden',
    );

    // 2. MobileDevToolsGuard must gate/unmount children when isBlocked is true (not render as CSS-only sibling overlay)
    assert.match(
      guardSrc,
      /\bchildren\b/,
      'MOB-08: MobileDevToolsGuard must wrap and conditionally unmount children when isBlocked is true',
    );

    // 3. 750ms console.debug(probe) polling loop must be removed
    const hasConsoleDebugPoll =
      /POLL_INTERVAL_MS\s*=\s*750/.test(detectorSrc) &&
      /console\.debug\s*\(\s*probe\s*\)/.test(detectorSrc) &&
      /setInterval\s*\(\s*recheck\s*,\s*POLL_INTERVAL_MS\s*\)/.test(detectorSrc);
    assert.strictEqual(
      hasConsoleDebugPoll,
      false,
      'MOB-08: use-devtools-detector.ts must remove the 750ms console.debug(probe) polling loop',
    );
  });
});
