import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { Canvas, Circle, LinearGradient, vec } from '@shopify/react-native-skia';
import type { LucideIcon } from 'lucide-react-native';
import { BookOpen } from 'lucide-react-native';

const SIZE = 48;

/** Eased count-up for a number. */
const Count: React.FC<{ value: number }> = ({ value }) => {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = Date.now();
    const dur = 900;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / dur);
      setN(Math.round(value * (1 - Math.pow(1 - t, 3)))); // easeOutCubic
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <Text style={styles.value}>{n}</Text>;
};

const Chip: React.FC<{
  icon: LucideIcon;
  value: number;
  label: string;
  sub: string;
  grad: string[];
  delay: number;
  /** Optional completion bar (e.g. classes conducted / total). */
  progress?: { done: number; total: number };
}> = ({ icon: Icon, value, label, sub, grad, delay, progress }) => {
  const pct = progress && progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : null;
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(450).springify().reduceMotion(ReduceMotion.System)}
      style={[styles.chip, { shadowColor: grad[1] }]}
    >
      {/* Colored top accent matching the tile's gradient */}
      <View style={[styles.accent, { backgroundColor: grad[1] }]} />
      <View style={styles.iconWrap}>
        <Canvas style={{ width: SIZE, height: SIZE }}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2}>
            <LinearGradient start={vec(0, 0)} end={vec(SIZE, SIZE)} colors={grad} />
          </Circle>
        </Canvas>
        <View style={styles.iconAbs}>
          <Icon size={22} color="#FFFFFF" />
        </View>
      </View>
      <Count value={value} />
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.sub} numberOfLines={1}>
        {sub}
      </Text>
      {pct != null && (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${pct}%`, backgroundColor: grad[1] }]} />
        </View>
      )}
    </Animated.View>
  );
};

/**
 * Colourful, animated "what I've done today" dashboard for the Attendance
 * landing page — the app's real output: classes taught, not raw
 * check-in tallies.
 */
export const AttendanceStats: React.FC<{
  classes: number;
  classesDone: number;
}> = ({ classes, classesDone }) => (
  <View>
    <Text style={styles.sectionTitle}>Today's activity</Text>
    <View style={styles.row}>
      <Chip
        icon={BookOpen}
        value={classes}
        label="Classes"
        sub={classes > 0 ? `${classesDone} conducted` : 'none today'}
        grad={['#3BB38C', '#2C9E83']}
        delay={80}
        progress={{ done: classesDone, total: classes }}
      />
    </View>
  </View>
);

export default AttendanceStats;

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#9A3412',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 2,
  },
  row: { flexDirection: 'row', gap: 10 },
  chip: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingTop: 18,
    paddingBottom: 14,
    alignItems: 'center',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 4,
  },
  accent: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  iconWrap: { width: SIZE, height: SIZE, marginBottom: 8 },
  iconAbs: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: 24, fontWeight: '800', color: '#0F172A' },
  label: { fontSize: 12.5, fontWeight: '700', color: '#334155', marginTop: 2 },
  sub: { fontSize: 10.5, fontWeight: '600', color: '#94A3B8', marginTop: 1 },
  track: { marginTop: 8, width: '72%', height: 4, borderRadius: 2, backgroundColor: '#EEF2F6', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
});
