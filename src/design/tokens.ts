/**
 * SAACMS design tokens — single source of truth (master plan §7.1).
 * Raw palette + light/dark semantic themes + spacing/radii/typography/shadows/durations.
 */
import type { TextStyle, ViewStyle } from 'react-native';

// ---------------------------------------------------------------------------
// Raw scales
// ---------------------------------------------------------------------------

// SAACMS brand = Anuvadini teal-green (sampled from the Anuvadini logo). Drives primary
// CTAs + brand accents app-wide; the warm orange/gold lives in `accent` and the
// hero gradient (which mirrors the logo's orange→gold→green).
export const brandScale = {
  50: '#EAF7F2',
  100: '#CCEDE1',
  200: '#9ADCC6',
  300: '#64C8A7',
  400: '#3BB38C',
  500: '#2C9E83',
  600: '#1F896F',
  700: '#1A6E5A',
  800: '#155847',
  900: '#104437',
} as const;

export const slateScale = {
  50: '#F8FAFC',
  100: '#F1F5F9',
  200: '#E2E8F0',
  300: '#CBD5E1',
  400: '#94A3B8',
  500: '#64748B',
  600: '#475569',
  700: '#334155',
  800: '#1E293B',
  900: '#0F172A',
} as const;

export const palette = {
  brand: brandScale,
  slate: slateScale,
  /** CTAs ONLY, sparingly. Anuvadini logo orange. */
  accent: '#E0801C',
  success: '#16A34A',
  warning: '#F59E0B',
  danger: '#DC2626',
  info: '#0284C7',
  white: '#FFFFFF',
  black: '#000000',
} as const;

// ---------------------------------------------------------------------------
// Spacing / radii (4-pt scale)
// ---------------------------------------------------------------------------

export const spacing = {
  /** 4 */ xs: 4,
  /** 8 */ sm: 8,
  /** 12 */ md: 12,
  /** 16 */ lg: 16,
  /** 24 */ xl: 24,
  /** 32 */ xxl: 32,
  /** 48 */ xxxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 9999,
} as const;

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

