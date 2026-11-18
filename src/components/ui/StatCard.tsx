import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../design/ThemeContext';
import { haptic } from '../../utils/haptics';

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  /** Lucide icon component preferred; legacy emoji strings still render. */
  icon?: LucideIcon | string;
  accentColor?: string;
  onPress?: () => void;
  /** Staggered FadeInDown entrance (pass the list index). */
  enteringIndex?: number;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  accentColor,
  onPress,
  enteringIndex,
}) => {
  const { theme } = useTheme();
  const { colors, radii, spacing, typography, shadows } = theme;
  const accent = accentColor ?? colors.brand;

  const entering =
    enteringIndex != null
      ? FadeInDown.duration(300)
          .delay(enteringIndex * 50)
          .reduceMotion(ReduceMotion.System)
      : undefined;

  const renderIcon = () => {
    if (!icon) {
      return null;
    }
    if (typeof icon === 'string') {
      return (
        <View
          style={[
            styles.iconChip,
            { backgroundColor: accent + '1A', borderRadius: radii.md, marginBottom: spacing.md },
          ]}
        >
          <Text style={styles.emojiIcon}>{icon}</Text>
        </View>
      );
    }
    const IconCmp = icon;
    return (
      <View
        style={[
          styles.iconChip,
          { backgroundColor: accent + '1A', borderRadius: radii.md, marginBottom: spacing.md },
        ]}
      >
        <IconCmp size={22} color={accent} strokeWidth={2.2} />
      </View>
    );
  };

  const inner = (
    <View style={[styles.content, { padding: spacing.lg }]}>
      {renderIcon()}
      <Text style={[styles.value, { color: colors.text }]}>{value}</Text>
      <Text
        style={[
          typography.label,
          { color: colors.textMuted, marginTop: spacing.xs },
        ]}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );

  const cardStyle = [
    styles.card,
    shadows.e2,
    {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderColor: colors.border,
      marginBottom: spacing.lg,
      shadowColor: colors.brandScale[900],
    },
  ];

  if (onPress) {
    return (
      <Animated.View entering={entering} style={cardStyle}>
        <Pressable
          onPress={() => {
            haptic('impactLight');
            onPress();
          }}
          accessibilityRole="button"
          accessibilityLabel={`${title}: ${value}${subtitle ? `, ${subtitle}` : ''}`}
          android_ripple={{ color: colors.brandSoft }}
          style={({ pressed }) => [pressed && styles.pressed]}
        >
          {inner}
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={entering} style={cardStyle}>
      {inner}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.92,
  },
  content: {
    flex: 1,
  },
  iconChip: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  emojiIcon: {
    fontSize: 22,
  },
});
