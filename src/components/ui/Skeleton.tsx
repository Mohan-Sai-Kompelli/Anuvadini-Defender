import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../design/ThemeContext';

export interface SkeletonProps {
  /** Default '100%' */
  width?: DimensionValue;
  /** Default 16 */
  height?: number;
  /** Border radius. Default theme.radii.sm (8). */
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({
  width = '100%',
  height = 16,
  radius,
  style,
}: SkeletonProps): React.JSX.Element {
  const { theme } = useTheme();
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.45, { duration: 800, reduceMotion: ReduceMotion.System }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      importantForAccessibility="no"
      accessibilityElementsHidden
      style={[
        {
          width,
          height,
          borderRadius: radius ?? theme.radii.sm,
          backgroundColor: theme.colors.surfaceAlt,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

export interface SkeletonRowProps {
  /** Number of text lines. Default 2. */
  lines?: number;
  /** Width of the last line. Default '60%'. */
  lastLineWidth?: DimensionValue;
  /** Gap between lines. Default 8. */
  gap?: number;
  style?: StyleProp<ViewStyle>;
}

export function SkeletonRow({
  lines = 2,
  lastLineWidth = '60%',
  gap = 8,
  style,
}: SkeletonRowProps): React.JSX.Element {
  return (
    <View style={style}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={14}
          width={i === lines - 1 ? lastLineWidth : '100%'}
          style={i > 0 ? { marginTop: gap } : undefined}
        />
      ))}
    </View>
  );
}

export interface SkeletonCardProps {
  /** Default 3 text lines under the header row */
  lines?: number;
  style?: StyleProp<ViewStyle>;
}

export function SkeletonCard({
  lines = 3,
  style,
}: SkeletonCardProps): React.JSX.Element {
  const { theme } = useTheme();
  const { colors, radii, spacing } = theme;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderRadius: radii.lg,
          borderColor: colors.border,
          padding: spacing.lg,
        },
        style,
      ]}
    >
      <View style={styles.headerRow}>
        <Skeleton width={40} height={40} radius={20} />
        <View style={[styles.headerText, { marginLeft: spacing.md }]}>
          <Skeleton height={14} width="70%" />
          <Skeleton height={12} width="40%" style={{ marginTop: 6 }} />
        </View>
      </View>
      <SkeletonRow lines={lines} style={{ marginTop: spacing.lg }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
});
