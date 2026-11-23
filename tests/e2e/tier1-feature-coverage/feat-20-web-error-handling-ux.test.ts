import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ERROR_CODES } from '@repo/shared';
import {
  AI_ATTACHMENT_RULE,
  DATEK_UPLOAD_RULE,
  PHOTO_UPLOAD_RULE,
  extractFieldErrors,
  formatFileSizeLabel,
  generateErrorRefCode,
  isAppError,
  normalizeAppError,
  parseRetryAfterSeconds,
  validateUploadFile,
} from '../../../apps/web/src/lib/error-normalizer';
import {
  formatRateLimitDuration,
  formatRetryCountdownMessage,
} from '../../../apps/web/src/lib/error-dictionary';

function resolveRepoRoot(): string {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), '..'),
    path.resolve(process.cwd(), '../..'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'apps', 'web', 'package.json'))) {
      return dir;
    }
  }
  return path.resolve(process.cwd(), '../..');
}

describe('Tier 1: Feature 20 - Web Error Handling & Humane Microcopy UX', () => {
  const repoRoot = resolveRepoRoot();
  const webSrc = path.join(repoRoot, 'apps', 'web', 'src');

  it('verifies all core error UX files exist on disk', () => {
    const requiredFiles = [
      'lib/error-dictionary.ts',
      'lib/error-normalizer.ts',
      'providers/network-status-provider.tsx',
      'hooks/use-rate-limit-countdown.ts',
      'components/ui/GlobalNetworkBanner.tsx',
      'components/ui/AccessDeniedState.tsx',
      'components/ui/FieldError.tsx',
      'components/ui/RateLimitNotice.tsx',
      'styles/components/error-ux.css',
      'app/(dashboard)/not-found.tsx',
      'app/[...not_found]/page.tsx',
      'app/not-found.tsx',
      'app/error.tsx',
      'app/(dashboard)/error.tsx',
      'app/global-error.tsx',
    ];

    for (const rel of requiredFiles) {
      const fullPath = path.join(webSrc, rel);
      assert.ok(fs.existsSync(fullPath), `Missing expected file: ${rel}`);
    }
  });

  it('generates short incident reference codes in #ERR-XXXX format', () => {
    const seeded = generateErrorRefCode('next-digest-9a8b7c');
    assert.match(seeded, /^#ERR-[A-Z0-9]{4}$/);
    assert.strictEqual(seeded, '#ERR-NEXT');

    const randomRef = generateErrorRefCode();
    assert.match(randomRef, /^#ERR-[A-Z0-9]{4}$/);
  });

  it('parses Retry-After headers for integer seconds, HTTP-Date, and fallback', () => {
    assert.strictEqual(parseRetryAfterSeconds('45', 60), 45);
    assert.strictEqual(parseRetryAfterSeconds(' 120 ', 60), 120);
    assert.strictEqual(parseRetryAfterSeconds(null, 30), 30);
    assert.strictEqual(parseRetryAfterSeconds('invalid-value', 50), 50);

    const futureDate = new Date(Date.now() + 25_000).toUTCString();
    const parsedFuture = parseRetryAfterSeconds(futureDate, 60);
    assert.ok(parsedFuture >= 20 && parsedFuture <= 30, `Expected ~25s, got ${parsedFuture}`);
  });

  it('extracts and sanitizes nested fieldErrors from API validation payloads', () => {
    const extracted = extractFieldErrors({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        fieldErrors: {
          siaNumber: 'Nomor SIA tidak sesuai format.',
          portNumber: ['Nomor port harus antara 1 hingga 32.'],
        },
      },
    });

    assert.ok(extracted);
    assert.strictEqual(extracted.siaNumber, 'Nomor SIA tidak sesuai format.');
    assert.strictEqual(extracted.portNumber, 'Nomor port harus antara 1 hingga 32.');
  });

  it('normalizes all HTTP and connectivity categories without leaking technical internals', () => {
    const err401 = normalizeAppError(
      { code: ERROR_CODES.UNAUTHORIZED, message: 'Token expired' },
      { statusCode: 401 },
    );
    assert.strictEqual(isAppError(err401), true);
    assert.strictEqual(err401.category, 'UNAUTHORIZED');

    const err403 = normalizeAppError(
      { code: ERROR_CODES.FORBIDDEN, message: 'Akses ditolak' },
      { statusCode: 403 },
    );
    assert.strictEqual(err403.category, 'FORBIDDEN');

    const err404 = normalizeAppError(null, { statusCode: 404, code: 'NOT_FOUND' });
    assert.strictEqual(err404.category, 'NOT_FOUND');

    const abortErr = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    const err408 = normalizeAppError(abortErr);
    assert.strictEqual(err408.category, 'TIMEOUT');
    assert.strictEqual(err408.retryable, true);
    assert.strictEqual(err408.actionLabel, 'Coba Lagi');

    const err413 = normalizeAppError(null, {
      statusCode: 413,
      code: ERROR_CODES.PAYLOAD_TOO_LARGE,
    });
    assert.strictEqual(err413.category, 'PAYLOAD_TOO_LARGE');

    const err415 = normalizeAppError(null, {
      statusCode: 415,
      code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
    });
    assert.strictEqual(err415.category, 'UNSUPPORTED_FILE');

    const err429 = normalizeAppError(null, {
      statusCode: 429,
      code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
      retryAfterSeconds: 42,
    });
    assert.strictEqual(err429.category, 'RATE_LIMITED');
    assert.strictEqual(err429.retryAfterSeconds, 42);
    assert.match(err429.message, /42 detik/);

    const err500 = normalizeAppError(
      new Error('PrismaClientKnownRequestError: P2002 SELECT * FROM users at /app/src/server.ts:42'),
      { statusCode: 500 },
    );
    assert.strictEqual(err500.category, 'SERVER_ERROR');
    assert.match(err500.refCode, /^#ERR-[A-Z0-9]{4}$/);
    assert.doesNotMatch(err500.message, /Prisma|SELECT|P2002|server\.ts/i);

    const err503 = normalizeAppError(null, {
      statusCode: 503,
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
    });
    assert.strictEqual(err503.category, 'SERVICE_UNAVAILABLE');

    const errOffline = normalizeAppError(null, {
      statusCode: 0,
      code: ERROR_CODES.NETWORK_OFFLINE,
    });
    assert.strictEqual(errOffline.category, 'OFFLINE');
    assert.match(errOffline.message, /draf Anda tetap aman/i);
  });

  it('validates upload files for 400 (empty), 413 (size limit), and 415 (unsupported format)', () => {
    const emptyFile = { name: 'datek.xlsx', size: 0, type: '' } as unknown as File;
    const emptyCheck = validateUploadFile(emptyFile, DATEK_UPLOAD_RULE);
    assert.strictEqual(emptyCheck.valid, false);
    assert.strictEqual(emptyCheck.error?.statusCode, 400);

    const badExt = {
      name: 'script.exe',
      size: 2048,
      type: 'application/x-msdownload',
    } as unknown as File;
    const extCheck = validateUploadFile(badExt, DATEK_UPLOAD_RULE);
    assert.strictEqual(extCheck.valid, false);
    assert.strictEqual(extCheck.error?.statusCode, 415);
    assert.strictEqual(extCheck.error?.category, 'UNSUPPORTED_FILE');
    assert.match(extCheck.error?.message || '', /\.xlsx\s+atau\s+\.csv/);

    const legacyXls = {
      name: 'legacy.xls',
      size: 2048,
      type: 'application/vnd.ms-excel',
    } as unknown as File;
    const legacyXlsCheck = validateUploadFile(legacyXls, DATEK_UPLOAD_RULE);
    assert.strictEqual(legacyXlsCheck.valid, false);
    assert.strictEqual(legacyXlsCheck.error?.statusCode, 415);
    assert.strictEqual(legacyXlsCheck.error?.category, 'UNSUPPORTED_FILE');
    assert.match(legacyXlsCheck.error?.message || '', /\.xlsx\s+atau\s+\.csv/);

    const oversizedDatek = {
      name: 'datek-palembang.xlsx',
      size: 12 * 1024 * 1024,
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    } as unknown as File;
    const sizeCheck = validateUploadFile(oversizedDatek, DATEK_UPLOAD_RULE);
    assert.strictEqual(sizeCheck.valid, false);
    assert.strictEqual(sizeCheck.error?.statusCode, 413);
    assert.strictEqual(sizeCheck.error?.category, 'PAYLOAD_TOO_LARGE');
    assert.match(sizeCheck.error?.message || '', /10 MB/);

    const validDatek = {
      name: 'datek-palembang.xlsx',
      size: 1024 * 512,
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    } as unknown as File;
    assert.strictEqual(validateUploadFile(validDatek, DATEK_UPLOAD_RULE).valid, true);

    const oversizedPhoto = {
      name: 'opm-proof.jpg',
      size: 7 * 1024 * 1024,
      type: 'image/jpeg',
    } as unknown as File;
    const photoCheck = validateUploadFile(oversizedPhoto, PHOTO_UPLOAD_RULE);
    assert.strictEqual(photoCheck.valid, false);
    assert.strictEqual(photoCheck.error?.statusCode, 413);
    assert.match(photoCheck.error?.message || '', /5 MB/);

    assert.strictEqual(formatFileSizeLabel(1536), '1,5 KB');
    assert.strictEqual(formatRateLimitDuration(15), '15 detik');
    assert.strictEqual(formatRateLimitDuration(60), '1 menit');
    assert.strictEqual(formatRateLimitDuration(895), '14 menit 55 detik');
    assert.strictEqual(formatRateLimitDuration(3600), '1 jam');
    assert.strictEqual(formatRateLimitDuration(3665), '1 jam 1 menit 5 detik');
    assert.match(formatRetryCountdownMessage(15), /15 detik/);
    assert.match(formatRetryCountdownMessage(895), /14 menit 55 detik/);
    assert.match(formatRetryCountdownMessage(3665), /1 jam 1 menit 5 detik/);
  });

  it('enforces real HTTP 404 via notFound() and brand-aligned Indonesian NotFoundView', () => {
    const catchAllSrc = fs.readFileSync(
      path.join(webSrc, 'app', '[...not_found]', 'page.tsx'),
      'utf-8',
    );
    assert.match(catchAllSrc, /notFound\s*\(\s*\)/);

    const notFoundViewSrc = fs.readFileSync(
      path.join(webSrc, 'components', 'layout', 'NotFoundView.tsx'),
      'utf-8',
    );
    assert.match(notFoundViewSrc, /\/assets\/404-isometric\.png/);
    assert.match(notFoundViewSrc, /Halaman Tidak Ditemukan/);
    assert.match(notFoundViewSrc, /Kembali ke Beranda/);
    assert.doesNotMatch(notFoundViewSrc, /The page you looking for/i);
    assert.doesNotMatch(notFoundViewSrc, /#5656f4/i);
    assert.doesNotMatch(notFoundViewSrc, /MutationObserver/);
    assert.doesNotMatch(notFoundViewSrc, /\u2014/);
  });

  it('enforces ?next= auth redirect, DESIGN.md tokens, and zero DB jargon in web UI', () => {
    const middlewareSrc = fs.readFileSync(path.join(webSrc, 'middleware.ts'), 'utf-8');
    assert.match(middlewareSrc, /searchParams\.set\('next'/);

    const dashboardLayoutSrc = fs.readFileSync(
      path.join(webSrc, 'app', '(dashboard)', 'layout.tsx'),
      'utf-8',
    );
    assert.match(dashboardLayoutSrc, /key="dashboard-page-slot"/);
    assert.doesNotMatch(dashboardLayoutSrc, /PostgreSQL/);

    const errorCssSrc = fs.readFileSync(
      path.join(webSrc, 'styles', 'components', 'error-ux.css'),
      'utf-8',
    );
    assert.doesNotMatch(errorCssSrc, /9999px/);
    assert.match(errorCssSrc, /min-height:\s*44px/);
  });

  it('routes above-header network/503 and RolesView errors consistently through ToastProvider', () => {
    const globalBannerSrc = fs.readFileSync(
      path.join(webSrc, 'components', 'ui', 'GlobalNetworkBanner.tsx'),
      'utf-8',
    );
    assert.match(globalBannerSrc, /useToast\s*\(/);
    assert.match(globalBannerSrc, /upsertToast\s*\(/);
    assert.match(globalBannerSrc, /return null;/);
    assert.doesNotMatch(globalBannerSrc, /global-network-banner/);

    const toastProviderSrc = fs.readFileSync(
      path.join(webSrc, 'providers', 'toast-provider.tsx'),
      'utf-8',
    );
    assert.match(toastProviderSrc, /upsertToast/);
    assert.match(toastProviderSrc, /persist\?:/);
    assert.match(toastProviderSrc, /popover:\s*'manual'/);
    assert.match(toastProviderSrc, /lastExternalFocusRef/);
    assert.match(toastProviderSrc, /className="toast-message"[\s\S]*className="toast-ref"/);

    const errorCssSrc = fs.readFileSync(
      path.join(webSrc, 'styles', 'components', 'error-ux.css'),
      'utf-8',
    );
    assert.match(errorCssSrc, /\.toast-ref\s*\{[^}]*align-self:\s*flex-start/);
    assert.doesNotMatch(errorCssSrc, /\.toast-ref\s*\{[^}]*margin-left:\s*auto/);

    const rolesViewSrc = fs.readFileSync(
      path.join(webSrc, 'features', 'roles', 'components', 'roles-view.tsx'),
      'utf-8',
    );
    assert.doesNotMatch(rolesViewSrc, /<ErrorBanner/);
    assert.match(rolesViewSrc, /<SafeErrorState/);
  });

  it('validates AI prompt attachment files and wires .ai-prompt-attach-btn to file picker', () => {
    const validCsv = {
      name: 'redaman-palembang.csv',
      size: 2048,
      type: 'text/csv',
    } as unknown as File;
    assert.strictEqual(validateUploadFile(validCsv, AI_ATTACHMENT_RULE).valid, true);

    const oversizedTxt = {
      name: 'olt-dump.log',
      size: 2 * 1024 * 1024,
      type: 'text/plain',
    } as unknown as File;
    const sizeCheck = validateUploadFile(oversizedTxt, AI_ATTACHMENT_RULE);
    assert.strictEqual(sizeCheck.valid, false);
    assert.strictEqual(sizeCheck.error?.statusCode, 413);

    const unsupportedBin = {
      name: 'payload.exe',
      size: 1024,
      type: 'application/x-msdownload',
    } as unknown as File;
    const extCheck = validateUploadFile(unsupportedBin, AI_ATTACHMENT_RULE);
    assert.strictEqual(extCheck.valid, false);
    assert.strictEqual(extCheck.error?.statusCode, 415);

    const promptInputSrc = fs.readFileSync(
      path.join(webSrc, 'features', 'ai', 'components', 'ai-prompt-input.tsx'),
      'utf-8',
    );
    assert.match(promptInputSrc, /type="file"/);
    assert.match(promptInputSrc, /fileInputRef\.current\?\.click\(\)/);
    assert.match(promptInputSrc, /isComposing/);
    assert.match(promptInputSrc, /className="sr-only"/);
  });

  it('enforces accessible WAI-ARIA tabs, real telemetry honesty, and token-driven styles on /settings', () => {
    const settingsViewSrc = fs.readFileSync(
      path.join(webSrc, 'features', 'settings', 'components', 'settings-view.tsx'),
      'utf-8',
    );
    assert.match(settingsViewSrc, /role="tabpanel"/);
    assert.match(settingsViewSrc, /noValidate/);
    assert.match(settingsViewSrc, /handleResetChanges/);
    assert.doesNotMatch(settingsViewSrc, /window\.location\.reload/);

    const settingsTabsSrc = fs.readFileSync(
      path.join(webSrc, 'features', 'settings', 'components', 'settings-tabs.tsx'),
      'utf-8',
    );
    assert.match(settingsTabsSrc, /ArrowRight/);
    assert.match(settingsTabsSrc, /ArrowLeft/);
    assert.match(settingsTabsSrc, /aria-selected=\{active\}/);
    assert.match(settingsTabsSrc, /tabIndex=\{active \? 0 : -1\}/);

    const settingsHeaderSrc = fs.readFileSync(
      path.join(webSrc, 'features', 'settings', 'components', 'settings-header.tsx'),
      'utf-8',
    );
    assert.match(settingsHeaderSrc, /Layanan Normal/);
    assert.doesNotMatch(settingsHeaderSrc, /Docker: 6 Normal/);

    const infraSrc = fs.readFileSync(
      path.join(webSrc, 'features', 'settings', 'components', 'infrastructure-panel.tsx'),
      'utf-8',
    );
    assert.match(infraSrc, /telemetry\?\.uptimeSeconds/);
    assert.match(infraSrc, /telemetry\?\.hostPlatform/);
    assert.match(infraSrc, /maxConcurrentAiQueries/);
    assert.match(infraSrc, /<fieldset/);
    assert.doesNotMatch(infraSrc, /42 Hari 18 Jam|RTX 4060 Ti|142\.8 Mbps|Valid s\/d 2027|Ubuntu 24\.04 LTS/);

    const geofencingSrc = fs.readFileSync(
      path.join(webSrc, 'features', 'settings', 'components', 'geofencing-panel.tsx'),
      'utf-8',
    );
    assert.match(geofencingSrc, /role="switch"/);

    const backupSrc = fs.readFileSync(
      path.join(webSrc, 'features', 'settings', 'components', 'backup-panel.tsx'),
      'utf-8',
    );
    assert.match(backupSrc, /role="switch"/);
    assert.match(backupSrc, /compressionEncrypted/);
    assert.match(backupSrc, /<EmptyState/);

    const networkSrc = fs.readFileSync(
      path.join(webSrc, 'features', 'settings', 'components', 'network-settings-panel.tsx'),
      'utf-8',
    );
    assert.match(networkSrc, /companyName/);
    assert.doesNotMatch(networkSrc, /AGENT\.md|PRD 7\.2|PRD 7\.3/);

    const settingsCssSrc = fs.readFileSync(
      path.join(webSrc, 'styles', 'features', 'settings.css'),
      'utf-8',
    );
    assert.match(settingsCssSrc, /var\(--color-surface-card\)/);
    assert.match(settingsCssSrc, /\.settings-status-pill\.critical/);
    assert.match(settingsCssSrc, /\.settings-switch/);
    assert.match(settingsCssSrc, /\.settings-tab-btn::after/);
    assert.doesNotMatch(settingsCssSrc, /#0b1329|#0066ff|9999px/i);
  });

  it('renders seamless full-height sidebar gradient SVG without top clipping seam behind logo', () => {
    const darkSvgSrc = fs.readFileSync(
      path.join(webSrc, '..', 'public', 'assets', 'fiberops-sidebar-gradient-dark.svg'),
      'utf-8',
    );
    assert.match(darkSvgSrc, /<rect width="320" height="1200" fill="url\(#sideCloudGlow\)"\/>/);
    assert.doesNotMatch(darkSvgSrc, /y="200"\s+fill="url\(#sideCloudGlow\)"/);

    const shellCssSrc = fs.readFileSync(
      path.join(webSrc, 'styles', 'layout', 'shell.css'),
      'utf-8',
    );
    assert.match(shellCssSrc, /fiberops-sidebar-gradient\.svg\?v=6/);
    assert.match(shellCssSrc, /fiberops-sidebar-gradient-dark\.svg\?v=3/);
    assert.match(shellCssSrc, /\.sidebar-header-row\s*\{[^}]*background:\s*transparent/);
  });
});
