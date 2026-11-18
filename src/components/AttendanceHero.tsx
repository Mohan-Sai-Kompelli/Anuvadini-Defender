import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Blur,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Rect,
  vec,
} from '@shopify/react-native-skia';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Clock, LogOut, MapPin } from 'lucide-react-native';

type Props = {
  greeting: string;
  name: string;
  org?: string;
  statusLabel: string;
  statusColor: string;
  statusTime?: string;
  locationLabel?: string;
  /** Solid tint for the location chip (e.g. red when outside range). */
  locationColor?: string;
  onLogout?: () => void;
};

// Warm, light orange gradient (orange → soft apricot) — white text stays readable.
const HERO_GRADIENT = ['#F97316', '#FB923C', '#FDBA74'];

/**
 * Skia background is isolated + memoized so the per-second clock tick never
 * re-runs the (relatively expensive) blurred gradient.
 */
const HeroBackdrop = React.memo(({ width, height }: { width: number; height: number }) => (
  <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
    <Rect x={0} y={0} width={width} height={height}>
      <LinearGradient start={vec(0, 0)} end={vec(width, height)} colors={HERO_GRADIENT} />
    </Rect>
    <Group>
      <Circle cx={width * 0.9} cy={height * 0.04} r={width * 0.42} color="rgba(255,255,255,0.22)">
        <Blur blur={40} />
      </Circle>
      <Circle cx={width * 0.04} cy={height} r={width * 0.34} color="rgba(255,237,213,0.45)">
        <Blur blur={48} />
      </Circle>
      <Circle cx={width * 0.5} cy={height * 0.5} r={width * 0.28} color="rgba(253,186,116,0.3)">
        <Blur blur={52} />
      </Circle>
    </Group>
  </Canvas>
));

/** Premium full-bleed gradient hero: live clock, glass status strip, glowing avatar. */
const AttendanceHeroImpl: React.FC<Props> = ({
  greeting,
  name,
  org,
  statusLabel,
  statusColor,
  statusTime,
  locationLabel,
  locationColor,
  onLogout,
}) => {
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

  const initials =
    (name || '?')
      .trim()
      .split(/\s+/)
      .map((s) => s[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';

  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.ease), reduceMotion: ReduceMotion.System }),
      -1,
      true,
    );
  }, [pulse]);
  const avatarAnim = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pulse.value * 0.06 }] }));

  return (
    <View
      onLayout={(e) =>
        setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
      }
      style={[styles.card, { paddingTop: insets.top + 14 }]}
    >
      <HeroBackdrop width={size.width} height={size.height} />

      {/* Identity row */}
      <View style={styles.topRow}>
        <View style={styles.avatarWrap}>
          <Animated.View style={[styles.avatar, avatarAnim]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </Animated.View>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        </View>

        <View style={{ flex: 1, marginLeft: 13 }}>
          <Text style={styles.greeting} numberOfLines={1}>
            {greeting}
          </Text>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {org ? (
            <Text style={styles.org} numberOfLines={1}>
              {org.replace(/\bAnuvadini\b(?!\s+Foundation)/gi, 'Anuvadini Foundation')}
            </Text>
          ) : null}
        </View>

        {onLogout ? (
          <Pressable onPress={onLogout} hitSlop={10} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Log out">
            <LogOut size={17} color="#1A1A1A" />
          </Pressable>
        ) : null}
      </View>

      {/* Glass status strip: time · attendance · location */}
      <View style={styles.panel}>
        <View style={[styles.segment, { flex: 1 }]}>
          <View style={styles.segHead}>
            <Clock size={13} color="rgba(0,0,0,0.62)" strokeWidth={2.4} />
            <Text style={styles.segValue} numberOfLines={1}>{timeStr}</Text>
          </View>
          <Text style={styles.segLabel} numberOfLines={1}>{dateStr}</Text>
        </View>

        <View style={styles.divider} />

        <View style={[styles.segment, { flex: 1.35 }]}>
          <View style={styles.segHead}>
            <View style={[styles.dot, { backgroundColor: statusColor }]} />
            <Text
              style={styles.segValue}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
            >
              {statusLabel}
            </Text>
          </View>
          <Text style={styles.segLabel} numberOfLines={1}>{statusTime ? statusTime : 'Today'}</Text>
        </View>

        {locationLabel ? (
          <>
            <View style={styles.divider} />
            <View style={[styles.segment, { flex: 1 }]}>
              <View style={styles.segHead}>
                <MapPin size={13} color={locationColor || 'rgba(0,0,0,0.62)'} strokeWidth={2.4} />
                <Text
                  style={styles.segValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                >
                  {locationLabel}
                </Text>
              </View>
              <Text style={styles.segLabel} numberOfLines={1}>Location</Text>
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
};

// Was the one exported component in this file NOT memoized (only its
// internal HeroBackdrop sub-component was) — every GPS tick re-rendering the
// parent AttendanceScreen re-rendered this too, even though its own props
// (greeting/name/org/status strings, onLogout) rarely change between ticks.
// It still re-renders on its own every second either way (the live clock
// above), but this stops the EXTRA re-render source from the parent.
export const AttendanceHero = React.memo(AttendanceHeroImpl);

export default AttendanceHero;

const styles = StyleSheet.create({
  card: {
    marginHorizontal: -16,
    marginTop: -16,
    paddingHorizontal: 18,
    paddingBottom: 18,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#C2410C',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.32,
    shadowRadius: 22,
    elevation: 10,
  },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  avatarWrap: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#1A1A1A', fontWeight: '800', fontSize: 17 },
  statusDot: {
    position: 'absolute',
    right: 1,
    bottom: 1,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    borderWidth: 2,
    borderColor: '#fff',
  },
  greeting: {
    color: 'rgba(0,0,0,0.6)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  name: { color: '#1A1A1A', fontSize: 21, fontWeight: '800', marginTop: 2, letterSpacing: 0.2 },
  org: { color: 'rgba(0,0,0,0.6)', fontSize: 11.5, marginTop: 1 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.34)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    borderRadius: 18,
    paddingVertical: 11,
    paddingHorizontal: 6,
  },
  segment: { paddingHorizontal: 6, justifyContent: 'center' },
  segHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  segValue: { color: '#1A1A1A', fontSize: 13.5, fontWeight: '800', flexShrink: 1, letterSpacing: -0.2 },
  segLabel: { color: 'rgba(0,0,0,0.58)', fontSize: 10.5, marginTop: 3, fontWeight: '500' },
  divider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: 'rgba(0,0,0,0.18)', marginVertical: 2 },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
});
