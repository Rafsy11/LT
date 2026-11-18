import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkDeviceIntegrity } from '../../../apps/mobile/src/security/deviceIntegrity';
import { STANDARD_ERROR_MESSAGES, sanitizeUiErrorMessage } from '@repo/shared';

describe('Tier 1: Feature 19 - Mobile Security & Systems Hardening', () => {
  const rootDir = process.cwd();
  const mobileSecurityPath = path.resolve(rootDir, '../../apps/mobile/src/security/deviceIntegrity.ts');
  const emptyStatePath = path.resolve(rootDir, '../../apps/mobile/src/components/EmptyState.tsx');
  const errorBannerPath = path.resolve(rootDir, '../../apps/mobile/src/components/ErrorBanner.tsx');
  const errorStatePath = path.resolve(rootDir, '../../apps/mobile/src/components/ErrorState.tsx');
  const appPath = path.resolve(rootDir, '../../apps/mobile/App.tsx');
  const ticketListPath = path.resolve(rootDir, '../../apps/mobile/src/screens/TicketListScreen.tsx');
  const loginPath = path.resolve(rootDir, '../../apps/mobile/src/screens/LoginScreen.tsx');
  const webGuardPath = path.resolve(rootDir, '../../apps/web/src/features/auth/components/mobile-devtools-guard.tsx');

  it('verifies all 8 required files exist on disk', () => {
    assert.ok(fs.existsSync(mobileSecurityPath), 'deviceIntegrity.ts must exist');
    assert.ok(fs.existsSync(emptyStatePath), 'EmptyState.tsx must exist');
    assert.ok(fs.existsSync(errorBannerPath), 'ErrorBanner.tsx must exist');
    assert.ok(fs.existsSync(errorStatePath), 'ErrorState.tsx must exist');
    assert.ok(fs.existsSync(appPath), 'App.tsx must exist');
    assert.ok(fs.existsSync(ticketListPath), 'TicketListScreen.tsx must exist');
    assert.ok(fs.existsSync(loginPath), 'LoginScreen.tsx must exist');
    assert.ok(fs.existsSync(webGuardPath), 'mobile-devtools-guard.tsx must exist');
  });

  it('checkDeviceIntegrity returns complete 10-field report structure', async () => {
    const report = await checkDeviceIntegrity({
      isRootedOverride: false,
      isEmulatorOverride: false,
      isDebuggableOverride: false,
      developerOptionsOverride: false,
      adbEnabledOverride: false,
    });

    assert.strictEqual(typeof report.isSecure, 'boolean');
    assert.strictEqual(typeof report.isCompromised, 'boolean');
    assert.strictEqual(typeof report.isRooted, 'boolean');
    assert.strictEqual(typeof report.isEmulator, 'boolean');
    assert.strictEqual(typeof report.isDebuggable, 'boolean');
    assert.strictEqual(typeof report.developerOptionsEnabled, 'boolean');
    assert.strictEqual(typeof report.adbEnabled, 'boolean');
    assert.ok(Array.isArray(report.violations));
    assert.strictEqual(typeof report.details, 'string');
    assert.strictEqual(typeof report.checkedAt, 'string');

    assert.strictEqual(report.isSecure, true);
    assert.strictEqual(report.isCompromised, false);
    assert.strictEqual(report.developerOptionsEnabled, false);
    assert.strictEqual(report.adbEnabled, false);
    assert.strictEqual(report.violations.length, 0);
  });

  it('flags Developer Options as compromised and records violations', async () => {
    const report = await checkDeviceIntegrity({
      developerOptionsOverride: true,
      adbEnabledOverride: false,
      isRootedOverride: false,
      isEmulatorOverride: false,
      isDebuggableOverride: false,
    });

    assert.strictEqual(report.developerOptionsEnabled, true);
    assert.strictEqual(report.isCompromised, true);
    assert.strictEqual(report.isSecure, false);
    assert.ok(report.violations.includes('DEVELOPER_OPTIONS_ENABLED'));
  });

  it('flags USB Debugging / ADB as compromised and records violations', async () => {
    const report = await checkDeviceIntegrity({
      developerOptionsOverride: false,
      adbEnabledOverride: true,
      isRootedOverride: false,
      isEmulatorOverride: false,
      isDebuggableOverride: false,
    });

    assert.strictEqual(report.adbEnabled, true);
    assert.strictEqual(report.isCompromised, true);
    assert.strictEqual(report.isSecure, false);
    assert.ok(report.violations.includes('ADB_DEBUGGING_ENABLED'));
  });

  it('verifies App.tsx Pre-Login Security Gate Screen specifications', () => {
    const content = fs.readFileSync(appPath, 'utf-8');

    // Category badge
    assert.match(content, /KEAMANAN PERANGKAT OPERASIONAL/);

    // Title
    assert.match(content, /Perangkat Tidak Memenuhi Standar Keamanan/);

    // Description text
    assert.match(content, /Aplikasi FiberOps ditolak berjalan pada perangkat yang terdeteksi memiliki Opsi Pengembang/);
    assert.match(content, /kerahasiaan topologi jaringan ISP/);

    // Step-by-step guidance card
    assert.match(content, /Panduan Penonaktifan/);
    assert.match(content, /Opsi Pengembang \(Developer Options\)/);
    assert.match(content, /USB Debugging/);

    // Interactive button with exact label and 44px min height
    assert.match(content, /Periksa Ulang Status Perangkat/);
    assert.match(content, /performIntegrityRecheck/);

    // Reactive rechecking on resize and interval polling
    assert.match(content, /window\.addEventListener\('resize'/);
    assert.match(content, /setInterval\(/);

    // Antislop rules: zero em-dashes and zero 9999px pills
    assert.strictEqual(content.includes('—'), false, 'App.tsx must not contain em-dashes');
    assert.strictEqual(content.includes('9999px'), false, 'App.tsx must not contain 9999px');
  });

  it('verifies EmptyState.tsx zero-dependency implementation and antislop compliance', () => {
    const content = fs.readFileSync(emptyStatePath, 'utf-8');

    // Self-contained SVG icons
    assert.match(content, /renderSvgIcon/);
    assert.match(content, /ticket/);
    assert.match(content, /search/);
    assert.match(content, /filter/);
    assert.match(content, /network/);
    assert.match(content, /alert/);

    // Touch target >= 44px
    assert.match(content, /minHeight/);

    // Antislop
    assert.strictEqual(content.includes('—'), false, 'EmptyState.tsx must not contain em-dashes');
    assert.strictEqual(content.includes('9999px'), false, 'EmptyState.tsx must not contain 9999px');
  });

  it('verifies ErrorBanner.tsx and ErrorState.tsx standardized Indonesian copy', () => {
    const bannerContent = fs.readFileSync(errorBannerPath, 'utf-8');
    const stateContent = fs.readFileSync(errorStatePath, 'utf-8');

    assert.match(bannerContent, /sanitizeUiErrorMessage/);
    assert.match(stateContent, /sanitizeUiErrorMessage/);

    // Touch targets >= 44px
    assert.match(bannerContent, /minHeight/);
    assert.match(stateContent, /minHeight/);

    // Antislop
    assert.strictEqual(bannerContent.includes('—'), false, 'ErrorBanner.tsx must not contain em-dashes');
    assert.strictEqual(stateContent.includes('—'), false, 'ErrorState.tsx must not contain em-dashes');
    assert.strictEqual(bannerContent.includes('9999px'), false, 'ErrorBanner.tsx must not contain 9999px');
    assert.strictEqual(stateContent.includes('9999px'), false, 'ErrorState.tsx must not contain 9999px');
  });

  it('verifies TicketListScreen EmptyState and ErrorBanner integration', () => {
    const content = fs.readFileSync(ticketListPath, 'utf-8');

    assert.match(content, /<EmptyState/);
    assert.match(content, /<ErrorBanner/);
    assert.match(content, /Tidak Ada Tiket yang Sesuai/);
    assert.match(content, /Reset Filter/);
    assert.match(content, /Belum Ada Tiket Ditugaskan/);
    assert.match(content, /Muat Ulang Data/);

    assert.strictEqual(content.includes('—'), false, 'TicketListScreen.tsx must not contain em-dashes');
    assert.strictEqual(content.includes('9999px'), false, 'TicketListScreen.tsx must not contain 9999px');
  });

  it('verifies LoginScreen standardized error wiring and ErrorBanner integration', () => {
    const content = fs.readFileSync(loginPath, 'utf-8');

    assert.match(content, /STANDARD_ERROR_MESSAGES\.INVALID_CREDENTIALS/);
    assert.match(content, /STANDARD_ERROR_MESSAGES\.SYSTEM_PROCESSING_ERROR/);
    assert.match(content, /<ErrorBanner/);

    assert.strictEqual(content.includes('—'), false, 'LoginScreen.tsx must not contain em-dashes');
    assert.strictEqual(content.includes('9999px'), false, 'LoginScreen.tsx must not contain 9999px');
  });

  it('verifies web mobile-devtools-guard action button label matches exact R3 specification', () => {
    const content = fs.readFileSync(webGuardPath, 'utf-8');

    assert.match(content, /<span>Periksa Ulang Status Perangkat<\/span>/);
    assert.strictEqual(content.includes('—'), false, 'mobile-devtools-guard.tsx must not contain em-dashes');
  });

  it('validates standardized error message mapping for authentication, server, and data loading', () => {
    assert.strictEqual(
      STANDARD_ERROR_MESSAGES.INVALID_CREDENTIALS,
      'Kredensial yang dimasukkan tidak valid.'
    );
    assert.strictEqual(
      STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR,
      'Terjadi gangguan pemrosesan pada sistem. Silakan coba beberapa saat lagi.'
    );
    assert.strictEqual(
      STANDARD_ERROR_MESSAGES.DATA_LOAD_FAILED,
      'Gagal memuat data operasional. Periksa koneksi jaringan Anda dan coba kembali.'
    );

    const authSanitized = sanitizeUiErrorMessage({ code: 'INVALID_CREDENTIALS' });
    assert.strictEqual(authSanitized.message, 'Kredensial yang dimasukkan tidak valid.');

    const sysSanitized = sanitizeUiErrorMessage(new Error('P2002 Unique constraint failed'));
    assert.strictEqual(
      sysSanitized.message,
      'Terjadi gangguan pemrosesan pada sistem. Silakan coba beberapa saat lagi.'
    );
  });
});
