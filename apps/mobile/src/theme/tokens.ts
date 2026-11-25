import { classifyDbm, DbmStatus } from '@repo/shared';

export interface ThemePalette {
  bg: string;
  background: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  badgeBg: string;
  border: string;
  primary: string;
  primaryText: string;
  surfaceSecondary: string;
  surfaceElevated: string;
  surfaceInset: string;
  textMuted: string;
  borderLight: string;
  borderHighlight: string;
  primaryHover: string;
  accentCyan: string;
  statusActive: string;
  statusNew: string;
  statusWarning: string;
  statusDanger: string;
  statusOptimal: string;
  statusCritical: string;
  ambientGlow: string;
}

export const LIGHT_THEME: ThemePalette = {
  bg: '#FFFFFF',
  background: '#FFFFFF',
  surface: '#F8FAFC',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  badgeBg: '#F1F5F9',
  border: '#CBD5E1',
  primary: '#0284C7',
  primaryText: '#FFFFFF',
  surfaceSecondary: '#F1F5F9',
  surfaceElevated: '#FFFFFF',
  surfaceInset: '#F8FAFC',
  textMuted: '#64748B',
  borderLight: '#E2E8F0',
  borderHighlight: 'rgba(2, 132, 199, 0.3)',
  primaryHover: '#0369A1',
  accentCyan: '#0284C7',
  statusActive: '#10B981',
  statusNew: '#0EA5E9',
  statusWarning: '#F59E0B',
  statusDanger: '#EF4444',
  statusOptimal: '#10B981',
  statusCritical: '#EF4444',
  ambientGlow: 'none',
};

export const DARK_THEME: ThemePalette = {
  bg: '#080E1A',
  background: '#080E1A',
  surface: '#10192D',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  badgeBg: '#1E293B',
  border: 'rgba(255, 255, 255, 0.08)',
  primary: '#0284C7',
  primaryText: '#FFFFFF',
  surfaceSecondary: '#162035',
  surfaceElevated: '#15223C',
  surfaceInset: '#0A1224',
  textMuted: '#94A3B8',
  borderLight: 'rgba(255, 255, 255, 0.12)',
  borderHighlight: 'rgba(14, 165, 233, 0.35)',
  primaryHover: '#0369A1',
  accentCyan: '#0EA5E9',
  statusActive: '#10B981',
  statusNew: '#0EA5E9',
  statusWarning: '#F59E0B',
  statusDanger: '#EF4444',
  statusOptimal: '#10B981',
  statusCritical: '#EF4444',
  ambientGlow:
    'radial-gradient(ellipse at 85% -10%, rgba(14, 165, 233, 0.18) 0%, rgba(2, 132, 199, 0.06) 45%, #080E1A 85%)',
};

export const OUTDOOR_SUNLIGHT_THEME: ThemePalette = {
  bg: '#FFFFFF',
  background: '#FFFFFF',
  surface: '#FFFFFF',
  textPrimary: '#000000',
  textSecondary: '#111827',
  badgeBg: '#FFFFFF',
  border: '#000000',
  primary: '#0047AB',
  primaryText: '#FFFFFF',
  surfaceSecondary: '#F3F4F6',
  surfaceElevated: '#FFFFFF',
  surfaceInset: '#F9FAFB',
  textMuted: '#1F2937',
  borderLight: '#000000',
  borderHighlight: '#0047AB',
  primaryHover: '#003380',
  accentCyan: '#0047AB',
  statusActive: '#047857',
  statusNew: '#0369A1',
  statusWarning: '#B45309',
  statusDanger: '#B91C1C',
  statusOptimal: '#047857',
  statusCritical: '#B91C1C',
  ambientGlow: 'none',
};

export const OUTDOOR_THEME = OUTDOOR_SUNLIGHT_THEME;

export const THEME_PALETTES = {
  light: LIGHT_THEME,
  dark: DARK_THEME,
  outdoorSunlight: OUTDOOR_SUNLIGHT_THEME,
  outdoor: OUTDOOR_SUNLIGHT_THEME,
};

export const GEOMETRY_TOKENS = {
  radii: {
    badge: 4,
    input: 6,
    button: 6,
    card: 8,
    modal: 8,
  },
  touch: {
    minTouchTarget: 44,
    buttonMinHeight: 44,
    inputMinHeight: 48,
    headerActionSize: 44,
  },
};

export const ENTERPRISE_GEOMETRY_TOKENS = {
  radii: {
    badge: 6,
    button: 10,
    input: 12,
    kpiCard: 14,
    card: 16,
    modal: 16,
    pill: 24,
  },
  touch: {
    minTouchTarget: 44,
    buttonMinHeight: 44,
    inputMinHeight: 48,
    headerActionSize: 44,
  },
};

export const TYPOGRAPHY_TOKENS = {
  fontFamily: {
    sans: 'var(--font-sans, "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
    mono: 'var(--font-mono, "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace)',
  },
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
  },
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
  separator: ' - ',
};

