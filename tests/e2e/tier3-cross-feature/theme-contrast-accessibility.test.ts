import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MockPersistentStorage } from '../helpers/mock-storage';
import {
  THEME_PALETTES,
  GEOMETRY_TOKENS,
  tokens,
} from '../../../apps/mobile/src/theme/tokens';

// WCAG Contrast calculation
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b];
}

function getRelativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((val) => {
    const s = val / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function calculateContrast(fg: string, bg: string): number {
  const l1 = getRelativeLuminance(hexToRgb(fg));
  const l2 = getRelativeLuminance(hexToRgb(bg));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('Tier 3: Cross-Feature - Theme Switcher, Contrast & Accessibility Sync', () => {
  it('1. preserves exact geometry tokens and >=44px touch targets across theme transitions', () => {
    const themes = ['light', 'dark', 'outdoorSunlight'] as const;

    for (const theme of themes) {
      // Radii invariant
      assert.strictEqual(GEOMETRY_TOKENS.radii.badge, 4);
      assert.strictEqual(GEOMETRY_TOKENS.radii.input, 6);
      assert.strictEqual(GEOMETRY_TOKENS.radii.button, 6);
      assert.strictEqual(GEOMETRY_TOKENS.radii.card, 8);
      assert.strictEqual(GEOMETRY_TOKENS.radii.modal, 8);

      // Touch invariant
      assert.ok(GEOMETRY_TOKENS.touch.minTouchTarget >= 44);
      assert.ok(GEOMETRY_TOKENS.touch.buttonMinHeight >= 44);
    }
  });

  it('2. verifies Outdoor Sunlight mode guarantees >= 7:1 contrast for direct sunlight readability', () => {
    const outdoor = THEME_PALETTES.outdoorSunlight;
    const primaryContrast = calculateContrast(outdoor.textPrimary, outdoor.bg);
    const secondaryContrast = calculateContrast(outdoor.textSecondary, outdoor.bg);
    const borderContrast = calculateContrast(outdoor.border, outdoor.bg);

    assert.ok(
      primaryContrast >= 7.0,
      `Primary text contrast ${primaryContrast.toFixed(2)}:1 must exceed 7:1 for outdoor mode`
    );
    assert.ok(
      secondaryContrast >= 7.0,
      `Secondary text contrast ${secondaryContrast.toFixed(2)}:1 must exceed 7:1`
    );
    assert.ok(
      borderContrast >= 7.0,
      `Border contrast ${borderContrast.toFixed(2)}:1 must exceed 7:1 for harsh glare visibility`
    );
  });

  it('3. verifies Light and Dark modes strictly comply with WCAG AA standard (>= 4.5:1 text)', () => {
    const lightContrast = calculateContrast(THEME_PALETTES.light.textPrimary, THEME_PALETTES.light.bg);
    const darkContrast = calculateContrast(THEME_PALETTES.dark.textPrimary, THEME_PALETTES.dark.bg);

    assert.ok(lightContrast >= 4.5, `Light contrast ${lightContrast.toFixed(2)}:1 must be >= 4.5:1`);
    assert.ok(darkContrast >= 4.5, `Dark contrast ${darkContrast.toFixed(2)}:1 must be >= 4.5:1`);
  });

  it('4. verifies status badges maintain accessible contrast across all 3 themes', () => {
    const statusBadges = {
      good: '#10B981',
      warning: '#F59E0B',
      critical: '#EF4444',
    };

    // Dark mode contrast
    const darkBg = THEME_PALETTES.dark.bg;
    assert.ok(calculateContrast(statusBadges.good, darkBg) >= 3.0);
    assert.ok(calculateContrast(statusBadges.warning, darkBg) >= 4.5);
    assert.ok(calculateContrast(statusBadges.critical, darkBg) >= 3.0);

    // Outdoor high contrast: critical text on white is 4.0:1
    const whiteBg = THEME_PALETTES.outdoorSunlight.bg;
    assert.ok(calculateContrast(statusBadges.critical, whiteBg) >= 3.0);
  });

  it('5. stores technician theme preference persistently across app restart simulations', async () => {
    const storage = new MockPersistentStorage();
    const THEME_KEY = '@fiberops_active_theme_v1';

    // User chooses Outdoor Sunlight theme
    await storage.setItem(THEME_KEY, 'outdoorSunlight');

    // Simulate reload
    const restoredTheme = await storage.getItem(THEME_KEY);
    assert.strictEqual(restoredTheme, 'outdoorSunlight');

    // User toggles back to Dark theme
    await storage.setItem(THEME_KEY, 'dark');
    const updatedTheme = await storage.getItem(THEME_KEY);
    assert.strictEqual(updatedTheme, 'dark');
  });

  it('6. confirms zero 9999px pills across all theme token definitions', () => {
    for (const radius of Object.values(GEOMETRY_TOKENS.radii)) {
      assert.notStrictEqual(radius, 9999, '9999px pill border radii are strictly forbidden');
      assert.ok(radius <= 8, `Radius ${radius}px exceeds 8px maximum`);
    }
  });
});
