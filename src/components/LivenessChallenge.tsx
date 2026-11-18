import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  ReduceMotion,
  ZoomIn,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronsDown,
  CircleCheck,
  CircleX,
  Eye,
  ScanFace,
  ShieldCheck,
  Smile,
  TriangleAlert,
  WifiOff,
  X,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraStream } from '../CameraStream';
import { apiService } from '../services/api';
import { Button, EmptyState, Skeleton, useTheme } from './ui';
import { haptic } from '../utils/haptics';
import { showToast } from '../utils/toast';
import { speak, stopSpeaking } from '../utils/speech';
import { isNetworkError } from '../services/offlineAttendance';

// Distinct marker (not just display text) so the render layer can style this
// case — a red "you're offline" state — differently from a generic server
// error, without re-running the network-error heuristic a second time.
const OFFLINE_ERROR = "You're offline. Please connect your network.";

type ActionType = 'blink' | 'turn_left' | 'turn_right' | 'nod' | 'smile';

interface LivenessResult {
  action: ActionType;
  passed: boolean;
  confidence: number;
}

interface LivenessChallengeProps {
  visible: boolean;
  /** Attendance context, forwarded to the camera so recognition runs in-session. */
  attendanceType?: 'in' | 'out' | 'spotcheck' | 'class' | null;
  currentLocation?: { latitude: number; longitude: number } | null;
  /**
   * Called once BOTH liveness and face recognition pass on the SAME live
   * session. Receives the captured face image plus the liveness evidence
   * (server nonce + the per-action sensor events) — the screen marks attendance
   * and forwards the evidence so the server can re-adjudicate it.
   */
  /**
   * May return a success boolean (spot-check does, so this modal can hold the
   * "Verified" treatment until the server actually confirms — see
   * handleRecognitionSuccess). Callers that don't care can return void.
   */
  onVerified: (
    faceImage?: any,
    evidence?: { nonce: string | null; events: Array<Record<string, any>> },
    /** The other frames captured during this same live session (see
     * handleRecognitionSuccess) — lets the caller re-verify against the same
     * multi-frame evidence instead of a single isolated frame. */
    frames?: string[]
  ) => void | Promise<boolean>;
  onCancel: () => void;
  /** Spot-check mode: the user CANNOT dismiss this — they must complete it (or let it expire). */
  mandatory?: boolean;
  /** Epoch ms by which it must be completed; shows a live countdown when set. */
  deadline?: number;
}

interface ChallengeData {
  challengeId: string;
  sequence: ActionType[];
  expiresAt: string;
  /** Server-issued single-use nonce. Null when offline (local fallback) —
   * the mark then carries no liveness evidence, exactly like before. */
  nonce: string | null;
  /** Epoch ms the challenge was issued — event timestamps are relative to it. */
  issuedAt: number;
}

// Instruction copy only. The action a step requires is intentionally NOT shown
// anywhere in the chrome until that step is live (the live instruction is drawn
// over the camera by CameraStream) — revealing the sequence up-front would let
// someone pre-record a passing video. `icon` keeps the map self-describing.
const ACTION_META: Record<ActionType, { icon: LucideIcon; instruction: string }> = {
  blink: { icon: Eye, instruction: 'blink your eyes' },
  turn_left: { icon: ArrowLeft, instruction: 'turn your face to the left' },
  turn_right: { icon: ArrowRight, instruction: 'turn your face to the right' },
  nod: { icon: ChevronsDown, instruction: 'nod your head' },
  smile: { icon: Smile, instruction: 'smile at the camera' },
};

// Per-step deadline. Genuine users complete an action in ~1-3s, but slower
// devices/users get a full minute per step before the whole challenge
// restarts with a fresh random sequence (keeps it live; a nonce is never
// reused). As soon as a step IS detected it advances immediately — this is
// only the ceiling for "not detected yet". Must stay ≤ the server's
// perActionWindowMs (LIVENESS_ACTION_WINDOW_MS) or a genuine slow-but-live
// user could pass the client wait only to be rejected server-side.
const STEP_TIMEOUT_MS = 60000;

