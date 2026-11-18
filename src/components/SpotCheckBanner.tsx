import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ShieldAlert, ShieldCheck, ChevronRight, MapPin } from 'lucide-react-native';
import { apiService } from '../services/api';
import { spotCheckEvents } from '../services/spotCheckEvents';

/**
 * Top-of-attendance-screen indicator for spot-checks:
 *  • a pending check → a prominent "verify yourself now" banner (taps to open the
 *    mandatory face-verify flow), with a reminder to be inside campus range,
 *  • otherwise → a subtle card link into the "My Spot-Checks" history screen.
 */
const SpotCheckBannerImpl: React.FC<{ inRange?: boolean }> = ({ inRange }) => {
  const navigation = useNavigation<any>();
  const [pending, setPending] = useState<any | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await apiService.getPendingSpotChecks();
      const list: any[] = res.success ? res.data?.spotChecks || [] : [];
      setPending(list[0] || null);
    } catch {
      /* best-effort */
    }
  }, []);

  useEffect(() => {
    // Was: refresh() + an unconditional setInterval(refresh, 15000) — a flat
    // per-user poll running the whole time the Attendance tab is open,
    // regardless of whether anything changed. SpotCheckResponder (the
    // component that actually opens the mandatory verify modal) already
    // proves this data doesn't need constant polling to stay correct: it
    // only re-checks on mount, on a push-notification nudge
    // (spotCheckEvents), and when the app comes back to the foreground — a
    // spot-check round is issued server-side and pushed via FCM the moment
    // it exists, so polling every 15s added nothing except load. This
    // banner now follows the same three triggers instead of its own timer.
    refresh();
    const unsub = spotCheckEvents.subscribe(() => {
      refresh();
    });
    const appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') refresh();
    });
    return () => {
      unsub();
      appStateSub.remove();
    };
  }, [refresh]);

  if (pending) {
    const outOfRange = inRange === false;
    return (
      <Pressable
        onPress={() => spotCheckEvents.notify()}
        // A static `style` object gave this zero visual press feedback — no
        // ripple, no opacity change — so a tap felt completely unresponsive
        // even when the onPress was actually firing. android_ripple +
        // pressed-state opacity make it visibly react to touch; hitSlop
        // forgives a tap that lands just outside the rounded corners.
        android_ripple={{ color: 'rgba(255,255,255,0.25)' }}
        hitSlop={8}
        style={({ pressed }) => [
          styles.alert,
          outOfRange && styles.alertWarn,
          pressed && styles.alertPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Spot-check pending, verify yourself"
      >
        <View style={styles.iconWrap}>
          <ShieldAlert size={20} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.alertTitle}>Spot-check — verify yourself now</Text>
          <Text style={styles.alertSub}>
            {outOfRange
              ? 'Come inside the campus range, then tap to do a quick face check.'
              : 'Tap to complete a quick face check before the window closes.'}
          </Text>
        </View>
        {outOfRange ? <MapPin size={18} color="#fff" /> : <ChevronRight size={18} color="#fff" />}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => navigation.navigate('SpotChecks')}
      android_ripple={{ color: 'rgba(99,102,241,0.15)' }}
      hitSlop={8}
      style={({ pressed }) => [styles.cardLink, pressed && styles.cardLinkPressed]}
      accessibilityRole="button"
      accessibilityLabel="My Spot-Checks"
    >
      <View style={styles.cardLeft}>
        <View style={[styles.shieldIconWrap, { backgroundColor: '#6366F1' }]}>
          <ShieldCheck size={18} color="#FFFFFF" strokeWidth={2.3} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>My Spot-Checks</Text>
          <Text style={styles.cardSub}>View verification history & records</Text>
        </View>
      </View>
      <ChevronRight size={18} color="#94A3B8" />
    </Pressable>
  );
};

// Only the `inRange` prop (a boolean) actually changes this component's
// output — but AttendanceScreen re-renders it on every GPS tick regardless.
// Memoizing means it only actually re-renders when inRange flips or its own
// internal `pending` state changes (refresh()/events), not on every tick.
export const SpotCheckBanner = React.memo(SpotCheckBannerImpl);

export default SpotCheckBanner;

const styles = StyleSheet.create({
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#DC2626',
    borderRadius: 16,
    padding: 13,
    shadowColor: '#DC2626',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  alertWarn: { backgroundColor: '#D97706', shadowColor: '#D97706' },
  alertPressed: { opacity: 0.85 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTitle: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
  alertSub: { color: 'rgba(255,255,255,0.92)', fontSize: 12, marginTop: 2, lineHeight: 16 },
  cardLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#64748B',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  cardLinkPressed: { backgroundColor: '#F8FAFC' },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  shieldIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  cardSub: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 1,
  },
});
