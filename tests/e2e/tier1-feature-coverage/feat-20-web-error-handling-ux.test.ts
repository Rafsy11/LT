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
import {
  buildOdpInspectionReportRows,
  buildOverviewReportRows,
  DEFAULT_EXCEL_CSV_DELIMITER,
  escapeCsvRowsAsync,
  EXCEL_CSV_BOM,
  EXCEL_CSV_LINE_ENDING,
  formatReportAttenuation,
  normalizeReportText,
  ODP_INSPECTION_REPORT_HEADERS,
  OVERVIEW_REPORT_HEADERS,
} from '../../../apps/web/src/lib/csv';
import {
  ReportExportService,
  sanitizeExportFilenameSegment,
} from '../../../apps/web/src/server/services/report-export.service';
import ExcelJS from 'exceljs';

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

  it('produces Excel-ready UTF-8 BOM semicolon CSV and styled XLSX reports without formula or placeholder artifacts', async () => {
    assert.strictEqual(normalizeReportText('-', ''), '');
    assert.strictEqual(normalizeReportText('Baris 1\nBaris\t2  extra'), 'Baris 1 Baris 2 extra');
    assert.deepStrictEqual(formatReportAttenuation(0), { numeric: '', label: 'Belum Diukur' });
    assert.deepStrictEqual(formatReportAttenuation(-19.456), { numeric: -19.46, label: 'Normal' });
    assert.deepStrictEqual(formatReportAttenuation(-29.1), { numeric: -29.1, label: 'Kritis' });

    const sampleTickets = [
      {
        id: 't-1',
        ticketNumber: 'TKT-2026-001',
        customerName: '=CMD|"/C calc"!A0; PT Sinar',
        siaNumber: '001234567890123',
        ticketType: 'Maintenance' as const,
        cluster: 'Palembang Tengah',
        clusterCode: 'PLB-TGH',
        assignedTech: '',
        techInitials: '--',
        status: 'Menunggu verifikasi' as const,
        priority: 'High' as const,
        currentAttenuation: 0,
        complaintSummary: 'Redaman drop\ndi ujung kabel',
        createdAt: '2026-11-23T05:30:00.000Z',
        splitterCode: 'ODP-PLB-01',
        portNumber: 3,
        isLocationFlagged: true,
        distanceToSplitterM: 185,
      },
    ];

    const overviewRows = buildOverviewReportRows(sampleTickets);
    assert.strictEqual(overviewRows[0][6], 'ODP-PLB-01 / P03');
    assert.strictEqual(overviewRows[0][7], 'Belum ditugaskan');
    assert.strictEqual(overviewRows[0][10], '');
    assert.strictEqual(overviewRows[0][11], 'Belum Diukur');
    assert.match(String(overviewRows[0][12]), /WIB$/);
    assert.match(String(overviewRows[0][13]), /Anomali Lokasi \(185 m\)/);

    const csv = await escapeCsvRowsAsync(OVERVIEW_REPORT_HEADERS, overviewRows, {
      delimiter: DEFAULT_EXCEL_CSV_DELIMITER,
      includeBom: true,
      lineEnding: EXCEL_CSV_LINE_ENDING,
    });
    assert.strictEqual(DEFAULT_EXCEL_CSV_DELIMITER, ',');
    assert.ok(csv.startsWith(EXCEL_CSV_BOM), 'Excel CSV must start with UTF-8 BOM');
    assert.ok(csv.includes('\r\n'), 'Excel CSV must use CRLF line endings');
    assert.ok(csv.includes('No,No. Tiket,Pelanggan,Nomor SIA'), 'CSV header must be comma-delimited');
    assert.ok(csv.includes("'=CMD"), 'CWE-1236 formula prefix must remain neutralized');
    assert.doesNotMatch(csv, /"'-"/, 'Empty placeholders must not emit literal \'-\' artifacts');

    const sampleSplitter = {
      id: 's-1',
      clusterCode: 'PLB-TGH',
      name: 'Palembang Tengah',
      splitterCode: 'ODP-PLB-01',
      locationName: 'Jl. Sudirman KM 4',
      usedPorts: 1,
      maxPorts: 8,
      lat: -2.976,
      lng: 104.775,
      ports: [
        {
          portNumber: 1,
          isOccupied: true,
          customerName: 'PT Maju Bersama',
          siaNumber: '009876543210',
          attenuation: -21.5,
          lastActivity: {
            type: 'MAINTENANCE' as const,
            date: '2026-11-23T04:00:00.000Z',
            technician: 'Andi Saputra',
            notes: 'Ganti pigtail\nnormal',
          },
        },
        {
          portNumber: 2,
          isOccupied: false,
        },
      ],
    };

    const odpRows = buildOdpInspectionReportRows(sampleSplitter);
    assert.strictEqual(odpRows[0][2], 'P01');
    assert.strictEqual(odpRows[1][4], '');
    const odpCsv = await escapeCsvRowsAsync(ODP_INSPECTION_REPORT_HEADERS, odpRows, {
      delimiter: DEFAULT_EXCEL_CSV_DELIMITER,
      includeBom: true,
      lineEnding: EXCEL_CSV_LINE_ENDING,
    });
    assert.doesNotMatch(odpCsv, /"'-"/, 'Unoccupied ODP ports must not emit \'-\' artifacts');

    // Verify ExcelJS workbook output is valid PK ZIP XLSX with neutralized formulas and text SIA
    const xlsxBuffer = await ReportExportService.generateOverviewWorkbook(sampleTickets, {
      clusterLabel: 'Palembang Tengah',
      statusLabel: 'Menunggu verifikasi',
      exportedBy: 'Super Admin',
    });
    assert.strictEqual(xlsxBuffer[0], 0x50);
    assert.strictEqual(xlsxBuffer[1], 0x4b);

    const parsedWorkbook = new ExcelJS.Workbook();
    await parsedWorkbook.xlsx.load(xlsxBuffer as unknown as ArrayBuffer);
    const sheet = parsedWorkbook.getWorksheet('Laporan Operasional');
    assert.ok(sheet, 'Overview workbook must contain Laporan Operasional worksheet');
    assert.ok(sheet.autoFilter, 'Overview worksheet must enable autoFilter');
    const firstDataRow = sheet.getRow(6);
    assert.strictEqual(String(firstDataRow.getCell(3).value).startsWith("'="), true);
    assert.strictEqual(firstDataRow.getCell(4).numFmt, '@');
    assert.ok(
      typeof firstDataRow.height === 'number' && firstDataRow.height >= 24,
      `Wrapped Excel row height must be dynamically sized (>= 24pt), got ${firstDataRow.height}`,
    );

    // Multi-line long note must expand row height beyond single-line height
    const longNoteTickets = [
      {
        ...sampleTickets[0],
        complaintSummary:
          'Kabel dropcore tertabrak kendaraan di jalur utama, perlu pergantian jalur, penyambungan ulang splice box, dan pengukuran OPM ulang.',
      },
    ];
    const longXlsx = await ReportExportService.generateOverviewWorkbook(longNoteTickets, {
      clusterLabel: 'Palembang Tengah',
      statusLabel: 'Semua',
      exportedBy: 'Super Admin',
    });
    const parsedLong = new ExcelJS.Workbook();
    await parsedLong.xlsx.load(longXlsx as unknown as ArrayBuffer);
    const longSheet = parsedLong.getWorksheet('Laporan Operasional');
    assert.ok(longSheet);
    assert.ok(
      (longSheet.getRow(6).height ?? 0) >= 42,
      `Multi-line Keterangan row must expand height to avoid clipping, got ${longSheet.getRow(6).height}`,
    );

    const odpXlsxBuffer = await ReportExportService.generateOdpInspectionWorkbook(sampleSplitter, {
      exportedBy: 'Super Admin',
    });
    assert.strictEqual(odpXlsxBuffer[0], 0x50);
    assert.strictEqual(odpXlsxBuffer[1], 0x4b);
    assert.strictEqual(sanitizeExportFilenameSegment('ODP/../evil\r\n.xlsx'), 'ODP-evil-.xlsx');

    const useOverviewSrc = fs.readFileSync(
      path.join(webSrc, 'features', 'overview', 'hooks', 'use-overview.ts'),
      'utf-8',
    );
    assert.match(useOverviewSrc, /statusFilter === 'Semua' \|\| t\.status === statusFilter/);
    assert.match(useOverviewSrc, /exportExcel/);

    const routeSrc = fs.readFileSync(
      path.join(webSrc, 'app', 'api', 'v1', 'admin', 'reports', 'export', 'route.ts'),
      'utf-8',
    );
    assert.match(routeSrc, /requireAdminActor/);
    assert.match(routeSrc, /matchesAssignedClusters/);
    assert.match(routeSrc, /RATE_LIMIT_PROFILES\.REPORT_EXPORT/);
  });

  it('enforces honest /monitoring telemetry classification, accessible semantics, and token CSS', async () => {
    const telemetryMod = await import(
      '../../../apps/web/src/features/monitoring/utils/monitoring-telemetry'
    );
    const {
      classifyMonitoringDbm,
      getCriticalReason,
      getSpectrumMeterPercentage,
      matchesClusterSelection,
      resolveValidationSummary,
    } = telemetryMod;

    // 0 dBm / missing attenuation must NEVER be falsely classified as Critical
    assert.strictEqual(classifyMonitoringDbm(0), 'Unmeasured');
    assert.strictEqual(classifyMonitoringDbm(null), 'Unmeasured');
    assert.strictEqual(classifyMonitoringDbm(undefined), 'Unmeasured');
    assert.strictEqual(classifyMonitoringDbm(-20.4), 'Normal');
    assert.strictEqual(classifyMonitoringDbm(-26.5), 'Warning');
    assert.strictEqual(classifyMonitoringDbm(-29.2), 'Critical');
    assert.strictEqual(classifyMonitoringDbm(-8.5), 'Critical');

    assert.strictEqual(getCriticalReason(0), null);
    assert.strictEqual(getCriticalReason(-29.2), 'low');
    assert.strictEqual(getCriticalReason(-8.5), 'overpower');

    // Spectrum percentage aligned strictly to [-35 dBm, -10 dBm]
    assert.strictEqual(getSpectrumMeterPercentage(0), 0);
    assert.strictEqual(getSpectrumMeterPercentage(-28), 28);
    assert.strictEqual(getSpectrumMeterPercentage(-25), 40);
    assert.strictEqual(getSpectrumMeterPercentage(-10), 100);

    // Honest validation summary without fabricated 18m / OS Verified / MinIO Verified
    const unsubmitted = resolveValidationSummary({
      id: 'm-1',
      ticketNumber: 'WO-2026-101',
      customerName: 'PT Telkom Test',
      siaNumber: '2026000111',
      ticketType: 'Maintenance',
      cluster: 'Palembang Ilir',
      clusterCode: 'PLB-ILR',
      assignedTech: 'Andi Pratama',
      techInitials: 'AP',
      status: 'Menunggu',
      currentAttenuation: 0,
      createdAt: '2026-11-23T08:00:00.000Z',
    });
    assert.strictEqual(unsubmitted.gpsStatus, 'missing');
    assert.strictEqual(unsubmitted.gpsCompactLabel, 'Belum ada GPS');
    assert.strictEqual(unsubmitted.opmStatus, 'missing');

    const flaggedPending = resolveValidationSummary({
      id: 'm-2',
      ticketNumber: 'WO-2026-102',
      customerName: 'PT Maju Jaya',
      siaNumber: '2026000222',
      ticketType: 'Pasang baru',
      cluster: 'Palembang Ilir',
      clusterCode: 'PLB-ILR',
      assignedTech: 'Rizky Maulana',
      techInitials: 'RM',
      status: 'Menunggu verifikasi',
      currentAttenuation: -29.4,
      createdAt: '2026-11-23T08:15:00.000Z',
      pendingSubmission: {
        submissionId: 'sub-1',
        splitterId: 'sp-1',
        splitterCode: 'ODP-PLB-01',
        portNumber: 4,
        attenuationDbm: -29.4,
        photoObjectKey: 'opm/sub-1.jpg',
        submittedLat: -2.97,
        submittedLng: 104.77,
        distanceToSplitterM: 145,
        isLocationFlagged: true,
        submittedAt: '2026-11-23T08:20:00.000Z',
        techUsername: 'rizky',
        techFullName: 'Rizky Maulana',
      },
    });
    assert.strictEqual(flaggedPending.gpsStatus, 'warn');
    assert.strictEqual(flaggedPending.geofenceStatus, 'warn');
    assert.strictEqual(flaggedPending.opmStatus, 'pending_review');

    assert.strictEqual(
      matchesClusterSelection(
        {
          id: 'm-3',
          ticketNumber: 'WO-3',
          customerName: 'A',
          siaNumber: '1',
          ticketType: 'Maintenance',
          cluster: 'Palembang Ilir',
          clusterCode: 'PLB-ILR',
          assignedTech: 'Budi',
          techInitials: 'BD',
          status: 'Selesai',
          currentAttenuation: -19.5,
          createdAt: '2026-11-23T08:00:00.000Z',
        },
        'PLB-ILR',
      ),
      true,
    );

    // Source contracts: zero fabricated fallbacks, zero infra leaks, proper A11y & native <dialog>
    const monitoringDir = path.join(webSrc, 'features', 'monitoring');
    const hookSrc = fs.readFileSync(path.join(monitoringDir, 'hooks', 'use-monitoring.ts'), 'utf-8');
    const viewSrc = fs.readFileSync(
      path.join(monitoringDir, 'components', 'monitoring-view.tsx'),
      'utf-8',
    );
    const statsSrc = fs.readFileSync(
      path.join(monitoringDir, 'components', 'monitoring-stats.tsx'),
      'utf-8',
    );
    const incidentSrc = fs.readFileSync(
      path.join(monitoringDir, 'components', 'monitoring-incident-bar.tsx'),
      'utf-8',
    );
    const streamSrc = fs.readFileSync(
      path.join(monitoringDir, 'components', 'telemetry-stream-panel.tsx'),
      'utf-8',
    );
    const hudSrc = fs.readFileSync(
      path.join(monitoringDir, 'components', 'telemetry-inspector-hud.tsx'),
      'utf-8',
    );
    const monitoringCss = fs.readFileSync(
      path.join(webSrc, 'styles', 'features', 'monitoring.css'),
      'utf-8',
    );

    const combinedMonitoringSrc = [hookSrc, viewSrc, statsSrc, incidentSrc, streamSrc, hudSrc].join(
      '\n',
    );
    assert.doesNotMatch(
      combinedMonitoringSrc,
      /\?\?\s*18|ODP-CMH-02|Negatif \(OS Verified\)|MinIO Verified|Nginx Unbuffered|Redis Bus Aktif|replace\('Bandung '/,
      '/monitoring must not contain fabricated fallbacks or internal infrastructure jargon',
    );
    assert.doesNotMatch(
      statsSrc,
      /<article[^>]+role="button"/,
      'MonitoringStats KPI cards must use native <button> elements instead of <article role="button">',
    );
    assert.match(statsSrc, /aria-pressed=/);
    assert.doesNotMatch(
      streamSrc,
      /<li[^>]+role="button"/,
      'TelemetryStreamPanel must not nest buttons inside <li role="button">',
    );
    assert.match(streamSrc, /<table className="noc-stream-table">/);
    assert.match(streamSrc, /ArrowRight/);
    assert.match(viewSrc, /<dialog/);
    assert.match(viewSrc, /showModal\(\)/);
    assert.match(viewSrc, /<SafeErrorState/);
    assert.doesNotMatch(
      viewSrc,
      /<dialog[^>]+(?:role="dialog"|aria-modal)/,
      'Native modal <dialog> must not duplicate role="dialog" or aria-modal',
    );
    assert.match(monitoringCss, /@container\s*\(width\s*<\s*720px\)/);
    assert.match(monitoringCss, /\.noc-inspector-dialog:modal[\s\S]*overscroll-behavior:\s*contain/);
    assert.match(
      monitoringCss,
      /\.noc-inspector-dialog::backdrop[\s\S]*overscroll-behavior:\s*contain/,
    );
    assert.match(monitoringCss, /\.noc-tab-btn\[aria-selected='true'\]::after/);
    assert.doesNotMatch(monitoringCss, /html\.dark\s+\.hud-spec-grid/);
  });

  it('enforces /technicians live session hydration, safe Detail Sesi modal confirmation, and Light/Dark token CSS', async () => {
    const techSessionMod = await import(
      '../../../apps/web/src/features/technicians/utils/technician-session'
    );
    const {
      formatTechnicianActivityText,
      matchesTechnicianCluster,
      matchesTechnicianSearch,
      resolveTechnicianVisualState,
    } = techSessionMod;

    const baseTech = {
      id: 't-1',
      nik: '882043',
      username: 'andi.pratama',
      fullName: 'Andi Pratama',
      vendorCompany: 'PT Mitra Fiber',
      telegramBound: true,
      cluster: 'Palembang Ilir',
      initials: 'AP',
      isActive: true,
      activeTicketsCount: 1,
      completedTicketsCount: 5,
      sessionStatus: 'NO_SESSION' as const,
      lastActiveAt: '3 hari yang lalu',
    };

    assert.strictEqual(resolveTechnicianVisualState(baseTech).state, 'idle');
    assert.strictEqual(formatTechnicianActivityText(baseTech), 'Terakhir aktif: 3 hari yang lalu');
    assert.doesNotMatch(formatTechnicianActivityText(baseTech), /^Online /);

    const lockedTech = { ...baseTech, isActive: false, sessionStatus: 'ACTIVE_SESSION' as const };
    assert.strictEqual(resolveTechnicianVisualState(lockedTech).state, 'locked');

    const activeTech = { ...baseTech, sessionStatus: 'ACTIVE_SESSION' as const, lastActiveAt: '4 menit yang lalu' };
    assert.strictEqual(resolveTechnicianVisualState(activeTech).state, 'active');
    assert.strictEqual(formatTechnicianActivityText(activeTech), 'Aktif 4 menit yang lalu');

    assert.strictEqual(matchesTechnicianSearch(baseTech, '882043'), true);
    assert.strictEqual(matchesTechnicianSearch(baseTech, 'Mitra Fiber'), true);
    assert.strictEqual(matchesTechnicianCluster(baseTech, 'Palembang Ilir'), true);

    const techDir = path.join(webSrc, 'features', 'technicians');
    const techServiceSrc = fs.readFileSync(
      path.join(webSrc, 'server', 'services', 'technician.service.ts'),
      'utf-8',
    );
    const viewSrc = fs.readFileSync(path.join(techDir, 'components', 'technicians-view.tsx'), 'utf-8');
    const statsSrc = fs.readFileSync(path.join(techDir, 'components', 'technician-stats.tsx'), 'utf-8');
    const filtersSrc = fs.readFileSync(path.join(techDir, 'components', 'technician-filters.tsx'), 'utf-8');
    const cardSrc = fs.readFileSync(path.join(techDir, 'components', 'technician-card.tsx'), 'utf-8');
    const gridSrc = fs.readFileSync(path.join(techDir, 'components', 'technician-grid.tsx'), 'utf-8');
    const modalSrc = fs.readFileSync(
      path.join(techDir, 'components', 'technician-detail-modal.tsx'),
      'utf-8',
    );
    const techCss = fs.readFileSync(path.join(webSrc, 'styles', 'features', 'technicians.css'), 'utf-8');

    // Live PostgreSQL query must hydrate sessions and active work orders including PENDING_APPROVAL
    assert.match(techServiceSrc, /sessions:\s*\{/);
    assert.match(techServiceSrc, /PENDING_APPROVAL/);
    assert.match(techServiceSrc, /activeWorkOrders,/);

    // Every client component re-exported by barrel must carry 'use client'
    for (const [name, src] of [
      ['technicians-view.tsx', viewSrc],
      ['technician-stats.tsx', statsSrc],
      ['technician-filters.tsx', filtersSrc],
      ['technician-card.tsx', cardSrc],
      ['technician-grid.tsx', gridSrc],
      ['technician-detail-modal.tsx', modalSrc],
    ] as const) {
      assert.match(src, /^'use client';/, `${name} must declare 'use client' for Next.js 15 barrel safety`);
    }

    // Zero fabricated placeholders or leaked internal PRD/Redis/code jargon
    const combinedTechUi = [viewSrc, statsSrc, filtersSrc, cardSrc, modalSrc].join('\n');
    assert.doesNotMatch(
      combinedTechUi,
      /DEV-UNBOUND|\+62 8xx-xxxx-xxxx|ODP Target|PRD 3\.3|location\.mocked = true|Redis Session Store|Token JWT sah tersinkron di Redis/,
      '/technicians UI and Detail Sesi modal must not contain fabricated fallbacks or internal infra jargon',
    );

    // Accessible controls, 2-step confirmation in Detail Sesi modal, and copy support
    assert.match(statsSrc, /<button[\s\S]*?aria-pressed=/);
    assert.doesNotMatch(statsSrc, /<article className="stat-card">/);
    assert.match(filtersSrc, /ArrowRight/);
    assert.match(modalSrc, /tech-confirm-panel/);
    assert.match(modalSrc, /cancelConfirmBtnRef/);
    assert.match(modalSrc, /copyTextToClipboard/);
    assert.match(modalSrc, /aria-label="Tutup detail sesi teknisi"/);

    // Token-driven CSS: zero hardcoded dark mobile #0b1329 override, full Light/Dark banners & dialog backdrop
    assert.doesNotMatch(techCss, /#0b1329|#060b18|#111e3f/);
    assert.match(techCss, /\.technician-banner--active\s*\{/);
    assert.match(techCss, /\.technician-tab-btn\[aria-selected='true'\]::after/);
    assert.match(techCss, /dialog\.tech-modal-overlay::backdrop[\s\S]*overscroll-behavior:\s*contain/);
  });
});
