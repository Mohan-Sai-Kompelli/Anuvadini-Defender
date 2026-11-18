/**
 * CheckInOutButtons — the attendance hub CTA block.
 *
 * One dominant primary CTA for the *next* action (check-in until checked in,
 * check-out afterwards). The other action is de-emphasized. Shows a short
 * "success moment" animation (and success haptic) when a check-in/check-out
 * lands.
 *
 * Behavior contract:
 *   - Check In is actionable only while `hasInTime` is false, and only ONCE
 *     per day — once checked in, Check In never reappears that day.
 *   - Check Out is actionable any time `hasInTime` is true, including AFTER
 *     an earlier checkout — multiple check-outs per day are allowed (the
 *     latest one is treated as the day's final checkout time). It is never
 *     permanently hidden just because `hasOutTime` is already true.
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOut, ReduceMotion, ZoomIn } from 'react-native-reanimated';
import { CheckSquare, CircleCheck, LogIn, LogOut } from 'lucide-react-native';
import { Button } from '../ui/Button';
import { GradientButton } from '../ui/GradientButton';
import { Card } from '../ui/Card';
import { useTheme } from '../../design/ThemeContext';
import { haptic } from '../../utils/haptics';

export interface CheckInOutButtonsProps {
  hasInTime: boolean;
  hasOutTime: boolean;
  /** Formatted check-in time, e.g. "9:02:11 AM". */
  checkInTime?: string;
  /** Formatted last check-out time. */
  checkOutTime?: string;
  loading?: boolean;
  onCheckIn: () => void;
  onCheckOut: () => void;
  enteringIndex?: number;
}

function CheckInOutButtonsImpl({
  hasInTime,
  hasOutTime,
  checkInTime,
  checkOutTime,
  loading = false,
  onCheckIn,
  onCheckOut,
  enteringIndex,
}: CheckInOutButtonsProps): React.JSX.Element {
  const { theme } = useTheme();
  const { colors, spacing, typography, radii } = theme;

  // --- success moment -------------------------------------------------------
  const prevIn = useRef(hasInTime);
  const prevOut = useRef(hasOutTime);
  const [celebrate, setCelebrate] = useState<'in' | 'out' | null>(null);

  useEffect(() => {
    let kind: 'in' | 'out' | null = null;
    if (!prevIn.current && hasInTime) {
      kind = 'in';
    } else if (!prevOut.current && hasOutTime) {
      kind = 'out';
    }
    prevIn.current = hasInTime;
    prevOut.current = hasOutTime;

    if (kind) {
      haptic('success');
      setCelebrate(kind);
      const timer = setTimeout(() => setCelebrate(null), 2200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [hasInTime, hasOutTime]);

  const nextIsCheckIn = !hasInTime;

  return (
    <Card elevation={2} enteringIndex={enteringIndex}>
      <View style={[styles.titleRow, { marginBottom: spacing.lg }]}>
        <View style={[styles.headerIconBadge, { backgroundColor: '#16A34A' }]}>
          <CheckSquare size={17} color="#FFFFFF" strokeWidth={2.3} />
        </View>
        <Text
          style={[typography.title, { color: colors.text, marginLeft: spacing.sm, flex: 1 }]}
          numberOfLines={1}
        >
          Mark Attendance
        </Text>
      </View>

      {celebrate && (
        <Animated.View
          entering={ZoomIn.duration(300).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(250).reduceMotion(ReduceMotion.System)}
          style={[
            styles.successMoment,
            {
              backgroundColor: colors.successSoft,
              borderRadius: radii.md,
              padding: spacing.md,
              marginBottom: spacing.md,
            },
          ]}
          accessibilityLiveRegion="polite"
        >
          <CircleCheck size={20} color={colors.success} />
          <Text
            style={[
              typography.bodyBold,
              { color: colors.success, marginLeft: spacing.sm },
            ]}
          >
            {celebrate === 'in' ? 'Checked in — have a great day!' : 'Checked out — see you tomorrow!'}
          </Text>
        </Animated.View>
      )}

      {/* Dominant primary CTA — green to check in, warm to check out */}
      {nextIsCheckIn ? (
        <GradientButton
          title="Check In"
          onPress={() => {
            if (!hasInTime) onCheckIn();
          }}
          colors={['#34D399', '#10B981', '#059669']}
          icon={LogIn}
          loading={loading}
          height={56}
        />
      ) : (
        <GradientButton
          title={hasOutTime ? 'Check Out Again' : 'Check Out'}
          onPress={() => {
            if (hasInTime) onCheckOut();
          }}
          colors={['#FB923C', '#F97316', '#EA580C']}
          icon={LogOut}
          loading={loading}
          height={56}
        />
      )}

      {/* De-emphasized secondary state */}
      <View style={{ marginTop: spacing.md }}>
        {nextIsCheckIn ? (
          <Button
            title="Check Out"
            onPress={() => {
              if (hasInTime) {
                onCheckOut();
              }
            }}
            variant="ghost"
            size="md"
            icon={LogOut}
            fullWidth
            disabled
            accessibilityLabel="Check out, unavailable until you check in"
            testID="attendance-check-out-disabled"
          />
        ) : (
          <View
            style={[
              styles.doneChip,
              {
                backgroundColor: colors.successSoft,
                borderRadius: radii.pill,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.lg,
              },
            ]}
            accessibilityRole="text"
            accessibilityLabel={`Checked in${checkInTime ? ` at ${checkInTime}` : ' today'}${checkOutTime ? `, last checked out at ${checkOutTime}` : ''}`}
          >
            <CircleCheck size={16} color={colors.success} />
            <Text
              style={[
                typography.small,
                { color: colors.success, marginLeft: spacing.sm },
              ]}
            >
              Checked In {checkInTime ? `at ${checkInTime}` : 'today'}
              {checkOutTime ? ` · last out ${checkOutTime}` : ''}
            </Text>
          </View>
        )}
      </View>
    </Card>
  );
}

// AttendanceScreen re-renders this on every GPS tick even though
// hasInTime/hasOutTime/checkInTime/etc. only change on an actual mark.
export const CheckInOutButtons = React.memo(CheckInOutButtonsImpl);

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
  successMoment: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  doneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
  },
});