export const TACTILE_TOKENS = {
  transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
  activeScale: 'scale(0.98)',
  glowPrimary: '0 2px 14px rgba(2, 132, 199, 0.35)',
  glowCyan: '0 2px 10px rgba(14, 165, 233, 0.25)',
  shadowCard: '0 4px 20px -2px rgba(0, 0, 0, 0.45), 0 2px 6px rgba(0, 0, 0, 0.25)',
  shadowElevated: '0 10px 40px -10px rgba(0, 0, 0, 0.65)',
};

export interface OpticalDbmTelemetryBadge {
  status: DbmStatus | 'Neutral';
  label: string;
  tone: 'green' | 'orange' | 'red' | 'gray';
  color: string;
  bg: string;
  border: string;
  description: string;
}

/**
 * Formats and classifies raw attenuation (dBm) for field technician telemetry display.
 * Standar redaman operasional FTTH GPON (batas bagus maksimal 28 dB):
 * - Normal: -10.00 to -25.00 dBm (Optimal FTTH link)
 * - Warning: -25.10 to -28.00 dBm (Masih layak, mendekati batas 28 dB)
 * - Critical: < -28.00 dBm (> 28 dB) or > -10.00 dBm (Redaman jelek / saturasi)
 */
export function formatOpticalTelemetryDbm(
  value: number | string | null | undefined,
  themeMode: 'light' | 'dark' | 'outdoorSunlight' = 'light',
): OpticalDbmTelemetryBadge {
  const status = classifyDbm(value);
  const num = typeof value === 'number' ? value : Number(value);
  const formattedVal = !isNaN(num) && value !== null && value !== undefined && value !== ''
    ? `${num.toFixed(2)} dBm`
    : 'Belum Terukur';
  const isOutdoor = themeMode === 'outdoorSunlight';
  const isDark = themeMode === 'dark';

  switch (status) {
    case 'Normal':
      return {
        status: 'Normal',
        label: `${formattedVal} (Optimal)`,
        tone: 'green',
        color: isOutdoor ? '#14532D' : isDark ? '#34D399' : '#15803D',
        bg: isOutdoor ? '#FFFFFF' : isDark ? 'rgba(16, 185, 129, 0.14)' : '#ECFDF5',
        border: isOutdoor ? '#14532D' : isDark ? 'rgba(52, 211, 153, 0.35)' : 'rgba(21, 128, 61, 0.28)',
        description: 'Sinyal optik prima sesuai standar FTTH GPON.',
      };
    case 'Warning':
      return {
        status: 'Warning',
        label: `${formattedVal} (Warning)`,
        tone: 'orange',
        color: isOutdoor ? '#78350F' : isDark ? '#FBBF24' : '#B45309',
        bg: isOutdoor ? '#FFFFFF' : isDark ? 'rgba(245, 158, 11, 0.14)' : '#FFFBEB',
        border: isOutdoor ? '#78350F' : isDark ? 'rgba(251, 191, 36, 0.35)' : 'rgba(180, 83, 9, 0.28)',
        description: 'Redaman mendekati batas toleransi operasi.',
      };
    case 'Critical':
      return {
        status: 'Critical',
        label: `${formattedVal} (Kritis)`,
        tone: 'red',
        color: isOutdoor ? '#991B1B' : isDark ? '#F87171' : '#B91C1C',
        bg: isOutdoor ? '#FFFFFF' : isDark ? 'rgba(239, 68, 68, 0.14)' : '#FEF2F2',
        border: isOutdoor ? '#991B1B' : isDark ? 'rgba(248, 113, 113, 0.35)' : 'rgba(185, 28, 28, 0.28)',
        description: 'Sinyal optik melebihi batas redaman maksimal 28 dB (-28.00 dBm).',
      };
    default:
      return {
        status: 'Neutral',
        label: formattedVal,
        tone: 'gray',
        color: isOutdoor ? '#000000' : isDark ? '#CBD5E1' : '#475569',
        bg: isOutdoor ? '#F3F4F6' : isDark ? '#1E293B' : '#F1F5F9',
        border: isOutdoor ? '#000000' : isDark ? 'rgba(148, 163, 184, 0.28)' : 'rgba(71, 85, 105, 0.25)',
        description: 'Nilai redaman optik belum terbaca dari OPM.',
      };
  }
}

export const tokens = {
  radii: GEOMETRY_TOKENS.radii,
  touch: GEOMETRY_TOKENS.touch,
  themes: THEME_PALETTES,
  typography: TYPOGRAPHY_TOKENS,
  tactile: TACTILE_TOKENS,
};

export const DESIGN_TOKENS = tokens;

export function getThemeTokens(
  themeName: 'light' | 'dark' | 'outdoorSunlight' | 'outdoor' | string = 'light',
) {
  const normalized = themeName === 'outdoor' ? 'outdoorSunlight' : themeName;
  const theme = THEME_PALETTES[normalized as keyof typeof THEME_PALETTES] || THEME_PALETTES.light;
  return {
    ...theme,
    geometry: GEOMETRY_TOKENS,
    typography: TYPOGRAPHY_TOKENS,
    radii: GEOMETRY_TOKENS.radii,
    touch: GEOMETRY_TOKENS.touch,
    tactile: TACTILE_TOKENS,
  };
}

export default tokens;
