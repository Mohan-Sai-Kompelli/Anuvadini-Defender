import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Canvas, LinearGradient, RoundedRect, vec } from '@shopify/react-native-skia';
import type { LucideIcon } from 'lucide-react-native';
import { ChevronRight } from 'lucide-react-native';
import { useTheme } from '../../design/ThemeContext';
import { haptic } from '../../utils/haptics';

export interface QuickActionButtonProps {
  /** Lucide icon component preferred; legacy emoji strings still render. */
  icon: LucideIcon | string;
  label: string;
  subtitle?: string;
  onPress: () => void;
  color?: string;
}

const CHIP = 46;

/** Mix a hex colour toward white by `amt` (0..1) — yields the lighter gradient stop. */
function lighten(hex: string, amt: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  r = Math.round(r + (255 - r) * amt);
  g = Math.round(g + (255 - g) * amt);
  b = Math.round(b + (255 - b) * amt);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export const QuickActionButton: React.FC<QuickActionButtonProps> = ({
  icon,
  label,
  subtitle,
  onPress,
  color,
}) => {
  const { theme } = useTheme();
  const { colors, radii, spacing, typography, shadows } = theme;
  const tint = color ?? colors.brand;
  const grad = [lighten(tint, 0.24), tint];

  const renderIcon = () => (
    <View style={styles.iconChip}>
      <Canvas style={{ width: CHIP, height: CHIP }}>
        <RoundedRect x={0} y={0} width={CHIP} height={CHIP} r={CHIP / 2}>
          <LinearGradient start={vec(0, 0)} end={vec(CHIP, CHIP)} colors={grad} />
        </RoundedRect>
      </Canvas>
      <View style={styles.iconAbs}>
        {typeof icon === 'string' ? (
          <Text style={styles.emojiIcon}>{icon}</Text>
        ) : (
          React.createElement(icon, { size: 24, color: '#FFFFFF', strokeWidth: 2.3 })
        )}
      </View>
    </View>
  );

  return (
    <Pressable
      onPress={() => {
        haptic('impactLight');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${label}, ${subtitle}` : label}
      android_ripple={{ color: colors.brandSoft }}
      style={({ pressed }) => [
        styles.button,
        shadows.e2,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radii.lg,
          padding: spacing.lg,
          marginHorizontal: spacing.sm,
          marginBottom: spacing.lg,
          shadowColor: tint,
        },
        pressed && styles.pressed,
      ]}
    >
      {/* Tap affordance in the corner */}
      <View style={styles.chevron}>
        <ChevronRight size={16} color={colors.textMuted} />
      </View>
      {renderIcon()}
      <Text
        style={[typography.title, { color: colors.text, marginTop: spacing.md }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {subtitle ? (
        <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'flex-start',
    justifyContent: 'center',
    minHeight: 44,
    // Soft coloured glow from the action's tint (shadowColor set inline).
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  iconChip: {
    width: CHIP,
    height: CHIP,
  },
  iconAbs: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiIcon: {
    fontSize: 22,
    color: '#FFFFFF',
  },
  chevron: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
});
