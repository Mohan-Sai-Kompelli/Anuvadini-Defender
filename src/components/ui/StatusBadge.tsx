import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Ban,
  CircleCheck,
  CircleX,
  Clock,
  House,
  Info,
  Minus,
  PartyPopper,
  TriangleAlert,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../design/ThemeContext';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export type Status =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'no_response'
  | 'cancelled'
  | 'present'
  | 'absent'
  | 'holiday'
  | 'wfh'
  | 'success'
  | 'failed'
  | 'verified'
  | StatusTone;

export interface StatusBadgeProps {
  status: Status;
  label?: string;
  size?: 'small' | 'medium';
}

const STATUS_META: Record<Status, { tone: StatusTone; icon: LucideIcon }> = {
  pending: { tone: 'warning', icon: Clock },
  approved: { tone: 'success', icon: CircleCheck },
  rejected: { tone: 'danger', icon: CircleX },
  no_response: { tone: 'neutral', icon: TriangleAlert },
  cancelled: { tone: 'neutral', icon: Ban },
  present: { tone: 'success', icon: CircleCheck },
  absent: { tone: 'danger', icon: CircleX },
  holiday: { tone: 'info', icon: PartyPopper },
  wfh: { tone: 'info', icon: House },
  success: { tone: 'success', icon: CircleCheck },
  failed: { tone: 'danger', icon: CircleX },
  verified: { tone: 'success', icon: CircleCheck },
  warning: { tone: 'warning', icon: TriangleAlert },
  danger: { tone: 'danger', icon: TriangleAlert },
  info: { tone: 'info', icon: Info },
  neutral: { tone: 'neutral', icon: Minus },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  size = 'medium',
}) => {
  const { theme } = useTheme();
  const { colors, radii, spacing, typography } = theme;
  const meta = STATUS_META[status] ?? STATUS_META.neutral;
  const isSm = size === 'small';

  let fg: string;
  let bg: string;
  switch (meta.tone) {
    case 'success':
      fg = colors.success;
      bg = colors.successSoft;
      break;
    case 'warning':
      fg = colors.warning;
      bg = colors.warningSoft;
      break;
    case 'danger':
      fg = colors.danger;
      bg = colors.dangerSoft;
      break;
    case 'info':
      fg = colors.info;
      bg = colors.infoSoft;
      break;
    case 'neutral':
    default:
      fg = colors.textMuted;
      bg = colors.surfaceAlt;
      break;
  }

  const IconCmp = meta.icon;
  const text = label || status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: bg,
          borderRadius: radii.pill,
          paddingHorizontal: isSm ? spacing.sm : spacing.md,
          paddingVertical: isSm ? 3 : spacing.xs,
        },
      ]}
      accessibilityRole="text"
      accessibilityLabel={text}
    >
      <IconCmp size={isSm ? 11 : 13} color={fg} strokeWidth={2.5} />
      <Text
        style={[
          typography.label,
          styles.text,
          { color: fg, fontSize: isSm ? 10 : 11 },
        ]}
        numberOfLines={1}
      >
        {text}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  text: {
    marginLeft: 4,
  },
});
