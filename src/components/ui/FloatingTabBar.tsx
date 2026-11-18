import React from 'react';
import { AccessibilityInfo, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useAuth } from '../../AuthContext';
import { useTabBarScrollY } from './tabBarScroll';

/**
 * WhatsApp-style LIGHT tab bar — a floating white capsule over the screen.
 *
 * Scroll-aware: scrolling DOWN past ~80px condenses it to a compact pill showing
 * only the active tab (the others fade + collapse their width). It re-expands on
 * scroll-up, when at the top, or on a tap — and a tap holds it open for ~3s of no
 * scrolling before it may collapse again. Respects "Reduce Motion".
 */
const PILL = '#FFE7CE'; // soft orange highlight behind the active icon
const ACTIVE = '#EA580C'; // filled active icon + label
const INACTIVE = '#6B7280'; // gray-500
const WHITE = '#FFFFFF';
const GREEN = '#16A34A'; // count badge

const ICON = 23;
const TAB_W = 76; // fixed per-tab width so non-active tabs can animate to 0
const COLLAPSE_AFTER = 80; // px scrolled down before collapsing
const AT_TOP = 10; // px below which we treat the screen as "at top"
const HOLD_MS = 3000; // keep expanded for ~3s of no scrolling after a tap

// [filled, outline] Ionicons per route. Profile is special (avatar).
const ICONS: Record<string, [string, string]> = {
  Attendance: ['home', 'home-outline'],
  UserDashboard: ['grid', 'grid-outline'],
  Request: ['document-text', 'document-text-outline'],
  Profile: ['person', 'person-outline'],
};

