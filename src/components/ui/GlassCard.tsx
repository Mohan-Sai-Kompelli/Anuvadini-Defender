import React from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../../design/ThemeContext';

export interface GlassCardProps {
  children: React.ReactNode;
  /**
   * 'light'  — translucent glass over a colored/brand backdrop (immersive).
   * 'strong' — near-opaque glass for content-heavy cards on light backdrops.
   */
  tint?: 'light' | 'strong';
  /** Stagger index for the entrance animation (0 = first). */
  enteringIndex?: number;
  /** Disable the entrance animation. */
  noEnter?: boolean;
  padded?: boolean;
  style?: ViewStyle | ViewStyle[];
}

/**
 * Frosted-glass surface: translucent fill + a bright hairline border + soft
 * elevation, designed to sit over <GlassBackdrop/>. (Real backdrop blur needs a
 * native blur module; this is the performant, dependency-free approximation —
 * the gradient + glow orbs behind sell the depth.)
 */
export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  tint = 'strong',
  enteringIndex = 0,
  noEnter = false,
  padded = true,
  style,
}) => {
  const { theme } = useTheme();
  const { colors, radii, spacing, shadows } = theme;

  const base: ViewStyle = {
    backgroundColor: tint === 'light' ? colors.glassFill : colors.glassFillStrong,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: padded ? spacing.xl : 0,
    ...shadows.e3,
    // Glass shadow reads better tinted to the brand than pure black.
    shadowColor: colors.brandScale[900],
  };

  const entering = noEnter
    ? undefined
    : FadeInDown.springify().damping(18).mass(0.9).delay(enteringIndex * 80);

  return (
    <Animated.View entering={entering} style={[base, style as ViewStyle]}>
      {children}
    </Animated.View>
  );
};

export const glassStyles = StyleSheet.create({ fill: { flex: 1 } });
