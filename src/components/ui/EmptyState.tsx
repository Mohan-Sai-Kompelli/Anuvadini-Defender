import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { Inbox } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../design/ThemeContext';
import { Button } from './Button';

export interface EmptyStateProps {
  /** Lucide icon component. Default Inbox. */
  icon?: LucideIcon;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
  /** 'danger' switches the icon/title to red — e.g. offline/error states that
   * need to read as more urgent than the default neutral empty-state. */
  tone?: 'default' | 'danger';
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  message,
  actionLabel,
  onAction,
  style,
  tone = 'default',
}: EmptyStateProps): React.JSX.Element {
  const { theme } = useTheme();
  const { colors, spacing, typography } = theme;
  const isDanger = tone === 'danger';
  const iconColor = isDanger ? colors.danger : colors.brand;
  const iconBg = isDanger ? colors.dangerSoft ?? 'rgba(220,38,38,0.10)' : colors.brandSoft;
  const titleColor = isDanger ? colors.danger : colors.text;

  return (
    <Animated.View
      entering={FadeInDown.duration(300).reduceMotion(ReduceMotion.System)}
      style={[styles.container, { padding: spacing.xxl }, style]}
    >
      <View
        style={[
          styles.iconCircle,
          { backgroundColor: iconBg, marginBottom: spacing.lg },
        ]}
      >
        <Icon size={32} color={iconColor} strokeWidth={1.75} />
      </View>
      <Text style={[typography.h3, styles.center, { color: titleColor }]}>
        {title}
      </Text>
      {message ? (
        <Text
          style={[
            typography.body,
            styles.center,
            { color: colors.textMuted, marginTop: spacing.sm },
          ]}
        >
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          title={actionLabel}
          onPress={onAction}
          variant="primary"
          size="md"
          style={{ marginTop: spacing.xl }}
        />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    textAlign: 'center',
  },
});