function ActiveIconPop({ children }: { children: React.ReactNode }) {
  const s = useSharedValue(0);
  React.useEffect(() => {
    s.value = 0;
    s.value = withSpring(1, { damping: 10, stiffness: 220, mass: 0.6 });
  }, [s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 0.86 + s.value * 0.14 }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

type TabItemProps = {
  progress: SharedValue<number>;
  isFocused: boolean;
  hidden: boolean;
  label: string;
  iconNode: React.ReactNode;
  badge: number | string | boolean | undefined;
  accessibilityLabel?: string;
  onPress: () => void;
  onLongPress: () => void;
};

function TabItem({
  progress,
  isFocused,
  hidden,
  label,
  iconNode,
  badge,
  accessibilityLabel,
  onPress,
  onLongPress,
}: TabItemProps) {
  // The active tab keeps full width; the rest animate width + opacity to 0 as
  // `progress` goes 0 (expanded) -> 1 (collapsed). overflow:hidden clips cleanly.
  const wrapStyle = useAnimatedStyle(() => {
    if (isFocused) return { width: TAB_W, opacity: 1 };
    return {
      width: interpolate(progress.value, [0, 1], [TAB_W, 0], Extrapolation.CLAMP),
      opacity: interpolate(progress.value, [0, 1], [1, 0], Extrapolation.CLAMP),
    };
  });

  return (
    <Animated.View
      style={[styles.tabWrap, wrapStyle]}
      pointerEvents={hidden ? 'none' : 'auto'}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        onLongPress={onLongPress}
        android_ripple={{ color: 'rgba(234,88,12,0.12)', borderless: true, radius: 34 }}
        style={styles.tab}
      >
        <View style={styles.iconRow}>
          <View style={[styles.pill, isFocused && styles.pillActive]}>
            {isFocused ? <ActiveIconPop>{iconNode}</ActiveIconPop> : iconNode}
          </View>

          {badge != null && badge !== false ? (
            <View style={styles.countBadge}>
              <Text style={styles.countText} numberOfLines={1}>
                {typeof badge === 'number' && badge > 99 ? '99+' : String(badge)}
              </Text>
            </View>
          ) : null}
        </View>

        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={[styles.label, { color: isFocused ? ACTIVE : INACTIVE, fontWeight: isFocused ? '800' : '600' }]}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const { user } = useAuth() as any;
  const scrollY = useTabBarScrollY();
  const avatarUri: string | undefined =
    user?.photo || user?.photoURL || user?.image || user?.avatar || undefined;

  // Tabs shown in the bar (computed from props; not a hook).
  const primary = state.routes.filter((r) => !descriptors[r.key].options.tabBarButton);
  // The bar is laid out LEFT-anchored; when expanded we slide it right by this
  // amount so it appears centered. As it collapses, the shift animates back to
  // 0 → the compact pill ends up on the left. (Deterministic width, no measure.)
  const expandedW = primary.length * TAB_W + 14; // tabs + bar padding(12) + border(2)
  const centerOffset = Math.max(0, (screenW - 24 - expandedW) / 2); // 24 = outer padding

  // 0 = expanded (all tabs), 1 = collapsed (active tab only).
  const progress = useSharedValue(0);
  const collapsedTarget = useSharedValue(0); // last requested target (avoids re-issuing withTiming each frame)
  const forceExpanded = useSharedValue(0); // 1 while a tap is holding it open
  const reduceMotion = useSharedValue(false);
  const holdTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [collapsed, setCollapsed] = React.useState(false);

  // Respect "Reduce Motion": animate with duration 0 (instant) when enabled.
  React.useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) reduceMotion.value = v;
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
      reduceMotion.value = v;
    });
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, [reduceMotion]);

  const bumpHold = React.useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      forceExpanded.value = 0;
    }, HOLD_MS);
  }, [forceExpanded]);

  // Drive collapse from the shared scroll offset, entirely on the UI thread.
  useAnimatedReaction(
    () => (scrollY ? scrollY.value : 0),
    (cur, prev) => {
      if (prev == null) return;
      let target = collapsedTarget.value;
      if (cur <= AT_TOP) {
        target = 0; // at top -> always expanded
      } else if (forceExpanded.value === 1) {
        target = 0; // tap-hold open; each scroll resets the 3s debounce
        runOnJS(bumpHold)();
      } else if (cur > prev + 2 && cur > COLLAPSE_AFTER) {
        target = 1; // scrolling down past threshold -> collapse
      } else if (cur < prev - 2) {
        target = 0; // scrolling up -> expand
      }
      if (target !== collapsedTarget.value) {
        collapsedTarget.value = target;
        progress.value = withTiming(target, { duration: reduceMotion.value ? 0 : 300 });
      }
    },
    [scrollY],
  );

  // Mirror collapsed state to JS for pointerEvents / accessibility toggling.
  useAnimatedReaction(
    () => progress.value > 0.5,
    (isCol, prev) => {
      if (isCol !== prev) runOnJS(setCollapsed)(isCol);
    },
  );

  // Switching tabs resets to expanded (and clears the previous screen's offset).
  const activeIndex = state.index;
  React.useEffect(() => {
    forceExpanded.value = 0;
    collapsedTarget.value = 0;
    if (holdTimer.current) clearTimeout(holdTimer.current);
    progress.value = withTiming(0, { duration: reduceMotion.value ? 0 : 300 });
    if (scrollY) scrollY.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  React.useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    },
    [],
  );

  const expandByTap = React.useCallback(() => {
    forceExpanded.value = 1;
    collapsedTarget.value = 0;
    progress.value = withTiming(0, { duration: reduceMotion.value ? 0 : 300 });
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      forceExpanded.value = 0;
    }, HOLD_MS);
  }, [collapsedTarget, forceExpanded, progress, reduceMotion]);

  // Centered when expanded, sliding to the left as it collapses.
  const barAnim = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [centerOffset, 0], Extrapolation.CLAMP) },
    ],
  }));

  // NOTE: all hooks above run unconditionally; only now may we bail on render.
  const focusedOptions = descriptors[state.routes[state.index].key].options;
  const focusedTabBarStyle = focusedOptions.tabBarStyle as { display?: string } | undefined;
  if (focusedTabBarStyle?.display === 'none') return null;

  const activeKey = state.routes[state.index].key;

  return (
    <View style={[styles.outer, { paddingBottom: Math.max(insets.bottom, 10) }]} pointerEvents="box-none">
      <Animated.View style={[styles.bar, barAnim]}>
        {primary.map((route) => {
          const { options } = descriptors[route.key];
          const isFocused = route.key === activeKey;
          const isProfile = route.name === 'Profile';
          const label = typeof options.title === 'string' ? options.title : route.name;
          const [filled, outline] = ICONS[route.name] || ['ellipse', 'ellipse-outline'];
          const badge = options.tabBarBadge; // number | string | undefined (real count)

          const onPress = () => {
            // A tap on the collapsed pill (the active tab) re-expands instead of
            // re-navigating to the route we're already on.
            if (collapsed && isFocused) {
              expandByTap();
              return;
            }
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name as never);
          };
          const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });

          const iconNode = isProfile ? (
            <View style={styles.avatarWrap}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Ionicons name={isFocused ? 'person' : 'person-outline'} size={16} color={isFocused ? ACTIVE : INACTIVE} />
                </View>
              )}
            </View>
          ) : (
            <Ionicons name={isFocused ? filled : outline} size={ICON} color={isFocused ? ACTIVE : INACTIVE} />
          );

          return (
            <TabItem
              key={route.key}
              progress={progress}
              isFocused={isFocused}
              hidden={collapsed && !isFocused}
              label={label}
              iconNode={iconNode}
              badge={badge}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          );
        })}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    alignItems: 'flex-start', // content-width pill anchored to the left (so it can condense)
    backgroundColor: 'transparent',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: WHITE,
    borderRadius: 30,
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(234, 88, 12, 0.45)',
    shadowColor: '#EA580C',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 12,
  },
  // Animated wrapper: width collapses to 0 for non-active tabs.
  tabWrap: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tab: {
    width: TAB_W,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconRow: {
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Always-present box so the active background is a clean horizontal pill.
  pill: {
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    width: 32,
    minWidth: 32,
    paddingHorizontal: 0,
    borderRadius: 16,
    backgroundColor: PILL,
  },
  avatarWrap: { alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 26, height: 26, borderRadius: 13 },
  avatarFallback: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10.5,
    marginTop: 2,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  countBadge: {
    position: 'absolute',
    top: -2,
    right: 12,
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: GREEN,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: WHITE,
  },
  countText: { color: WHITE, fontSize: 10.5, fontWeight: '800' },
});

export default FloatingTabBar;
