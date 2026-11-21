import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Tier 1: Feature 23 - Mobile Website Theme Switcher (Terang, Gelap, Sistem)', () => {
  const appPath = path.resolve(process.cwd(), '../../apps/mobile/App.tsx');
  const ticketListPath = path.resolve(
    process.cwd(),
    '../../apps/mobile/src/screens/TicketListScreen.tsx'
  );
  const mobilePagePath = path.resolve(process.cwd(), '../../apps/web/src/app/mobile/page.tsx');
  const globalsCssPath = path.resolve(process.cwd(), '../../apps/web/src/app/globals.css');

  const appContent = fs.readFileSync(appPath, 'utf-8');
  const ticketListContent = fs.readFileSync(ticketListPath, 'utf-8');
  const mobilePageContent = fs.readFileSync(mobilePagePath, 'utf-8');
  const globalsCssContent = fs.readFileSync(globalsCssPath, 'utf-8');

  it('connects /mobile Next.js shell to shared ThemeProvider via useTheme (Opsi A)', () => {
    assert.match(mobilePageContent, /useTheme/);
    assert.match(mobilePageContent, /data-mobile-theme=\{resolvedTheme\}/);
    assert.match(mobilePageContent, /themePreference=\{theme\}/);
    assert.match(mobilePageContent, /onThemePreferenceChange=\{setTheme\}/);
    assert.match(mobilePageContent, /initialThemeMode=\{resolvedTheme\}/);
  });

  it('supports light, dark, and system preferences with OS media listener in App.tsx', () => {
    assert.match(appContent, /export type ThemePreference = 'light' \| 'dark' \| 'system'/);
    assert.match(appContent, /prefers-color-scheme: dark/);
    assert.match(appContent, /themePreference=\{activeThemePreference\}/);
    assert.match(appContent, /onChangeThemePreference=\{handleThemePreferenceChange\}/);
  });

  it('renders website-matched theme dropdown beside the sync button on TicketListScreen', () => {
    assert.match(ticketListContent, /Terang \(Light\)/);
    assert.match(ticketListContent, /Gelap \(Dark\)/);
    assert.match(ticketListContent, /Sistem \(Otomatis\)/);
    assert.match(ticketListContent, /aria-haspopup="listbox"/);
    assert.match(ticketListContent, /role="listbox"/);
    assert.match(ticketListContent, /role="option"/);
    assert.match(ticketListContent, /Pilihan Tema Antarmuka/);

    const themeIdx = ticketListContent.indexOf('Pilih Tema Antarmuka');
    const syncIdx = ticketListContent.indexOf('Sinkronkan data tiket');
    assert.ok(themeIdx > -1 && syncIdx > -1 && themeIdx < syncIdx, 'Theme switcher must appear beside sync button');
  });

  it('scopes mobile viewport CSS rules separately for light and dark themes', () => {
    assert.match(globalsCssContent, /\.mobile-shell-viewport:not\(\[data-mobile-theme='dark'\]\)/);
    assert.match(globalsCssContent, /\.mobile-shell-viewport\[data-mobile-theme='dark'\]/);
  });

  it('keeps TicketListScreen theme switcher compliant with antislop and 4-8px radii rules', () => {
    assert.strictEqual(/\u2014|—/.test(ticketListContent), false);
    assert.strictEqual(ticketListContent.includes('9999px'), false);
    assert.strictEqual(ticketListContent.includes('rounded-full'), false);
  });
});
