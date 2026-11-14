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
};

export const DARK_THEME: ThemePalette = {
  bg: '#0B0F19',
  background: '#0B0F19',
  surface: '#151C2C',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  badgeBg: '#1E293B',
  border: '#334155',
  primary: '#38BDF8',
  primaryText: '#0B0F19',
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
    inputMinHeight: 44,
    headerActionSize: 44,
  },
};

export const TYPOGRAPHY_TOKENS = {
  fontFamily: {
    sans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
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

export const tokens = {
  radii: GEOMETRY_TOKENS.radii,
  touch: GEOMETRY_TOKENS.touch,
  themes: THEME_PALETTES,
  typography: TYPOGRAPHY_TOKENS,
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
  };
}

export default tokens;
