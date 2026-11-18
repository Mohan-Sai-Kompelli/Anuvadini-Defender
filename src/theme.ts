/**
 * LEGACY theme adapter — keeps the original `Theme` shape compiling for the
 * unmigrated screens while remapping every value to the SAACMS design tokens.
 * New code should use useTheme() from src/design/ThemeContext and the ui kit.
 */
import type { TextStyle, ViewStyle } from 'react-native';
import { CustomColors } from './colors';

const shadowBase = { shadowColor: CustomColors.shadow };

export const Theme = {
  // Extended color palette (legacy keys, token values)
  colors: {
    ...CustomColors,
    primaryDark: '#1A6B7A', // brand 700
    primaryLight: '#F0F9FA', // brand 50
    accent: '#2C9E83',
    cardShadow: 'rgba(44, 131, 149, 0.12)',
    textTertiary: '#94A3B8', // slate 400
    info: '#0284C7',
    disabled: '#CBD5E1', // slate 300
  },

  // Spacing scale (legacy keys)
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },

  // Typography presets (legacy keys, properly typed)
  typography: {
    heroTitle: {
      fontSize: 32,
      fontWeight: '700',
      lineHeight: 40,
      color: CustomColors.text,
    } as TextStyle,
    sectionTitle: {
      fontSize: 20,
      fontWeight: '700',
      lineHeight: 28,
      color: CustomColors.text,
    } as TextStyle,
    cardTitle: {
      fontSize: 16,
      fontWeight: '700',
      lineHeight: 24,
      color: CustomColors.text,
    } as TextStyle,
    bodyText: {
      fontSize: 14,
      fontWeight: '500',
      lineHeight: 20,
      color: CustomColors.text,
    } as TextStyle,
    caption: {
      fontSize: 12,
      fontWeight: '400',
      lineHeight: 18,
      color: CustomColors.textSecondary,
    } as TextStyle,
    badge: {
      fontSize: 11,
      fontWeight: '700',
      lineHeight: 16,
      color: CustomColors.white,
    } as TextStyle,
    smallText: {
      fontSize: 13,
      fontWeight: '400',
      lineHeight: 19,
      color: CustomColors.textSecondary,
    } as TextStyle,
  },

  // Shadow presets (legacy keys)
  shadows: {
    elevation1: {
      ...shadowBase,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 2,
      elevation: 1,
    } as ViewStyle,
    elevation2: {
      ...shadowBase,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 2,
    } as ViewStyle,
    elevation4: {
      ...shadowBase,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    } as ViewStyle,
    elevation8: {
      ...shadowBase,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.14,
      shadowRadius: 16,
      elevation: 8,
    } as ViewStyle,
  },

  // Gradient presets (legacy; render with Skia or pick a solid stop)
  gradients: {
    primary: [CustomColors.primary, '#1A6B7A'],
    accent: ['#2C9E83', '#3BB38C'],
    success: [CustomColors.success, '#15803D'],
  },

  // Border radius (legacy keys, token values)
  borderRadius: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 9999,
  },
};

// Re-export CustomColors for backward compatibility
export { CustomColors } from './colors';

// Re-export the new design tokens so migrated code can import from here too.
export * from './design/tokens';