// Overall session deadline: if not marked within 5 minutes of opening the
// check-in/out window, auto-dismiss. Prevents locking the screen to spoof.
// Must comfortably exceed 2 × STEP_TIMEOUT_MS (worst case: both steps time out
// once each before the user succeeds) plus room for the verify-face round trip.
const SESSION_TIMEOUT_MS = 300000;

type StepStatus = 'done' | 'failed' | 'active' | 'todo';

/**
 * A single progress node — shows ONLY the step number (or a check / cross once
 * resolved). It never reveals which action the step requires; that's the whole
 * anti-replay point. Pulses gently while active.
 */
const StepDot: React.FC<{ status: StepStatus; index: number }> = ({ status, index }) => {
  const { theme } = useTheme();
  const { colors } = theme;

  const pulse = useSharedValue(0);
  useEffect(() => {
    if (status === 'active') {
      pulse.value = withRepeat(
        withTiming(1, {
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          reduceMotion: ReduceMotion.System,
        }),
        -1,
        true
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(0, { duration: 150, reduceMotion: ReduceMotion.System });
    }
  }, [status, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.14 }],
  }));

  const bg =
    status === 'done'
      ? colors.success
      : status === 'failed'
        ? colors.danger
        : status === 'active'
          ? colors.brand
          : 'transparent';
  const borderColor = status === 'todo' ? colors.border : bg;
  const fg = status === 'todo' ? colors.textMuted : colors.white;

  return (
    <Animated.View style={pulseStyle}>
      <View style={[styles.dot, { backgroundColor: bg, borderColor }]}>
        {status === 'done' ? (
          <Check size={18} color={fg} strokeWidth={3} />
        ) : status === 'failed' ? (
          <X size={18} color={fg} strokeWidth={3} />
        ) : (
          <Text style={{ color: fg, fontWeight: '800', fontSize: 16 }}>{index + 1}</Text>
        )}
      </View>
    </Animated.View>
  );
};

