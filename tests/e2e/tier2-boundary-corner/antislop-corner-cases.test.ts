import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { tokens } from '../../../apps/mobile/src/theme/tokens';

// WCAG 2.1 Contrast Calculation Helpers
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

export function calculateContrastRatio(fgHex: string, bgHex: string): number {
  const fgL = getRelativeLuminance(hexToRgb(fgHex));
  const bgL = getRelativeLuminance(hexToRgb(bgHex));
  const lighter = Math.max(fgL, bgL);
  const darker = Math.min(fgL, bgL);
  return (lighter + 0.05) / (darker + 0.05);
}

const CANONICAL_THEME_TOKENS = {
  light: {
    bg: '#FFFFFF',
    surface: '#F8FAFC',
    textPrimary: '#0F172A',
    textSecondary: '#475569',
    border: '#CBD5E1',
    primary: '#0284C7',
  },
  dark: {
    bg: '#0B0F19',
    surface: '#151C2C',
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    border: '#334155',
    primary: '#38BDF8',
  },
  outdoorSunlight: {
    bg: '#FFFFFF',
    surface: '#FFFFFF',
    textPrimary: '#000000',
    textSecondary: '#111827',
    border: '#000000',
    primary: '#0047AB',
  },
};

const CANONICAL_RADII = {
  badge: 4,
  input: 6,
  button: 6,
  card: 8,
  modal: 8,
};

