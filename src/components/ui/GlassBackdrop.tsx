import React from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import {
  Blur,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Rect,
  vec,
} from '@shopify/react-native-skia';
import { useTheme } from '../../design/ThemeContext';

export interface GlassBackdropProps {
  /** Gradient stops. Defaults to the theme's immersive brand gradient. */
  colors?: string[];
  /** 'brand' = rich teal gradient (login/headers); 'subtle' = tinted page bg. */
  variant?: 'brand' | 'subtle';
  /** Render the soft glow orbs that give the glass its depth. */
  glow?: boolean;
}

/**
 * Full-screen Skia gradient backdrop with soft, blurred color "orbs" — the
 * depth layer behind frosted-glass cards. Pure decoration (pointerEvents none),
 * absolutely filled, and built only on Skia (already a dependency) so it adds
 * the premium look with no new native modules.
 */
export const GlassBackdrop: React.FC<GlassBackdropProps> = ({
  colors,
  variant = 'brand',
  glow = true,
}) => {
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions();
  const stops =
    colors ??
    (variant === 'brand'
      ? theme.colors.gradientBrand
      : theme.colors.gradientSubtle);
  const [glowA, glowB] = theme.colors.glow;

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Rect x={0} y={0} width={width} height={height}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(width * 0.6, height)}
          colors={stops}
        />
      </Rect>
      {glow && (
        <Group>
          {/* warm orb, top-right */}
          <Circle cx={width * 0.92} cy={height * 0.08} r={width * 0.5} color={glowA}>
            <Blur blur={70} />
          </Circle>
          {/* cool orb, mid-left */}
          <Circle cx={width * 0.02} cy={height * 0.5} r={width * 0.45} color={glowB}>
            <Blur blur={80} />
          </Circle>
          {/* faint cool orb, bottom-right */}
          <Circle cx={width * 0.8} cy={height * 0.95} r={width * 0.4} color={glowB}>
            <Blur blur={90} />
          </Circle>
        </Group>
      )}
    </Canvas>
  );
};
