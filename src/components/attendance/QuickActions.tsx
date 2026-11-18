import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Canvas,
  Circle,
  Group,
  LinearGradient,
  RoundedRect,
  rect,
  rrect,
  vec,
} from '@shopify/react-native-skia';
import Animated, {
  FadeInDown,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CalendarDays,
  FileText,
  GraduationCap,
  Sparkles,
  Wallet,
  Clock,
  type LucideIcon,
} from 'lucide-react-native';
import { useTheme } from '../../design/ThemeContext';
import { haptic } from '../../utils/haptics';

type Action = {
  route: string;
  label: string;
  icon: LucideIcon;
  /** [light stop, deep stop] — a vibrant cool-leaning gradient. */
  grad: [string, string];
};

const ACTIONS: Action[] = [
  { route: 'AttendanceDashboard', label: 'Reports', icon: BarChart3, grad: ['#818CF8', '#4338CA'] },
  { route: 'HolidayCalendar', label: 'Calendar', icon: CalendarDays, grad: ['#C084FC', '#7C3AED'] },
  { route: 'LeaveBalance', label: 'Leave Balance', icon: Wallet, grad: ['#F472B6', '#DB2777'] },
  { route: 'Schedule', label: 'Schedule', icon: CalendarClock, grad: ['#22D3EE', '#0891B2'] },
  { route: 'Request', label: 'Requests', icon: FileText, grad: ['#38BDF8', '#2563EB'] },
  { route: 'Teaching', label: 'Teaching', icon: GraduationCap, grad: ['#34D399', '#059669'] },
  { route: 'Regularization', label: 'Regularize', icon: Clock, grad: ['#FCA5A5', '#EF4444'] },
  { route: 'Memos', label: 'Warnings', icon: AlertTriangle, grad: ['#FDBA74', '#EA580C'] },
];

const TILE = 60;
const TILE_R = 19;
const PRESS_SPRING = { damping: 15, stiffness: 240, mass: 0.6 } as const;

/** A single gradient icon tile with a glossy highlight + spring press. */
const ActionTile: React.FC<{ action: Action; index: number; onPress: (r: string) => void }> = ({
  action,
  index,
  onPress,
}) => {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const clip = rrect(rect(0, 0, TILE, TILE), TILE_R, TILE_R);
  const Icon = action.icon;

  return (
    <Pressable
      onPress={() => {
        haptic('impactLight');
        onPress(action.route);
      }}
      onPressIn={() => {
        scale.value = withSpring(0.9, PRESS_SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, PRESS_SPRING);
      }}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      style={styles.cell}
    >
      <Animated.View
        entering={FadeInDown.duration(440)
          .delay(120 + index * 70)
          .springify()
          .damping(14)
          .reduceMotion(ReduceMotion.System)}
        style={styles.cellInner}
      >
        <Animated.View style={[styles.tileWrap, { shadowColor: action.grad[1] }, animStyle]}>
          <Canvas style={{ width: TILE, height: TILE }}>
            <Group clip={clip}>
              <RoundedRect x={0} y={0} width={TILE} height={TILE} r={TILE_R}>
                <LinearGradient start={vec(0, 0)} end={vec(TILE, TILE)} colors={action.grad} />
              </RoundedRect>
              {/* glossy top-left sheen */}
              <Circle cx={TILE * 0.28} cy={TILE * 0.2} r={TILE * 0.5} color="rgba(255,255,255,0.22)" />
            </Group>
          </Canvas>
          <View style={[StyleSheet.absoluteFill, styles.iconCenter]}>
            <Icon size={26} color="#FFFFFF" strokeWidth={2.2} />
          </View>
        </Animated.View>
        <Text style={[styles.label, { color: theme.colors.text }]} numberOfLines={1}>
          {action.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

export interface QuickActionsProps {
  onNavigate: (route: string) => void;
  enteringIndex?: number;
}

/** Premium shortcut grid — gradient icon tiles, staggered entrance, spring press. */
export const QuickActions: React.FC<QuickActionsProps> = ({ onNavigate, enteringIndex }) => {
  const { theme } = useTheme();
  const { colors, spacing, radii, shadows } = theme;

  const entering =
    enteringIndex != null
      ? FadeInDown.duration(300)
        .delay(enteringIndex * 50)
        .reduceMotion(ReduceMotion.System)
      : undefined;

  const chipClip = rrect(rect(0, 0, 32, 32), 11, 11);

  return (
    <Animated.View
      entering={entering}
      style={[
        styles.card,
        shadows.e2,
        { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerChip}>
          <Canvas style={{ width: 32, height: 32 }}>
            <Group clip={chipClip}>
              <RoundedRect x={0} y={0} width={32} height={32} r={11}>
                <LinearGradient start={vec(0, 0)} end={vec(32, 32)} colors={['#A855F7', '#6366F1']} />
              </RoundedRect>
            </Group>
          </Canvas>
          <View style={[StyleSheet.absoluteFill, styles.iconCenter]}>
            <Sparkles size={17} color="#FFFFFF" strokeWidth={2.3} />
          </View>
        </View>
        <View style={{ marginLeft: 10 }}>
          <Text style={[styles.title, { color: colors.text }]}>Quick Actions</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Access to anything in a tap</Text>
        </View>
      </View>

      {/* Grid */}
      <View style={styles.grid}>
        {ACTIONS.map((a, i) => (
          <ActionTile key={a.route + a.label} action={a} index={i} onPress={onNavigate} />
        ))}
      </View>
    </Animated.View>
  );
};

export default QuickActions;

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerChip: {
    width: 32,
    height: 32,
  },
  iconCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 11.5,
    marginTop: 1,
    fontWeight: '500',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 16,
  },
  cell: {
    width: '33.333%',
    alignItems: 'center',
  },
  cellInner: {
    alignItems: 'center',
  },
  tileWrap: {
    width: TILE,
    height: TILE,
    borderRadius: TILE_R,
    // soft coloured glow from the tile's deep stop
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.34,
    shadowRadius: 10,
    elevation: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 5,
    letterSpacing: 0.1,
  },
});
