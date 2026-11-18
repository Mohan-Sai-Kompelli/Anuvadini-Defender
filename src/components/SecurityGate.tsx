import React from 'react';
import {
  AppState,
  AppStateStatus,
  BackHandler,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  evaluateSecurity,
  reportBlockEvent,
  SecurityStatus,
} from '../services/securityService';

/**
 * SecurityGate — enterprise security enforcement wrapper (Feature 12).
 *
 * Wraps the ENTIRE app. Runs device-integrity checks before any child renders;
 * if any critical policy fails it shows a calm, full-screen day-mode security
 * screen instead of the app — blocking Login, Check-In, Check-Out and all
 * navigation. A 45-second countdown closes the app if the user doesn't clear
 * the issues; clearing them cancels it and lets the app run.
 *
 * Each detected issue shows a short "How to fix" note so a non-technical user
 * can resolve it. Fits ONE screen (no scroll) so both actions stay visible.
 */

const RUNTIME_POLL_MS = 4000;
const AUTO_EXIT_SECONDS = 45;

// ───────────────────────────────────────────────────────────────────────────
// KILL SWITCH — the security enforcement gate.
//
// While this is `false` the gate does nothing: no native checks run, no block
// screen, no 45s auto-close, no backend reporting — the app renders normally.
const SECURITY_GATE_ENABLED = false;
// ───────────────────────────────────────────────────────────────────────────

type Props = { children: React.ReactNode };

