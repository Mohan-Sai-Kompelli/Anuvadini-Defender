/**
 * AttendanceHistoryList — recent attendance marks list for the hub.
 *
 * Presentational only: rows with Lucide LogIn/LogOut icons, date, weekday and
 * time, skeletons while loading and an EmptyState when there is no history.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { History, LogIn, LogOut } from 'lucide-react-native';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { SkeletonRow } from '../ui/Skeleton';
import { useTheme } from '../../design/ThemeContext';

export interface HistoryMark {
  id?: string;
  type: 'in' | 'out';
  timestamp: string;
  // Campus premises the mark was made at (Anuvadini / NETF / IUAC). Optional —
  // absent on WFH marks and on records written before branch tracking existed.
  markedOffice?: { name?: string | null } | null;
}

export interface AttendanceHistoryListProps {
  records: HistoryMark[];
  loading?: boolean;
  enteringIndex?: number;
}

function AttendanceHistoryListImpl({
  records,
  loading = false,
  enteringIndex,
}: AttendanceHistoryListProps): React.JSX.Element {
  const { theme } = useTheme();
  const { colors, spacing, typography, radii } = theme;

  return (
    <Card elevation={2} enteringIndex={enteringIndex}>
      <View style={[styles.titleRow, { marginBottom: spacing.lg }]}>
        <View style={[styles.headerIconBadge, { backgroundColor: '#6366F1' }]}>
          <History size={17} color="#FFFFFF" strokeWidth={2.3} />
        </View>
        <Text
          style={[typography.title, { color: colors.text, marginLeft: spacing.sm, flex: 1 }]}
          numberOfLines={1}
        >
          Recent History
        </Text>
      </View>

      {loading ? (
        <SkeletonRow lines={4} />
      ) : records.length === 0 ? (
        <EmptyState
          icon={History}
          title="No attendance records yet"
          message="Your check-ins and check-outs will show up here."
        />
      ) : (
        records.map((record, index) => {
          const isIn = record.type === 'in';
          const Icon = isIn ? LogIn : LogOut;
          const tint = isIn ? colors.success : colors.danger;
          const soft = isIn ? colors.successSoft : colors.dangerSoft;
          const date = new Date(record.timestamp);
          const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
          const timeStr = date.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });
          const rawBranch = record.markedOffice?.name || null;
          const branch = rawBranch ? rawBranch.replace(/\bAnuvadini\b(?!\s+Foundation)/gi, 'Anuvadini Foundation') : null;
          return (
            <Animated.View
              key={record.id ?? `${record.type}-${record.timestamp}-${index}`}
              entering={FadeInDown.duration(300)
                .delay(Math.min(index, 8) * 50)
                .reduceMotion(ReduceMotion.System)}
              style={[
                styles.row,
                {
                  paddingVertical: spacing.md,
                  borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                  borderTopColor: colors.border,
                },
              ]}
              accessibilityLabel={`${isIn ? 'Check in' : 'Check out'}, ${dayName} ${date.toLocaleDateString()} at ${timeStr}`}
            >
              <View
                style={[
                  styles.icon,
                  { backgroundColor: soft, borderRadius: radii.pill },
                ]}
              >
                <Icon size={16} color={tint} />
              </View>
              <View style={[styles.info, { marginLeft: spacing.md }]}>
                <Text style={[typography.bodyBold, { color: colors.text }]}>
                  {isIn ? 'Check In' : 'Check Out'}
                </Text>
                <Text style={[typography.caption, { color: colors.textMuted }]}>
                  {dayName} · {date.toLocaleDateString()}
                  {branch ? ` · ${branch}` : ''}
                </Text>
              </View>
              <Text style={[typography.small, { color: colors.textMuted }]}>
                {timeStr}
              </Text>
            </Animated.View>
          );
        })
      )}
    </Card>
  );
}

export const AttendanceHistoryList = React.memo(AttendanceHistoryListImpl);

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
  },
});