export const LivenessChallenge: React.FC<LivenessChallengeProps> = ({
  visible,
  attendanceType,
  currentLocation,
  onVerified,
  onCancel,
  mandatory,
  deadline,
}) => {
  const { theme } = useTheme();
  const { colors, spacing: sp, radii, typography, shadows } = theme;
  const insets = useSafeAreaInsets();

  // Live countdown for the spot-check window (mm:ss). Null when no deadline.
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  useEffect(() => {
    if (!visible || !deadline) { setRemainingSec(null); return; }
    const tick = () => setRemainingSec(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [visible, deadline]);

  const [loading, setLoading] = useState(false);
  const [challenge, setChallenge] = useState<ChallengeData | null>(null);
  // True once CameraStream reports the live preview is actually up (permission
  // granted + device ready). Voice guidance is gated on this so the first step's
  // instruction is never spoken over the "Allow camera access" permission gate.
  const [cameraReady, setCameraReady] = useState(false);
  // Mirror of `cameraReady` readable inside the AppState listener below, whose
  // effect is NOT re-subscribed on every cameraReady change (a plain closure
  // would capture the stale initial `false`).
  const cameraReadyRef = useRef(false);
  useEffect(() => { cameraReadyRef.current = cameraReady; }, [cameraReady]);
  const [currentActionIndex, setCurrentActionIndex] = useState(0);
  const [results, setResults] = useState<LivenessResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  // True once all liveness steps pass — drives the in-session face recognition.
  // The camera stays mounted (same session) so the recognized face is provably
  // the one that performed the live actions.
  const [recognizing, setRecognizing] = useState(false);
  // True only once the face photo is ACTUALLY being captured/matched. Distinct
  // from `recognizing`: when the LAST step was a head turn/nod, CameraStream first
  // waits (visibly) for the user to face forward, and only then begins capture —
  // at which point it calls onVerifyingStart. Driving the "Verifying…" veil off
  // this (not `recognizing`) keeps the "face forward" coaching visible meanwhile.
  const [verifying, setVerifying] = useState(false);
  // The "Verifying…" veil normally clears in ~1-2s. Under a check-in/out rush
  // (many staff verifying within the same minute) the server-side queue can
  // make that round trip take much longer — the SAME static text + spinner
  // sitting there for many seconds reads as a frozen/broken white screen even
  // though it's just slow. After a few seconds, switch to a message that
  // makes clear it's still working, not stuck.
  const [verifyingSlow, setVerifyingSlow] = useState(false);
  useEffect(() => {
    if (!verifying) {
      setVerifyingSlow(false);
      return;
    }
    const t = setTimeout(() => setVerifyingSlow(true), 4000);
    return () => clearTimeout(t);
  }, [verifying]);

  // Presentation-only: terminal success/failure flash treatments.
  const [terminal, setTerminal] = useState<'success' | 'failure' | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Voice guidance: which step index we last read aloud, so we speak each step's
  // instruction exactly once (not on every re-render).
  const lastSpokenStepRef = useRef<number>(-1);

  // Load challenge on modal open
  useEffect(() => {
    if (visible && !challenge) {
      loadChallenge();
    }
  }, [visible]);

  // Presentation-only: haptic per completed/failed step.
  const prevResultCount = useRef(0);
  useEffect(() => {
    if (results.length > prevResultCount.current) {
      const latest = results[results.length - 1];
      haptic(latest.passed ? 'success' : 'error');
    }
    prevResultCount.current = results.length;
  }, [results]);

  // Clear pending treatment timers on unmount.
  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      if (failureTimerRef.current) clearTimeout(failureTimerRef.current);
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
      if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
    };
  }, []);

  // 2-minute overall session timeout: auto-dismiss if not completed in time.
  // Runs from the moment the modal opens, regardless of app state — locking the
  // screen does NOT pause this timer, so spoofing by locking then reopening fails.
  useEffect(() => {
    if (!visible || mandatory) return;
    if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
    sessionTimerRef.current = setTimeout(() => {
      showToast({
        type: 'info',
        title: 'Session expired',
        message: 'Check-in window closed. Please start again.',
      });
      resetChallenge();
      onCancel();
    }, SESSION_TIMEOUT_MS);
    return () => {
      if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
    };
    // onCancel / resetChallenge are stable references; mandatory never changes mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mandatory]);

  // Close the check-in/out window when the app goes to background (e.g. screen
  // lock). Prevents spoofing by locking the phone mid-flow to "freeze" time.
  useEffect(() => {
    if (!visible || mandatory) return;
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        // The OS camera-permission dialog ("Allow camera") briefly pushes the
        // app to inactive/background BEFORE the live preview is up. That is a
        // benign, user-initiated transition — cancelling here is exactly the
        // "Allow camera → back to main screen" bug. There is nothing to spoof
        // yet either (no live challenge running), so only enforce the anti-spoof
        // cancel once the camera preview is actually live.
        if (!cameraReadyRef.current) return;
        if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
        showToast({
          type: 'info',
          title: 'Session closed',
          message: 'Check-in was cancelled because the app went to the background.',
        });
        resetChallenge();
        onCancel();
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mandatory]);

  // Per-step liveness deadline: restart with a fresh random challenge if the
  // current action isn't completed in time (keeps the check live; never reuse).
  useEffect(() => {
    if (!challenge || terminal || recognizing) return;
    if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    stepTimerRef.current = setTimeout(() => {
      showToast({
        type: 'info',
        title: 'Taking too long',
        message: 'Restarting the check — follow the new steps.',
      });
      setChallenge(null);
      loadChallenge();
    }, STEP_TIMEOUT_MS);
    return () => {
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    };
    // loadChallenge is intentionally omitted (recreated each render); matches
    // the visible-effect pattern above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge, currentActionIndex, terminal, recognizing]);

  // Sensor events collected while performing the challenge — one entry per
  // passed action ({t, action, ...magnitudes}). Submitted with the attendance
  // mark; the SERVER adjudicates them against the nonce (client never judges).
  const eventsRef = useRef<Array<Record<string, any>>>([]);

  const loadChallenge = async () => {
    try {
      setLoading(true);
      setError(null);
      eventsRef.current = [];
      // The server-issued nonce is the ONLY thing that gets adjudicated —
      // liveness.mode is 'enforce' everywhere (no shadow mode exists), so a
      // submission with no nonce is not a degraded pass, it is a GUARANTEED
      // 'nonce_invalid' rejection at the end. Falling back to a local-only
      // challenge here used to walk the user through the entire physical
      // challenge (blink/turn/nod) only to fail regardless — silently, and
      // for a reason that had nothing to do with their face or actions. Retry
      // the fetch a couple of times first (a transient blip is far more
      // likely than the endpoint being genuinely down); only if it still
      // fails do we surface a real "couldn't connect" error up front, before
      // the user invests any effort.
      let next: ChallengeData | null = null;
      let lastFailureMsg: string | undefined;
      for (let attempt = 0; attempt < 3 && !next; attempt++) {
        if (attempt > 0) {
          // Exponential backoff (700ms, 1400ms, ...) + up to 400ms of random
          // jitter. A flat 700ms delay meant every user whose check-in landed
          // during the exact same server slowdown retried in lockstep — all
          // hitting the struggling server again at the same instant, 700ms
          // later, compounding the very slowdown that caused the retry.
          // Jitter spreads those retries out instead of a rush-hour surge.
          const backoffMs = 700 * attempt;
          const jitterMs = Math.floor(Math.random() * 400);
          await new Promise((r) => setTimeout(r, backoffMs + jitterMs));
        }
        try {
          const res = await apiService.getLivenessChallenge();
          const ch = (res.data as any)?.challenge;
          if (res.success && ch?.nonce && Array.isArray(ch.sequence) && ch.sequence.length === 2) {
            next = {
              challengeId: ch.nonce,
              sequence: ch.sequence as ActionType[],
              expiresAt: new Date(ch.expiresAt).toISOString(),
              nonce: ch.nonce,
              issuedAt: ch.issuedAt || Date.now(),
            };
          } else if (!res.success) {
            lastFailureMsg = res.error;
          }
        } catch (e) {
          lastFailureMsg = e instanceof Error ? e.message : String(e);
          console.warn(`[Liveness] server challenge fetch attempt ${attempt + 1} failed:`, e);
        }
      }
      if (!next) {
        // A weak/dropped connection (as opposed to a genuine server error) gets
        // its own message + a one-time toast — previously every failure here
        // read identically ("Failed to load challenge"), so a slow-network user
        // had no idea WHAT to fix and could only force-close and retry blind.
        if (isNetworkError(lastFailureMsg)) {
          setError(OFFLINE_ERROR);
          showToast({
            type: 'error',
            title: "You're offline",
            message: 'Please connect your network and try again.',
          });
        } else {
          setError(lastFailureMsg || 'Failed to load challenge');
        }
        return;
      }
      setChallenge(next);
      setCurrentActionIndex(0);
      setResults([]);
      lastSpokenStepRef.current = -1; // a fresh sequence should re-speak step 1
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isNetworkError(msg)) {
        setError(OFFLINE_ERROR);
        showToast({
          type: 'error',
          title: "You're offline",
          message: 'Please connect your network and try again.',
        });
      } else {
        setError(msg || 'Failed to load challenge');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleActionDetected = async (
    action: ActionType,
    confidence: number,
    magnitudes?: Record<string, number>
  ) => {
    if (!challenge || currentActionIndex >= challenge.sequence.length) {
      return;
    }
    // Ignore detections once we've moved past the action phase. After a failed
    // recognition we reload a fresh challenge while the "Verification failed"
    // veil is still up for ~1.6s; without this gate, residual motion could
    // silently auto-advance step 1 of the new sequence behind the overlay.
    if (recognizing || terminal) {
      return;
    }

    const requiredAction = challenge.sequence[currentActionIndex];
    // CameraStream only emits the currently-expected action once it genuinely
    // crosses the detection threshold, so this is a light sanity floor.
    const passed = action === requiredAction && confidence >= 0.3;

    const result: LivenessResult = {
      action: requiredAction,
      passed,
      confidence,
    };

    const newResults = [...results, result];
    setResults(newResults);

    if (!passed) {
      setError(`Action not detected — please ${ACTION_META[requiredAction].instruction}`);
      // Reset to allow retry
      setTimeout(() => {
        setError(null);
        setResults(newResults.slice(0, -1));
      }, 2000);
      return;
    }

    // Record the evidence event for this passed step — relative timestamp plus
    // the raw magnitudes the server's adjudicator checks against its thresholds.
    eventsRef.current.push({
      t: Date.now() - challenge.issuedAt,
      action: requiredAction,
      ...(magnitudes || {}),
    });

    // Move to next action — or, after the LAST action, immediately run face
    // recognition on the SAME live session (this is the anti-spoof binding:
    // the face that did the random actions is the one being identified).
    if (currentActionIndex + 1 >= challenge.sequence.length) {
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
      setRecognizing(true);
    } else {
      setCurrentActionIndex(currentActionIndex + 1);
    }
  };

  // The device can't detect the current expression step at all (ML Kit never
  // returned eye/smile probabilities — see CameraStream's null-signal watchdog).
  // Swap JUST this step for a head-pose action, which needs only yaw/pitch and
  // works on every device. The sequence stays random-length and time-boxed, so
  // the anti-replay property is unchanged.
  const handleActionUnsupported = (failedAction: ActionType) => {
    if (!challenge) return;
    const seq = [...challenge.sequence];
    const prev = seq[currentActionIndex - 1];
    const next = seq[currentActionIndex + 1];
    const poseActions: ActionType[] = ['turn_left', 'turn_right', 'nod'];
    const candidates = poseActions.filter((a) => {
      if (a === prev || a === next) return false; // no identical neighbours
      const oppositeTurn = (x?: ActionType) =>
        (a === 'turn_left' && x === 'turn_right') || (a === 'turn_right' && x === 'turn_left');
      return !oppositeTurn(prev) && !oppositeTurn(next); // no left↔right whiplash
    });
    const pool = candidates.length ? candidates : ['nod' as ActionType];
    seq[currentActionIndex] = pool[Math.floor(Math.random() * pool.length)];
    console.log(
      `[LivenessChallenge] '${failedAction}' undetectable on this device — step ${currentActionIndex + 1} swapped to '${seq[currentActionIndex]}'`
    );
    lastSpokenStepRef.current = -1; // re-speak the replacement instruction
    setChallenge({ ...challenge, sequence: seq });
  };

  // Recognition (from CameraStream, same session) succeeded → hand the live face
  // AND the collected liveness evidence back to the screen, which marks once.
  // `frames` are the OTHER captures from this same live session (one per
  // liveness action) — forwarded so /attendance/mark can re-verify against
  // the same multi-frame evidence /verify-face already fused, instead of
  // re-judging a single frame in isolation (see AttendanceScreen's
  // handleFaceVerificationSuccess for why that mattered).
  const handleRecognitionSuccess = (faceImage?: any, frames?: string[]) => {
    const evidence = {
      nonce: challenge?.nonce ?? null,
      events: eventsRef.current,
    };

    if (mandatory) {
      // Spot-check: the SERVER (/spot-checks/:id/respond) is the sole
      // authoritative verifier — identity, anti-spoof AND liveness are all
      // re-adjudicated there, independent of anything decided on-device. Do
      // NOT flash "Verified ✓" until it actually says so — showing success
      // first and then a rejection right after is confusing, and actively
      // misleading for a feature whose entire point is catching a mismatched
      // identity. Keep the "Verifying…" veil up (driven by `verifying`,
      // already true) until the real result comes back.
      const finish = (ok: boolean) => {
        if (ok) {
          setTerminal('success');
          haptic('success');
          successTimerRef.current = setTimeout(() => {
            resetChallenge();
          }, 900);
        } else {
          // Reset the same state handleRecognitionFailure does — without
          // clearing `recognizing`, CameraStream's currentAction stays null
          // and recognizeNow never re-fires, so a retry would never re-detect
          // the new action sequence at all.
          setRecognizing(false);
          setVerifying(false);
          setTerminal('failure');
          haptic('error');
          failureTimerRef.current = setTimeout(() => setTerminal(null), 1600);
          setChallenge(null);
          loadChallenge();
        }
      };
      Promise.resolve(onVerified(faceImage, evidence, frames))
        .then((res) => finish(res !== false))
        .catch(() => finish(false));
      return;
    }

    // Non-mandatory (check-in/out): unchanged. CameraStream's own
    // /attendance/verify-face pre-check already confirmed a match before this
    // fires, so showing success immediately here is fine.
    setTerminal('success');
    haptic('success');
    successTimerRef.current = setTimeout(() => {
      onVerified(faceImage, evidence, frames);
      resetChallenge();
    }, 900);
  };

  // Recognition failed (no match / error) → the whole live check must be redone;
  // restart with a brand-new random challenge (never reuse).
  const handleRecognitionFailure = () => {
    setRecognizing(false);
    setVerifying(false);
    setTerminal('failure');
    haptic('error');
    showToast({
      type: 'error',
      title: 'Face not recognized',
      message: 'Let’s run the check again.',
    });
    failureTimerRef.current = setTimeout(() => setTerminal(null), 1600);
    setChallenge(null);
    loadChallenge();
  };

  const resetChallenge = () => {
    if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    setChallenge(null);
    eventsRef.current = [];
    setCurrentActionIndex(0);
    setResults([]);
    setError(null);
    setTerminal(null);
    setRecognizing(false);
    setVerifying(false);
    setCameraReady(false);
    lastSpokenStepRef.current = -1;
  };

  const handleCancel = () => {
    // Spot-checks are mandatory: ignore dismissal (back button / Android) — the
    // user must complete the face check or wait for the window to expire.
    if (mandatory) return;
    resetChallenge();
    onCancel();
  };

  const currentAction = challenge?.sequence[currentActionIndex];
  const actionProgress = results.length;
  const totalActions = challenge?.sequence.length || 0;

  // Read the current step's instruction aloud, exactly once per step. Skipped
  // while recognizing/terminal (no action to perform then), and — crucially —
  // until the camera preview is actually up (`cameraReady`), so the first step is
  // never spoken over the "Allow camera access" gate. No-ops silently if the TTS
  // native module isn't in this build.
  useEffect(() => {
    if (!visible || !cameraReady || recognizing || terminal || !currentAction) return;
    if (currentActionIndex === lastSpokenStepRef.current) return;
    lastSpokenStepRef.current = currentActionIndex;
    speak(`Please ${ACTION_META[currentAction].instruction}`);
  }, [visible, cameraReady, recognizing, terminal, currentAction, currentActionIndex]);

  // Speak the recognition + terminal moments, and stop any speech when the modal
  // closes or this component unmounts.
  useEffect(() => {
    if (visible && verifying && !terminal) speak('Hold still. Verifying your face.');
  }, [visible, verifying, terminal]);
  useEffect(() => {
    if (terminal === 'success') speak('Verified. Attendance marked.');
    else if (terminal === 'failure') speak('Verification failed. Let us try again.');
  }, [terminal]);
  useEffect(() => {
    if (!visible) {
      stopSpeaking();
      // Re-arm the camera-ready gate so the next open waits for a fresh live
      // preview before any voice (handles permission being revoked between opens).
      setCameraReady(false);
    }
  }, [visible]);
  useEffect(() => () => stopSpeaking(), []);

  const stepStatus = (index: number): StepStatus => {
    const result = results[index];
    if (result) {
      return result.passed ? 'done' : 'failed';
    }
    return index === currentActionIndex ? 'active' : 'todo';
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleCancel}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.white }]}>
        {loading || (!challenge && !error) ? (
          /* Skeleton while the challenge sequence loads. */
          <View style={[styles.skeletonContainer, { padding: sp.lg, gap: sp.lg }]}>
            <View style={[styles.dotsRow, { gap: sp.sm, justifyContent: 'center' }]}>
              <Skeleton width={40} height={40} radius={20} />
              <Skeleton width={40} height={40} radius={20} />
              <Skeleton width={40} height={40} radius={20} />
            </View>
            <Skeleton height={320} radius={radii.lg} />
            <Text
              accessibilityLiveRegion="polite"
              style={[typography.body, { color: colors.textMuted, textAlign: 'center' }]}
            >
              Preparing your liveness check…
            </Text>
          </View>
        ) : challenge ? (
          // Full-screen camera so the circle is centred on the WHOLE screen and
          // the big instruction beneath it is never clipped. Header + Cancel
          // float on the white margins above/below the circle.
          <View style={styles.stage}>
            {/* Camera stream — ONE session for both liveness and recognition.
                CameraStream paints the white surround, the centred circular
                window, the green-on-detect ring and the big live instruction. */}
            <View style={StyleSheet.absoluteFill}>
              <CameraStream
                onActionDetected={handleActionDetected}
                onActionUnsupported={handleActionUnsupported}
                livenessModeEnabled={true}
                currentAction={recognizing ? null : currentAction ?? null}
                actionNonce={currentActionIndex}
                recognizeNow={recognizing}
                onCameraReady={() => setCameraReady(true)}
                onVerifyingStart={() => setVerifying(true)}
                attendanceType={attendanceType}
                currentLocation={currentLocation}
                onVerificationSuccess={handleRecognitionSuccess}
                onVerificationFailure={handleRecognitionFailure}
              />
            </View>

            {/* Floating header — title + step NUMBERS only (no action is ever
                named here; the live action is revealed over the camera only when
                its step is active). */}
            <Animated.View
              entering={FadeInDown.duration(300)}
              pointerEvents="box-none"
              style={[
                styles.headerFloat,
                { paddingTop: insets.top + sp.sm, paddingHorizontal: sp.lg },
              ]}
            >
              <View style={[styles.titleRow, { gap: sp.sm }]}>
                <View
                  style={[
                    styles.titleBadge,
                    { backgroundColor: colors.brandSoft, borderRadius: radii.md },
                  ]}
                >
                  <ShieldCheck size={20} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.h3, { color: colors.text }]}>
                    {mandatory ? 'Attendance Spot-Check' : 'Liveness Check'}
                  </Text>
                  <Text
                    accessibilityLiveRegion="polite"
                    style={[typography.caption, { color: colors.textMuted }]}
                  >
                    {mandatory ? 'Verify now to stay marked present' : `Step ${Math.min(actionProgress + 1, totalActions)} of ${totalActions}`}
                  </Text>
                </View>
                {deadline != null && remainingSec != null && (
                  <View
                    style={{
                      backgroundColor: remainingSec <= 60 ? colors.dangerSoft : colors.brandSoft,
                      borderRadius: radii.pill,
                      paddingHorizontal: sp.md,
                      paddingVertical: 5,
                    }}
                  >
                    <Text style={[typography.caption, { color: remainingSec <= 60 ? colors.danger : colors.brand, fontWeight: '800' }]}>
                      {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, '0')} left
                    </Text>
                  </View>
                )}
              </View>

              {/* Numbered step nodes + connectors */}
              <View style={[styles.dotsRow, { marginTop: sp.md }]}>
                {challenge.sequence.map((_, index) => (
                  <React.Fragment key={index}>
                    {index > 0 && (
                      <View
                        style={[
                          styles.connector,
                          {
                            backgroundColor:
                              stepStatus(index - 1) === 'done' ? colors.success : colors.border,
                          },
                        ]}
                      />
                    )}
                    <StepDot status={stepStatus(index)} index={index} />
                  </React.Fragment>
                ))}
              </View>
            </Animated.View>

            {/* Verifying overlay — covers the live coaching while we match the
                captured face (camera stays mounted = same session). Shown only
                once capture actually starts (`verifying`), so when the last step
                was a turn/nod the "face forward" coaching stays visible first. */}
            {verifying && !terminal && (
              <Animated.View
                entering={FadeIn.duration(200)}
                pointerEvents="none"
                style={[styles.veil, { backgroundColor: 'rgba(255,255,255,0.92)' }]}
              >
                <View
                  style={[
                    styles.verifyCard,
                    {
                      backgroundColor: colors.white,
                      borderRadius: radii.lg,
                      padding: sp.xl,
                      gap: sp.md,
                      ...shadows.e3,
                    },
                  ]}
                >
                  <ActivityIndicator size="large" color={colors.brand} />
                  <Text style={[typography.h3, { color: colors.text, textAlign: 'center' }]}>
                    {verifyingSlow ? 'Still verifying…' : 'Verifying your face…'}
                  </Text>
                  <Text
                    style={[typography.caption, { color: colors.textMuted, textAlign: 'center' }]}
                  >
                    {verifyingSlow
                      ? "It's busy right now — this can take a little longer. Please hold still."
                      : 'Hold still for a moment'}
                  </Text>
                </View>
              </Animated.View>
            )}

            {/* Terminal success / failure treatments */}
            {terminal === 'success' && (
              <Animated.View
                entering={ZoomIn.duration(300)}
                pointerEvents="none"
                style={[styles.veil, { backgroundColor: 'rgba(255,255,255,0.96)' }]}
              >
                <View style={[styles.terminalBadge, { backgroundColor: colors.success }]}>
                  <CircleCheck size={48} color={colors.white} />
                </View>
                <Text
                  accessibilityLiveRegion="polite"
                  style={[typography.h3, { color: colors.text, marginTop: sp.lg }]}
                >
                  Verified ✓
                </Text>
              </Animated.View>
            )}
            {terminal === 'failure' && (
              <Animated.View
                entering={ZoomIn.duration(300)}
                pointerEvents="none"
                style={[styles.veil, { backgroundColor: 'rgba(255,255,255,0.96)' }]}
              >
                <View style={[styles.terminalBadge, { backgroundColor: colors.danger }]}>
                  <CircleX size={48} color={colors.white} />
                </View>
                <Text
                  accessibilityLiveRegion="polite"
                  style={[typography.h3, { color: colors.text, marginTop: sp.lg }]}
                >
                  Verification failed
                </Text>
                <Text style={[typography.small, { color: colors.textMuted }]}>
                  Let's try that again
                </Text>
              </Animated.View>
            )}

            {/* Error banner — floats just above the Cancel button */}
            {error && (
              <Animated.View
                entering={FadeInDown.duration(250)}
                style={[
                  styles.errorBox,
                  styles.errorFloat,
                  {
                    backgroundColor: colors.dangerSoft,
                    borderLeftColor: colors.danger,
                    bottom: insets.bottom + 96,
                    marginHorizontal: sp.lg,
                    padding: sp.md,
                    borderRadius: radii.md,
                    gap: sp.sm,
                  },
                ]}
              >
                <TriangleAlert size={18} color={colors.danger} />
                <Text
                  accessibilityLiveRegion="polite"
                  style={[typography.body, { color: colors.danger, flex: 1 }]}
                >
                  {error}
                </Text>
              </Animated.View>
            )}

            {/* Cancel — floats at the bottom. Hidden in mandatory (spot-check) mode. */}
            {!mandatory && (
              <View
                style={[
                  styles.cancelFloat,
                  { paddingBottom: insets.bottom + sp.sm, paddingHorizontal: sp.lg, paddingTop: sp.sm },
                ]}
              >
                <Button
                  title="Cancel"
                  icon={X}
                  variant="ghost"
                  fullWidth
                  disabled={recognizing}
                  onPress={handleCancel}
                  accessibilityLabel="Cancel liveness verification"
                />
              </View>
            )}
          </View>
        ) : (
          /* Failed to load the challenge */
          <Animated.View entering={FadeIn.duration(300)} style={styles.centerContainer}>
            <EmptyState
              icon={error === OFFLINE_ERROR ? WifiOff : TriangleAlert}
              tone={error === OFFLINE_ERROR ? 'danger' : 'default'}
              title={error === OFFLINE_ERROR ? "You're offline" : "Couldn't load liveness check"}
              message={
                error === OFFLINE_ERROR
                  ? 'Please connect your network and try again.'
                  : error || 'Check your connection and try again.'
              }
              actionLabel="Retry"
              onAction={() => {
                setChallenge(null);
                loadChallenge();
              }}
            />
            {!mandatory && (
              <View style={{ marginTop: sp.lg, alignSelf: 'stretch', paddingHorizontal: sp.lg }}>
                <Button
                  title="Cancel"
                  icon={X}
                  variant="ghost"
                  fullWidth
                  onPress={handleCancel}
                  accessibilityLabel="Cancel liveness verification"
                />
              </View>
            )}
          </Animated.View>
        )}
      </SafeAreaView>
    </Modal>
  );
};

// Static layout only — every color comes from the theme at render time.
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  skeletonContainer: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stage: {
    flex: 1,
  },
  headerFloat: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  cancelFloat: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  errorFloat: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleBadge: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connector: {
    width: 28,
    height: 3,
    borderRadius: 2,
    marginHorizontal: 4,
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  veil: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyCard: {
    alignItems: 'center',
    maxWidth: '80%',
  },
  terminalBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
  },
});