export const fontSizes = {
  xs: 11,
  sm: 12,
  md: 13,
  base: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const lineHeights = {
  xs: 16,
  sm: 18,
  md: 19,
  base: 20,
  lg: 24,
  xl: 28,
  xxl: 32,
  xxxl: 40,
} as const;

/** Color-free presets — spread into styles and add a theme color. */
export const typography = {
  h1: { fontSize: 32, lineHeight: 40, fontWeight: '700' },
  h2: { fontSize: 24, lineHeight: 32, fontWeight: '700' },
  h3: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
  title: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  bodyBold: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  small: { fontSize: 13, lineHeight: 19, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 18, fontWeight: '400' },
  label: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
} satisfies Record<string, TextStyle>;

export type TypographyPreset = keyof typeof typography;

// ---------------------------------------------------------------------------
// Shadows (4 elevation presets, light + dark variants)
// ---------------------------------------------------------------------------

export interface ShadowSet {
  e1: ViewStyle;
  e2: ViewStyle;
  e3: ViewStyle;
  e4: ViewStyle;
}

// Premium soft, large, diffuse shadows — make cards "float" (the key tell of a
// premium light UI vs a flat/government one). Low opacity + big radius.
export const shadowsLight: ShadowSet = {
  e1: {
    shadowColor: slateScale[900],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  e2: {
    shadowColor: slateScale[900],
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  e3: {
    shadowColor: slateScale[900],
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 28,
    elevation: 8,
  },
  e4: {
    shadowColor: slateScale[900],
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.12,
    shadowRadius: 40,
    elevation: 12,
  },
};

export const shadowsDark: ShadowSet = {
  e1: {
    shadowColor: palette.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 2,
    elevation: 1,
  },
  e2: {
    shadowColor: palette.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 2,
  },
  e3: {
    shadowColor: palette.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 4,
  },
  e4: {
    shadowColor: palette.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
};

// ---------------------------------------------------------------------------
// Motion durations (ms)
// ---------------------------------------------------------------------------

export const durations = {
  fast: 150,
  normal: 250,
  /** standard card/list entering duration */
  enter: 300,
  slow: 400,
} as const;

// ---------------------------------------------------------------------------
// Semantic themes
// ---------------------------------------------------------------------------

export interface ThemeColors {
  /** Screen background */
  bg: string;
  /** Card / sheet background */
  surface: string;
  /** Subtle inset background (inputs, skeletons, segmented track) */
  surfaceAlt: string;
  text: string;
  textMuted: string;
  /** Text on top of brand/danger filled surfaces */
  textInverse: string;
  border: string;
  /** Primary teal (brightened in dark for contrast) */
  brand: string;
  /** Tonal brand background (chips, secondary buttons) */
  brandSoft: string;
  /** High-emphasis brand fg on brandSoft */
  brandStrong: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  /** Tonal backgrounds for status pills / banners */
  successSoft: string;
  warningSoft: string;
  dangerSoft: string;
  infoSoft: string;
  accentSoft: string;
  /** Modal backdrop */
  overlay: string;
  white: string;
  black: string;
  /** Raw scales for edge cases */
  brandScale: typeof brandScale;
  slate: typeof slateScale;
  // --- Glass / premium tokens -------------------------------------------------
  /** Immersive brand gradient (login, headers) — Skia LinearGradient stops. */
  gradientBrand: string[];
  /** Subtle tinted page gradient for content screens. */
  gradientSubtle: string[];
  /** Soft glow-orb colors (translucent) painted behind glass for depth. */
  glow: string[];
  /** Translucent card fill over a colored backdrop (true "glass" look). */
  glassFill: string;
  /** Near-opaque card fill for content-heavy glass cards on light backdrops. */
  glassFillStrong: string;
  /** Hairline highlight border for glass surfaces. */
  glassBorder: string;
  /** Text on top of the brand gradient. */
  onGradient: string;
  /** Muted text on top of the brand gradient. */
  onGradientMuted: string;
}

export interface AppTheme {
  scheme: 'light' | 'dark';
  dark: boolean;
  colors: ThemeColors;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
  fontSizes: typeof fontSizes;
  lineHeights: typeof lineHeights;
  /** Already resolved for this scheme */
  shadows: ShadowSet;
  durations: typeof durations;
}

const shared = {
  spacing,
  radii,
  typography,
  fontSizes,
  lineHeights,
  durations,
} as const;

export const lightTheme: AppTheme = {
  scheme: 'light',
  dark: false,
  colors: {
    bg: slateScale[50],
    surface: palette.white,
    surfaceAlt: slateScale[100],
    text: slateScale[900],
    textMuted: slateScale[500],
    textInverse: palette.white,
    border: slateScale[200],
    brand: brandScale[500],
    brandSoft: brandScale[100],
    brandStrong: brandScale[700],
    accent: palette.accent,
    success: palette.success,
    warning: palette.warning,
    danger: palette.danger,
    info: palette.info,
    successSoft: '#DCFCE7',
    warningSoft: '#FEF3C7',
    dangerSoft: '#FEE2E2',
    infoSoft: '#E0F2FE',
    accentSoft: '#FFE8DE',
    overlay: 'rgba(15, 23, 42, 0.45)',
    white: palette.white,
    black: palette.black,
    brandScale,
    slate: slateScale,
    gradientBrand: ['#E0801C', '#D8A818', brandScale[500]],
    gradientSubtle: [slateScale[50], brandScale[50], slateScale[50]],
    // Gentle, airy tints for the light backdrop (premium, not garish).
    glow: ['rgba(44, 131, 149, 0.10)', 'rgba(140, 207, 216, 0.20)'],
    glassFill: 'rgba(255, 255, 255, 0.22)',
    glassFillStrong: 'rgba(255, 255, 255, 0.90)',
    glassBorder: 'rgba(255, 255, 255, 0.55)',
    onGradient: palette.white,
    onGradientMuted: 'rgba(255, 255, 255, 0.85)',
  },
  shadows: shadowsLight,
  ...shared,
};

// Premium dark palette (CRED-style): near-black canvas, charcoal glass
// surfaces, a vibrant mint-teal primary that glows, and a warm-gold secondary.
export const darkTheme: AppTheme = {
  scheme: 'dark',
  dark: true,
  colors: {
    bg: '#0A0B0F', // near-black canvas
    surface: '#15171F', // elevated charcoal card
    surfaceAlt: '#1E212B', // inputs / inset
    text: '#F4F6FA', // near-white
    textMuted: '#8B92A2', // muted grey
    textInverse: '#0A0B0F',
    border: 'rgba(255, 255, 255, 0.08)',
    brand: '#2DD4BF', // vibrant mint-teal (glows)
    brandSoft: 'rgba(45, 212, 191, 0.14)',
    brandStrong: '#5EEAD4',
    accent: '#E8C37E', // warm gold (premium secondary)
    success: '#34D399',
    warning: '#FBBF24',
    danger: '#F87171',
    info: '#60A5FA',
    successSoft: 'rgba(52, 211, 153, 0.14)',
    warningSoft: 'rgba(251, 191, 36, 0.14)',
    dangerSoft: 'rgba(248, 113, 113, 0.14)',
    infoSoft: 'rgba(96, 165, 250, 0.14)',
    accentSoft: 'rgba(232, 195, 126, 0.14)',
    overlay: 'rgba(0, 0, 0, 0.72)',
    white: palette.white,
    black: palette.black,
    brandScale,
    slate: slateScale,
    // Dark mesh gradient: teal-tinted top → black → indigo-tinted bottom.
    gradientBrand: ['#0E2F2C', '#0A0B0F', '#141433'],
    gradientSubtle: ['#0C0E13', '#0A0B0F', '#0C0E13'],
    // Vibrant glow orbs (teal + violet) — the premium light source.
    glow: ['rgba(45, 212, 191, 0.38)', 'rgba(139, 92, 246, 0.34)'],
    glassFill: 'rgba(255, 255, 255, 0.05)',
    glassFillStrong: 'rgba(21, 23, 31, 0.66)',
    glassBorder: 'rgba(255, 255, 255, 0.10)',
    onGradient: '#FFFFFF',
    onGradientMuted: 'rgba(255, 255, 255, 0.72)',
  },
  shadows: shadowsDark,
  ...shared,
};
