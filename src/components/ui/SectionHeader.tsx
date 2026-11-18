import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../design/ThemeContext';

export interface SectionHeaderProps {
  title: string;
  /** Lucide icon component preferred; legacy emoji strings still render. */
  icon?: LucideIcon | string;
  actionLabel?: string;
  onActionPress?: () => void;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  icon,
  actionLabel,
  onActionPress,
}) => {
  const { theme } = useTheme();
  const { colors, spacing, typography } = theme;

  const renderIcon = () => {
    if (!icon) {
      return null;
    }
    if (typeof icon === 'string') {
      return (
        <Text style={[styles.emojiIcon, { marginRight: spacing.sm }]}>{icon}</Text>
      );
    }
    const IconCmp = icon;
    return (
      <View style={{ marginRight: spacing.sm }}>
        <IconCmp size={20} color={colors.brand} strokeWidth={2} />
      </View>
    );
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          marginBottom: spacing.sm,
        },
      ]}
    >
      <View style={styles.titleContainer}>
        {renderIcon()}
        <Text
          style={[typography.h3, { color: colors.text }]}
          accessibilityRole="header"
        >
          {title}
        </Text>
      </View>

      {actionLabel && onActionPress ? (
        <Pressable
          onPress={onActionPress}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={[typography.bodyBold, { color: colors.brand }]}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  emojiIcon: {
    fontSize: 20,
  },
});