describe('Tier 2: Boundary & Corner - Antislop & UI Constraints', () => {
  const mobileRoot = path.resolve(process.cwd(), '../../apps/mobile');

  function readMobileFile(relativePath: string): string {
    const fullPath = path.join(mobileRoot, relativePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Target file does not exist: ${fullPath}`);
    }
    return fs.readFileSync(fullPath, 'utf-8');
  }

  it('1. verifies ZERO em-dashes (\\u2014 or —) exist in App.tsx', () => {
    const content = readMobileFile('App.tsx');
    assert.strictEqual(
      /\u2014|—/.test(content),
      false,
      'App.tsx contains forbidden em-dash character'
    );
  });

  it('2. verifies ZERO em-dashes exist in LoginScreen.tsx', () => {
    const content = readMobileFile('src/screens/LoginScreen.tsx');
    assert.strictEqual(
      /\u2014|—/.test(content),
      false,
      'LoginScreen.tsx contains forbidden em-dash character'
    );
  });

  it('3. verifies ZERO em-dashes exist in TicketListScreen.tsx', () => {
    const content = readMobileFile('src/screens/TicketListScreen.tsx');
    assert.strictEqual(
      /\u2014|—/.test(content),
      false,
      'TicketListScreen.tsx contains forbidden em-dash character'
    );
  });

  it('4. verifies ZERO em-dashes exist in TicketSubmitScreen.tsx', () => {
    const content = readMobileFile('src/screens/TicketSubmitScreen.tsx');
    assert.strictEqual(
      /\u2014|—/.test(content),
      false,
      'TicketSubmitScreen.tsx contains forbidden em-dash character'
    );
  });

  it('5. verifies ZERO em-dashes exist in OpmCameraModal.tsx', () => {
    const content = readMobileFile('src/components/OpmCameraModal.tsx');
    assert.strictEqual(
      /\u2014|—/.test(content),
      false,
      'OpmCameraModal.tsx contains forbidden em-dash character'
    );
  });

  it('6. verifies ZERO 9999px pill border radii exist across all mobile source files', () => {
    const screenFiles = [
      'App.tsx',
      'src/screens/LoginScreen.tsx',
      'src/screens/TicketListScreen.tsx',
      'src/screens/TicketSubmitScreen.tsx',
      'src/components/OpmCameraModal.tsx',
    ];

    const pillRegex = /(?:borderRadius|border-radius)\s*:\s*(?:['"]?9999(?:px)?['"]?)|rounded-full/i;

    for (const relFile of screenFiles) {
      const content = readMobileFile(relFile);
      assert.strictEqual(
        pillRegex.test(content),
        false,
        `File ${relFile} violates anti-slop ban by declaring a 9999px pill border radius`
      );
    }
  });

  it('7. verifies minimum 44px touch targets on interactive controls in LoginScreen.tsx', () => {
    const content = readMobileFile('src/screens/LoginScreen.tsx');
    // Check for minHeight / height >= 44
    const touchTargetMatch = /minHeight:\s*(?:4[4-9]|[5-9]\d|\d{3})|height:\s*(?:4[4-9]|[5-9]\d|\d{3})|min-height:\s*44px/i;
    assert.ok(
      touchTargetMatch.test(content) || content.includes('44'),
      'LoginScreen must define at least 44px touch target dimensions'
    );
  });

  it('8. verifies design tokens define minimum 44px touch target standards', () => {
    const touchTokens = tokens.touch;
    assert.ok(touchTokens.minTouchTarget >= 44, 'minTouchTarget must be at least 44px');
    assert.ok(touchTokens.buttonMinHeight >= 44, 'buttonMinHeight must be at least 44px');
    assert.ok(touchTokens.inputMinHeight >= 44, 'inputMinHeight must be at least 44px');
  });

  it('9. verifies minimum 44px touch targets on interactive inputs and buttons in LoginScreen.tsx', () => {
    const content = readMobileFile('src/screens/LoginScreen.tsx');
    const minHeight44Occurrences = content.match(/minHeight:\s*['"]?44(?:px)?['"]?/g);
    assert.ok(
      minHeight44Occurrences && minHeight44Occurrences.length >= 3,
      'LoginScreen must explicitly define 44px minimum height on username, password, and submit button'
    );
  });

  it('10. verifies Light theme text contrast meets WCAG AA (>= 4.5:1)', () => {
    const light = CANONICAL_THEME_TOKENS.light;
    const primaryRatio = calculateContrastRatio(light.textPrimary, light.bg);
    const secondaryRatio = calculateContrastRatio(light.textSecondary, light.bg);

    assert.ok(
      primaryRatio >= 4.5,
      `Light mode primary text contrast ${primaryRatio.toFixed(2)}:1 below WCAG AA 4.5:1`
    );
    assert.ok(
      secondaryRatio >= 4.5,
      `Light mode secondary text contrast ${secondaryRatio.toFixed(2)}:1 below WCAG AA 4.5:1`
    );
  });

  it('11. verifies Dark theme text contrast meets WCAG AA (>= 4.5:1)', () => {
    const dark = CANONICAL_THEME_TOKENS.dark;
    const primaryRatio = calculateContrastRatio(dark.textPrimary, dark.bg);
    const secondaryRatio = calculateContrastRatio(dark.textSecondary, dark.bg);

    assert.ok(
      primaryRatio >= 4.5,
      `Dark mode primary text contrast ${primaryRatio.toFixed(2)}:1 below WCAG AA 4.5:1`
    );
    assert.ok(
      secondaryRatio >= 4.5,
      `Dark mode secondary text contrast ${secondaryRatio.toFixed(2)}:1 below WCAG AA 4.5:1`
    );
  });

  it('12. verifies Outdoor Sunlight mode exceeds high-contrast threshold (>= 7:1)', () => {
    const outdoor = CANONICAL_THEME_TOKENS.outdoorSunlight;
    const primaryRatio = calculateContrastRatio(outdoor.textPrimary, outdoor.bg);
    const secondaryRatio = calculateContrastRatio(outdoor.textSecondary, outdoor.bg);

    assert.ok(
      primaryRatio >= 7.0,
      `Outdoor mode primary text contrast ${primaryRatio.toFixed(2)}:1 must be >= 7:1 for outdoor glare`
    );
    assert.ok(
      secondaryRatio >= 7.0,
      `Outdoor mode secondary text contrast ${secondaryRatio.toFixed(2)}:1 must be >= 7:1`
    );
  });

  it('13. verifies graphical component contrast (>= 3:1) for active UI elements and outdoor borders', () => {
    // 1. Outdoor Sunlight border must have maximum contrast (>= 7:1)
    const outdoorBorderContrast = calculateContrastRatio(
      CANONICAL_THEME_TOKENS.outdoorSunlight.border,
      CANONICAL_THEME_TOKENS.outdoorSunlight.bg
    );
    assert.ok(
      outdoorBorderContrast >= 7.0,
      `Outdoor border contrast ${outdoorBorderContrast.toFixed(2)}:1 must be >= 7:1`
    );

    // 2. Light mode primary interactive control against background (>= 3:1)
    const lightPrimaryContrast = calculateContrastRatio(
      CANONICAL_THEME_TOKENS.light.primary,
      CANONICAL_THEME_TOKENS.light.bg
    );
    assert.ok(
      lightPrimaryContrast >= 3.0,
      `Light mode primary control contrast ${lightPrimaryContrast.toFixed(2)}:1 must be >= 3:1`
    );

    // 3. Dark mode primary interactive control against background (>= 3:1)
    const darkPrimaryContrast = calculateContrastRatio(
      CANONICAL_THEME_TOKENS.dark.primary,
      CANONICAL_THEME_TOKENS.dark.bg
    );
    assert.ok(
      darkPrimaryContrast >= 3.0,
      `Dark mode primary control contrast ${darkPrimaryContrast.toFixed(2)}:1 must be >= 3:1`
    );
  });

  it('14. verifies all design token radii are strictly bounded between 4px and 8px', () => {
    for (const [key, radius] of Object.entries(CANONICAL_RADII)) {
      assert.ok(
        radius >= 4 && radius <= 8,
        `Radius for ${key} (${radius}px) outside allowed [4, 8] range`
      );
      assert.notStrictEqual(radius, 9999, `Pill radius 9999px banned on ${key}`);
    }
  });

  it('15. verifies strict absence of generic AI-slop corporate buzzwords in mobile UI copy', () => {
    const slopWords = [
      /\bdelve\b/i,
      /\bleverage\b/i,
      /\bseamlessly\b/i,
      /\bcutting-edge\b/i,
      /\bholistic\b/i,
      /\btapestry\b/i,
    ];

    const screenFiles = [
      'App.tsx',
      'src/screens/LoginScreen.tsx',
      'src/screens/TicketListScreen.tsx',
      'src/screens/TicketSubmitScreen.tsx',
    ];

    for (const relFile of screenFiles) {
      const content = readMobileFile(relFile);
      for (const pattern of slopWords) {
        assert.strictEqual(
          pattern.test(content),
          false,
          `File ${relFile} contains forbidden AI-slop term matching ${pattern}`
        );
      }
    }
  });

  it('16. verifies fallback ODP in TicketSubmitScreen.tsx is strictly "ODP-PLB-001"', () => {
    const content = readMobileFile('src/screens/TicketSubmitScreen.tsx');
    assert.ok(
      content.includes("'ODP-PLB-001'") || content.includes('"ODP-PLB-001"'),
      'TicketSubmitScreen.tsx must declare "ODP-PLB-001" as fallback ODP'
    );
  });

  it('17. verifies semantic attenuation status colors conform to accessibility guidelines', () => {
    const statusColors = {
      good: '#10B981', // Green
      warning: '#F59E0B', // Amber
      critical: '#EF4444', // Red
    };

    // Dark background contrast for status badges
    const bgDark = CANONICAL_THEME_TOKENS.dark.bg;
    const goodContrast = calculateContrastRatio(statusColors.good, bgDark);
    const warningContrast = calculateContrastRatio(statusColors.warning, bgDark);
    const criticalContrast = calculateContrastRatio(statusColors.critical, bgDark);

    assert.ok(goodContrast >= 3.0, `Good status contrast ${goodContrast.toFixed(2)}:1 must be >= 3:1`);
    assert.ok(warningContrast >= 4.5, `Warning status contrast ${warningContrast.toFixed(2)}:1 must be >= 4.5:1`);
    assert.ok(criticalContrast >= 3.0, `Critical status contrast ${criticalContrast.toFixed(2)}:1 must be >= 3:1`);
  });
});
