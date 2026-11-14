import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  tokens,
  GEOMETRY_TOKENS,
  THEME_PALETTES,
  TYPOGRAPHY_TOKENS,
  getThemeTokens,
} from '../../../apps/mobile/src/theme/tokens';

// WCAG 2.1 Relative Luminance & Contrast Ratio calculation
function hexToRgb(hex: string): [number, number, number] {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return [r, g, b];
}

function getRelativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((val) => {
    const s = val / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function calculateContrastRatio(foregroundHex: string, backgroundHex: string): number {
  const fgL = getRelativeLuminance(hexToRgb(foregroundHex));
  const bgL = getRelativeLuminance(hexToRgb(backgroundHex));
  const lighter = Math.max(fgL, bgL);
  const darker = Math.min(fgL, bgL);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('Tier 1: Feature 13 - Mobile Design Tokens & Themes (apps/mobile/src/theme/tokens.ts)', () => {
  it('enforces 4px-8px border radii and STRICTLY ZERO 9999px pill radii', () => {
    const radii = tokens.radii;
    assert.ok(radii, 'tokens.radii must be defined');

    for (const [key, val] of Object.entries(radii)) {
      const numVal = typeof val === 'number' ? val : parseInt(String(val), 10);
      assert.ok(
        numVal >= 4 && numVal <= 8,
        `Token radius ${key} (${numVal}px) violates 4px-8px bounded requirement`
      );
      assert.notStrictEqual(numVal, 9999, `Pill radius 9999px is strictly banned (${key})`);
    }
  });

  it('enforces minimum 44px touch targets on all interactive elements', () => {
    const touch = tokens.touch;
    assert.ok(touch, 'tokens.touch must be defined');

    assert.ok(touch.minTouchTarget >= 44, 'minTouchTarget must be >= 44px');
    assert.ok(touch.buttonMinHeight >= 44, 'buttonMinHeight must be >= 44px');
    assert.ok(touch.inputMinHeight >= 44, 'inputMinHeight must be >= 44px');
  });

  it('guarantees Light theme meets WCAG AA contrast ratio (>= 4.5:1)', () => {
    const light = tokens.themes.light;
    assert.ok(light, 'tokens.themes.light must be defined');

    const textBgContrast = calculateContrastRatio(light.textPrimary, light.background);
    assert.ok(
      textBgContrast >= 4.5,
      `Light textPrimary contrast (${textBgContrast.toFixed(2)}:1) does not meet WCAG AA >= 4.5:1`
    );

    const secTextContrast = calculateContrastRatio(light.textSecondary, light.background);
    assert.ok(
      secTextContrast >= 4.5,
      `Light textSecondary contrast (${secTextContrast.toFixed(2)}:1) does not meet WCAG AA >= 4.5:1`
    );
  });

  it('guarantees Dark theme meets WCAG AA contrast ratio (>= 4.5:1)', () => {
    const dark = tokens.themes.dark;
    assert.ok(dark, 'tokens.themes.dark must be defined');

    const darkTextContrast = calculateContrastRatio(dark.textPrimary, dark.background);
    assert.ok(
      darkTextContrast >= 4.5,
      `Dark textPrimary contrast (${darkTextContrast.toFixed(2)}:1) does not meet WCAG AA >= 4.5:1`
    );

    const darkSecContrast = calculateContrastRatio(dark.textSecondary, dark.background);
    assert.ok(
      darkSecContrast >= 4.5,
      `Dark textSecondary contrast (${darkSecContrast.toFixed(2)}:1) does not meet WCAG AA >= 4.5:1`
    );
  });

  it('guarantees Outdoor Sunlight theme delivers maximum high-contrast legibility (>= 7:1)', () => {
    const sunlight = tokens.themes.outdoorSunlight;
    assert.ok(sunlight, 'tokens.themes.outdoorSunlight must be defined');

    const sunlightContrast = calculateContrastRatio(sunlight.textPrimary, sunlight.background);
    assert.ok(
      sunlightContrast >= 7.0,
      `Outdoor Sunlight contrast (${sunlightContrast.toFixed(2)}:1) does not meet high-contrast >= 7.0:1`
    );
  });
});
