import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { useTheme } from '../../design/ThemeContext';
import { haptic } from '../../utils/haptics';

export interface CardProps {
  children: React.ReactNode;
  /** Shadow preset: 0 = flat, 1..4 = theme.shadows.e1..e4. Default 1. */
  elevation?: 0 | 1 | 2 | 3 | 4;
  /** Inner padding in px. Default theme.spacing.lg (16). */
  padding?: number;
  onPress?: () => void;
  /**
   * When set, the card animates in with FadeInDown staggered by
   * enteringIndex * 50ms (use the list index).
   */
  enteringIndex?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Card({
  children,
  elevation = 1,
  padding,
  onPress,
  enteringIndex,
  style,
  accessibilityLabel,
  testID,
}: CardProps): React.JSX.Element {
  const { theme } = useTheme();
  const { colors, radii, spacing, shadows } = theme;

  const shadow =
    elevation === 0
      ? null
      : [shadows.e1, shadows.e2, shadows.e3, shadows.e4][elevation - 1];

  const entering =
    enteringIndex != null
      ? FadeInDown.duration(300)
          .delay(enteringIndex * 50)
          .reduceMotion(ReduceMotion.System)
      : undefined;

  const baseStyle = StyleSheet.flatten([
    styles.base,
    {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderColor: colors.border,
      padding: padding ?? spacing.lg,
    },
    shadow,
    style,
  ]);

  if (onPress) {
    const containerStyle = StyleSheet.flatten([
      styles.base,
      {
        backgroundColor: colors.surface,
        borderRadius: radii.lg,
        borderColor: colors.border,
      },
      shadow,
      style,
    ]);

    return (
      <Animated.View entering={entering} style={containerStyle}>
        <Pressable
          onPress={() => {
            haptic('impactLight');
            onPress();
          }}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          android_ripple={{ color: colors.brandSoft }}
          testID={testID}
          style={({ pressed }) => [
            {
              padding: padding ?? spacing.lg,
              borderRadius: radii.lg,
            },
            pressed ? styles.pressed : null
          ]}
        >
          {children}
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      entering={entering}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={baseStyle}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'visible',
  },
  pressed: {
    opacity: 0.92,
  },
});
