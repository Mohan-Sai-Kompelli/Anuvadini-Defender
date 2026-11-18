import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../design/ThemeContext';
import { haptic } from '../../utils/haptics';

export interface AppHeaderProps {
  title: string;
  subtitle?: string;
  /** Shows a back chevron when provided. */
  onBack?: () => void;
  /** Brand logo. Defaults to true when there is no back button. */
  showLogo?: boolean;
  /** Optional right action icon (Lucide component). */
  rightIcon?: LucideIcon;
  onRightPress?: () => void;
  /** Required when rightIcon is set. */
  rightAccessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function AppHeader({
  title,
  subtitle,
  onBack,
  showLogo,
  rightIcon: RightIcon,
  onRightPress,
  rightAccessibilityLabel,
  style,
}: AppHeaderProps): React.JSX.Element {
  const { theme } = useTheme();
  const { colors, spacing, typography } = theme;
  const logoVisible = showLogo ?? !onBack;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
          paddingHorizontal: spacing.lg,
        },
        style,
      ]}
    >
      {onBack ? (
        <Pressable
          onPress={() => {
            haptic('impactLight');
            onBack();
          }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[styles.iconButton, { marginRight: spacing.sm }]}
        >
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
      ) : null}

      {logoVisible ? (
        <Image
          source={require('../../assets/nats.png')}
          style={[styles.logo, { marginRight: spacing.md }]}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      ) : null}

      <View style={styles.titles}>
        <Text
          style={[typography.h3, { color: colors.text }]}
          numberOfLines={1}
          accessibilityRole="header"
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[typography.caption, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {RightIcon && onRightPress ? (
        <Pressable
          onPress={() => {
            haptic('impactLight');
            onRightPress();
          }}
          accessibilityRole="button"
          accessibilityLabel={rightAccessibilityLabel ?? 'More options'}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.iconButton}
        >
          <RightIcon size={22} color={colors.brand} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 28,
    height: 28,
    borderRadius: 6,
  },
  titles: {
    flex: 1,
  },
});