export const SecurityGate: React.FC<Props> = ({ children }) => {
  // Disabled for now — pass the app through untouched. This early return sits
  // before all hooks and depends only on a module constant, so the render path
  // is stable every render (no rules-of-hooks violation). Flip
  // SECURITY_GATE_ENABLED above to bring the gate back.
  if (!SECURITY_GATE_ENABLED) {
    return <>{children}</>;
  }

  const [status, setStatus] = React.useState<SecurityStatus | null>(null);
  const [checking, setChecking] = React.useState(true);
  const [remaining, setRemaining] = React.useState(AUTO_EXIT_SECONDS);
  const lastReportedRef = React.useRef<string>('');
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineRef = React.useRef<number | null>(null);
  const countdownRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const exitApp = React.useCallback(() => {
    if (Platform.OS === 'android') BackHandler.exitApp();
  }, []);

  const runCheck = React.useCallback(async (showSpinner = false) => {
    if (showSpinner) setChecking(true);
    try {
      const result = await evaluateSecurity();
      setStatus(result);
      if (result.blocked) {
        const signature = result.reasons.slice().sort().join(',');
        if (signature && signature !== lastReportedRef.current) {
          lastReportedRef.current = signature;
          reportBlockEvent(result);
        }
      } else {
        lastReportedRef.current = '';
      }
    } catch {
      setStatus({
        blocked: false,
        checksAvailable: false,
        riskScore: 0,
        issues: [],
        reasons: [],
        deviceId: 'unknown',
        deviceName: '',
        osVersion: String((Platform as any).Version ?? ''),
        raw: {},
      });
    } finally {
      if (showSpinner) setChecking(false);
    }
  }, []);

  React.useEffect(() => { runCheck(true); }, [runCheck]);

  React.useEffect(() => {
    const onAppState = (next: AppStateStatus) => { if (next === 'active') runCheck(false); };
    const sub = AppState.addEventListener('change', onAppState);
    pollRef.current = setInterval(() => {
      if (AppState.currentState === 'active') runCheck(false);
    }, RUNTIME_POLL_MS);
    return () => {
      sub.remove();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [runCheck]);

  React.useEffect(() => {
    const blocked = status?.blocked === true;
    if (blocked) {
      if (deadlineRef.current == null) {
        deadlineRef.current = Date.now() + AUTO_EXIT_SECONDS * 1000;
        setRemaining(AUTO_EXIT_SECONDS);
      }
      if (!countdownRef.current) {
        countdownRef.current = setInterval(() => {
          const left = Math.max(0, Math.ceil(((deadlineRef.current ?? 0) - Date.now()) / 1000));
          setRemaining(left);
          if (left <= 0) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            countdownRef.current = null;
            exitApp();
          }
        }, 1000);
      }
    } else {
      deadlineRef.current = null;
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      setRemaining(AUTO_EXIT_SECONDS);
    }
  }, [status?.blocked, exitApp]);

  React.useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

  if (checking && !status) {
    return <View style={styles.blank} />;
  }
  if (status?.blocked) {
    return (
      <SecurityScreen
        status={status}
        remaining={remaining}
        onCheckAgain={() => runCheck(true)}
        onExit={exitApp}
        rechecking={checking}
      />
    );
  }
  return <>{children}</>;
};

/* ═══════════════════════ security screen (day mode) ═══════════════════════ */

// Per-issue label, emoji, accent colour and a SHORT how-to-fix note.
const ISSUE_UI: Record<
  string,
  { title: string; emoji: string; tint: string; bg: string; fix: string }
> = {
  rootDetected: {
    title: 'Root access detected', emoji: '🔓', tint: '#DC2626', bg: '#FEF2F2',
    fix: 'Use a device that is not rooted.',
  },
  integrityFailed: {
    title: 'Device integrity failed', emoji: '🛰️', tint: '#B45309', bg: '#FFFBEB',
    fix: 'Reinstall the app from an authorised source.',
  },
  emulatorDetected: {
    title: 'Emulator detected', emoji: '🖥️', tint: '#7C3AED', bg: '#F5F3FF',
    fix: 'Open the app on a physical phone, not an emulator.',
  },
  hookingDetected: {
    title: 'Hooking framework detected', emoji: '🪝', tint: '#BE185D', bg: '#FDF2F8',
    fix: 'Remove Frida/Xposed and restart the app.',
  },
  appCloningDetected: {
    title: 'App cloning detected', emoji: '👥', tint: '#0E7490', bg: '#ECFEFF',
    fix: 'Open the original app, not a cloned copy.',
  },
  usbDebuggingEnabled: {
    title: 'USB Debugging is ON', emoji: '🔌', tint: '#EA580C', bg: '#FFF7ED',
    fix: 'Settings → Developer options → turn OFF “USB debugging”.',
  },
  adbEnabled: {
    title: 'ADB / Debugging is ON', emoji: '🧰', tint: '#B45309', bg: '#FFFBEB',
    fix: 'Settings → Developer options → turn OFF USB / wireless debugging.',
  },
  developerOptionsEnabled: {
    title: 'Developer Options is ON', emoji: '⚙️', tint: '#1D4ED8', bg: '#EFF6FF',
    fix: 'Settings → System → Developer options → turn it OFF.',
  },
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/* Gentle pulse ring behind the shield (calm, day-mode). */
const PulseShield: React.FC = () => {
  const p = useSharedValue(0);
  React.useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 2100, easing: Easing.out(Easing.ease) }), -1, false);
    return () => cancelAnimation(p);
  }, [p]);
  const ring = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(p.value, [0, 1], [0.85, 1.5]) }],
    opacity: interpolate(p.value, [0, 1], [0.4, 0]),
  }));
  return (
    <View style={styles.shieldWrap}>
      <Animated.View style={[styles.pulseRing, ring]} />
      <View style={styles.shieldBadge}>
        <Text style={styles.shieldGlyph}>🛡️</Text>
      </View>
    </View>
  );
};

