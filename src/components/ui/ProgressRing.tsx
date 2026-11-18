import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import {
  ReduceMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../design/ThemeContext';

export interface ProgressRingProps {
  /** 0..1. Ignored when `segments` is set. */
  progress?: number;
  /** Outer diameter in px. Default 96. */
  size?: number;
  /** Default 8 */
  strokeWidth?: number;
  /** Arc color. Default theme brand teal. */
  color?: string;
  /** Track / unfilled color. Default theme surfaceAlt. */
  trackColor?: string;
  /**
   * Segmented mode (e.g. liveness step ring): number of equal segments
   * drawn around the circle. Combine with `filledSegments`.
   */
  segments?: number;
  /** How many segments are filled (0..segments). Default 0. */
  filledSegments?: number;
  /** Animate progress changes. Default true. */
  animated?: boolean;
  /** Centered content (e.g. a percentage label). */
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function ProgressRing({
  progress = 0,
  size = 96,
  strokeWidth = 8,
  color,
  trackColor,
  segments,
  filledSegments = 0,
  animated = true,
  children,
  style,
}: ProgressRingProps): React.JSX.Element {
  const { theme } = useTheme();
  const arcColor = color ?? theme.colors.brand;
  const baseColor = trackColor ?? theme.colors.surfaceAlt;

  const inset = strokeWidth / 2;
  const arcRect = useMemo(
    () => ({
      x: inset,
      y: inset,
      width: size - strokeWidth,
      height: size - strokeWidth,
    }),
    [inset, size, strokeWidth],
  );

  // Full circle path (used for the track and for the trimmed progress arc).
  const circlePath = useMemo(() => {
    const p = Skia.Path.Make();
    p.addArc(arcRect, -90, 359.98);
    return p;
  }, [arcRect]);

  // Animated trim end for progress mode.
  const end = useSharedValue(clamp01(progress));
  useEffect(() => {
    const target = clamp01(progress);
    if (animated) {
      end.value = withTiming(target, {
        duration: 600,
        reduceMotion: ReduceMotion.System,
      });
    } else {
      end.value = target;
    }
  }, [progress, animated, end]);

  // Segment paths for segmented mode.
  const segmentPaths = useMemo(() => {
    if (!segments || segments < 1) {
      return null;
    }
    const gap = segments > 1 ? Math.min(10, 90 / segments) : 0;
    const sweep = 360 / segments - gap;
    return Array.from({ length: segments }).map((_, i) => {
      const p = Skia.Path.Make();
      p.addArc(arcRect, -90 + (360 / segments) * i + gap / 2, sweep);
      return p;
    });
  }, [segments, arcRect]);

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Canvas style={{ width: size, height: size }}>
        {segmentPaths ? (
          segmentPaths.map((p, i) => (
            <Path
              key={i}
              path={p}
              style="stroke"
              strokeWidth={strokeWidth}
              strokeCap="round"
              color={i < filledSegments ? arcColor : baseColor}
            />
          ))
        ) : (
          <>
            <Path
              path={circlePath}
              style="stroke"
              strokeWidth={strokeWidth}
              color={baseColor}
            />
            <Path
              path={circlePath}
              style="stroke"
              strokeWidth={strokeWidth}
              strokeCap="round"
              color={arcColor}
              start={0}
              end={end}
            />
          </>
        )}
      </Canvas>
      {children ? <View style={styles.center}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
