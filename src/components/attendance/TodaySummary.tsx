/**
 * TodaySummary — today's attendance marks as a mini timeline.
 *
 * Presentational only: receives today's records (already filtered by the
 * screen) and renders check-in/check-out chips + a timeline with Lucide
 * LogIn/LogOut icons and StatusBadge.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  LinearTransition,
  ReduceMotion,
} from 'react-native-reanimated';
import { CalendarClock, LogIn, LogOut } from 'lucide-react-native';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { SkeletonRow } from '../ui/Skeleton';
import { StatusBadge } from '../ui/StatusBadge';
import { useTheme } from '../../design/ThemeContext';

/** Minimal structural type — `Attendance` from services/api satisfies it. */
export interface TodayMark {
  id?: string;
  type: 'in' | 'out';
  timestamp: string;
}

export interface TodaySummaryProps {
  records: TodayMark[];
  loading?: boolean;
  enteringIndex?: number;
}

function TodaySummaryImpl({
  records,
  loading = false,
  enteringIndex,
}: TodaySummaryProps): React.JSX.Element {
  const { theme } = useTheme();
  const { colors, spacing, typography, radii } = theme;

  const hasInTime = records.some(record => record.type === 'in');
  const hasOutTime = records.some(record => record.type === 'out');

  const sorted = [...records].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const checkOutBadge: { status: 'success' | 'pending' | 'neutral'; label: string } =
    hasOutTime
      ? { status: 'success', label: 'Done' }
      : hasInTime
        ? { status: 'pending', label: 'Pending' }
        : { status: 'neutral', label: 'Waiting' };

  return (
    <Card elevation={2} enteringIndex={enteringIndex}>
      {/* Title row */}
      <View style={[styles.titleRow, { marginBottom: spacing.lg }]}>
        <View style={[styles.headerIconBadge, { backgroundColor: '#8B5CF6' }]}>
          <CalendarClock size={17} color="#FFFFFF" strokeWidth={2.3} />
        </View>
        <Text
          style={[typography.title, { color: colors.text, marginLeft: spacing.sm, flex: 1 }]}
          numberOfLines={1}
        >
          Today's Summary
        </Text>
      </View>

      {/* Check-in / check-out state chips */}
      <View
        style={styles.statsRow}
        accessibilityLiveRegion="polite"
        accessibilityLabel={`Check in ${hasInTime ? 'done' : 'pending'}. Check out ${
          hasOutTime ? 'done' : hasInTime ? 'pending' : 'waiting'
        }.`}
      >
        <View style={styles.statItem}>
          <Text style={[typography.label, { color: colors.textMuted, marginBottom: spacing.xs, textAlign: 'center' }]}>
            Check In
          </Text>
          <View style={styles.badgeWrap}>
            <StatusBadge
              status={hasInTime ? 'success' : 'pending'}
              label={hasInTime ? 'Done' : 'Pending'}
            />
          </View>
        </View>
        <View style={styles.statItem}>
          <Text style={[typography.label, { color: colors.textMuted, marginBottom: spacing.xs, textAlign: 'center' }]}>
            Check Out
          </Text>
          <View style={styles.badgeWrap}>
            <StatusBadge status={checkOutBadge.status} label={checkOutBadge.label} />
          </View>
        </View>
      </View>

      {/* Marks timeline */}
      <View style={{ marginTop: spacing.lg }}>
        {loading ? (
          <SkeletonRow lines={2} />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No marks yet today"
            message="Your check-in and check-out will appear here."
          />
        ) : (
          <Animated.View layout={LinearTransition.reduceMotion(ReduceMotion.System)}>
            {sorted.map((record, index) => {
              const isIn = record.type === 'in';
              const Icon = isIn ? LogIn : LogOut;
              const tint = isIn ? colors.success : colors.danger;
              const soft = isIn ? colors.successSoft : colors.dangerSoft;
              const time = new Date(record.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });
              return (
                <Animated.View
                  key={record.id ?? `${record.type}-${record.timestamp}`}
                  entering={FadeInDown.duration(300)
                    .delay(index * 50)
                    .reduceMotion(ReduceMotion.System)}
                  style={[
                    styles.markRow,
                    {
                      paddingVertical: spacing.sm,
                      borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                      borderTopColor: colors.border,
                    },
                  ]}
                  accessibilityLabel={`${isIn ? 'Checked In' : 'Checked Out'} at ${time}`}
                >
                  <View
                    style={[
                      styles.markIcon,
                      { backgroundColor: soft, borderRadius: radii.pill },
                    ]}
                  >
                    <Icon size={16} color={tint} />
                  </View>
                  <Text
                    style={[
                      typography.body,
                      { color: colors.text, flex: 1, marginLeft: spacing.md },
                    ]}
                  >
                    {isIn ? 'Checked In' : 'Checked Out'}
                  </Text>
                  <Text
                    style={[
                      typography.small,
                      { color: colors.textMuted, width: 75, textAlign: 'right', marginRight: spacing.md },
                    ]}
                  >
                    {time}
                  </Text>
                  <StatusBadge
                    status={isIn ? 'success' : 'danger'}
                    label={isIn ? 'In' : 'Out'}
                    size="small"
                  />
                </Animated.View>
              );
            })}
          </Animated.View>
        )}
      </View>
    </Card>
  );
}

export const TodaySummary = React.memo(TodaySummaryImpl);

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
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  markIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