const SecurityScreen: React.FC<{
  status: SecurityStatus;
  remaining: number;
  onCheckAgain: () => void;
  onExit: () => void;
  rechecking: boolean;
}> = ({ status, remaining, onCheckAgain, onExit, rechecking }) => {
  const insets = useSafeAreaInsets();
  const urgent = remaining <= 10;
  const pct = Math.max(0, Math.min(1, remaining / AUTO_EXIT_SECONDS));

  return (
    <View style={[styles.container, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 16 }]}>
      {/* Centered main block — balanced, no empty void */}
      <View style={styles.main}>
        <View style={styles.hero}>
          <PulseShield />
          <Text style={styles.title}>Security Check Required</Text>
          <Text style={styles.subtitle}>
            Your device doesn&apos;t meet the security requirements. Please fix the
            items below to continue.
          </Text>
        </View>

        {/* Countdown */}
        <View style={[styles.lockCard, urgent && styles.lockCardUrgent]}>
          <View style={styles.lockRow}>
            <Text style={[styles.lockLabel, urgent && styles.lockLabelUrgent]}>App will close in</Text>
            <Text style={[styles.lockTimer, urgent && styles.lockTimerUrgent]}>00:{pad2(remaining)}</Text>
          </View>
          <View style={styles.lockBarTrack}>
            <View style={[styles.lockBarFill, { width: `${pct * 100}%`, backgroundColor: urgent ? '#DC2626' : '#F59E0B' }]} />
          </View>
        </View>

        {/* Detected issues + how to fix */}
        <Text style={styles.sectionLabel}>ISSUES TO RESOLVE</Text>
        <View style={styles.issuesWrap}>
          {status.issues.map((issue) => {
            const ui = ISSUE_UI[issue.key] || {
              title: issue.label, emoji: '⚠️', tint: '#DC2626', bg: '#FEF2F2', fix: issue.message,
            };
            return (
              <View key={issue.key} style={styles.issueCard}>
                <View style={[styles.issueIcon, { backgroundColor: ui.bg }]}>
                  <Text style={styles.issueEmoji}>{ui.emoji}</Text>
                </View>
                <View style={styles.issueText}>
                  <Text style={[styles.issueTitle, { color: ui.tint }]} numberOfLines={1}>{ui.title}</Text>
                  <Text style={styles.issueFix} numberOfLines={2}>
                    <Text style={styles.fixLabel}>Fix: </Text>{ui.fix}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Actions — pinned bottom, always visible */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, rechecking && styles.btnDisabled]}
          onPress={onCheckAgain}
          disabled={rechecking}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Check again"
        >
          <Text style={styles.btnPrimaryText}>{rechecking ? 'Checking…' : 'Check Again'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnGhost]}
          onPress={onExit}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Exit application"
        >
          <Text style={styles.btnGhostText}>Exit Application</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  blank: { flex: 1, backgroundColor: '#F4F7FC' },
  container: { flex: 1, backgroundColor: '#F4F7FC', paddingHorizontal: 22 },

  main: { flex: 1, justifyContent: 'center' },

  hero: { alignItems: 'center' },
  shieldWrap: { width: 104, height: 104, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  pulseRing: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  shieldBadge: {
    width: 84,
    height: 84,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F59E0B',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  shieldGlyph: { fontSize: 40 },
  title: { color: '#0F172A', fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  subtitle: { color: '#64748B', fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 8 },

  lockCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    padding: 15,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginTop: 22,
  },
  lockCardUrgent: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  lockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  lockLabel: { color: '#B45309', fontSize: 13.5, fontWeight: '700' },
  lockLabelUrgent: { color: '#DC2626' },
  lockTimer: { color: '#B45309', fontSize: 26, fontWeight: '900', fontVariant: ['tabular-nums'] },
  lockTimerUrgent: { color: '#DC2626' },
  lockBarTrack: { height: 6, borderRadius: 3, backgroundColor: '#FEF3C7', overflow: 'hidden' },
  lockBarFill: { height: 6, borderRadius: 3 },

  sectionLabel: { color: '#94A3B8', fontSize: 11.5, fontWeight: '800', letterSpacing: 1.2, marginTop: 20, marginBottom: 10, marginLeft: 2 },
  issuesWrap: {},
  issueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8EDF3',
    padding: 12,
    marginBottom: 10,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  issueIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  issueEmoji: { fontSize: 22 },
  issueText: { flex: 1 },
  issueTitle: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  issueFix: { color: '#64748B', fontSize: 12.5, lineHeight: 17 },
  fixLabel: { color: '#0F172A', fontWeight: '800' },

  actions: { marginTop: 10 },
  btn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 11 },
  btnPrimary: {
    backgroundColor: '#2563EB',
    shadowColor: '#2563EB',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  btnPrimaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  btnDisabled: { opacity: 0.6 },
  btnGhost: { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E2E8F0', marginBottom: 0 },
  btnGhostText: { color: '#DC2626', fontSize: 15, fontWeight: '800' },
});
