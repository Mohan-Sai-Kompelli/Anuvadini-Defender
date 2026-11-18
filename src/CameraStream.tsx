import * as React from "react";
import { useRef, useEffect } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  useCameraPermission,
  useCameraDevice,
  useCameraFormat,
  type CameraPosition,
  Camera,
} from "react-native-vision-camera";
// On-device face detection via Google ML Kit (still-image based — used as the
// FALLBACK path when the frame processor is disabled).
import FaceDetection, { type Face } from "@react-native-ml-kit/face-detection";
// Real-time face detection via VisionCamera frame processors (ML Kit running on
// the in-memory camera buffer, no per-frame snapshot to disk). This is the fast
// path. The plugin ships a Camera wrapper that does all the worklet plumbing.
// IMPORTANT: type-only import. The plugin's Camera (its Camera.tsx) calls
// useSharedValue from react-native-worklets-core at render time. Statically
// importing the COMPONENT eagerly loads that worklets-core JSI runtime, which
// crashes the whole verify screen ("Cannot read property 'useSharedValue' of
// undefined") when that native runtime isn't present/healthy. The component is
// loaded lazily + guarded below instead. Types are erased at build time, so a
// type-only import is always safe.
import type { Face as PluginFace } from "react-native-vision-camera-face-detector";
import { config, getApiBaseUrl } from "./config";
import { useAuth } from "./AuthContext";
import { useNavigation } from "@react-navigation/native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Canvas, ImageFormat, Path as SkiaPath, Skia } from "@shopify/react-native-skia";
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
} from "react-native-reanimated";
import {
  ArrowLeft,
  ArrowRight,
  Camera as CameraIcon,
  CameraOff,
  ChevronsDown,
  CircleCheck,
  Eye,
  RotateCcw,
  ScanFace,
  ShieldAlert,
  Smile,
  SwitchCamera,
  X,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { Button, EmptyState, ProgressRing, useTheme } from "./components/ui";
import { showToast } from "./utils/toast";
import { haptic } from "./utils/haptics";
import { speak } from "./utils/speech";
import { downscaleForUpload } from "./utils/geotag";
import { collectDeviceTelemetry } from "./utils/deviceTelemetry";
import { isNetworkError } from "./services/offlineAttendance";
import {
  TFLITE_AVAILABLE,
  useAntiSpoofModel,
  useSpoofTracker,
} from "./liveness/antiSpoof";

const getDefaultUserId = async () => {
  try {
    // Try to get student data from the correct storage keys used in login
    const studentDataStr = await AsyncStorage.getItem('studentData');
    const userDataStr = await AsyncStorage.getItem('user');

    console.log("Getting student ID for face recognition...");
    console.log("studentDataStr:", studentDataStr);
    console.log("userDataStr:", userDataStr);

    if (studentDataStr) {
      const studentData = JSON.parse(studentDataStr);
      console.log("Student data:", studentData);
      // Return the UID from student data
      return studentData.uid || studentData.id;
    }

    if (userDataStr) {
      const userData = JSON.parse(userDataStr);
      console.log("User data:", userData);
      // Return the UID from user data
      return userData.uid || userData.id;
    }

    console.log("No student data found in AsyncStorage");
    return null;
  } catch (error) {
    console.error("Error getting student ID:", error);
    return null;
  }
};

export type LivenessAction =
  | 'blink'
  | 'turn_left'
  | 'turn_right'
  | 'nod'
  | 'smile';

// Head-pose actions move the face OFF a frontal pose (turn/nod). After one of
// these is the LAST challenge step we must let the head come back to frontal
// before the recognition photo, or the face engine sees a turned/tilted face and
// the match fails ("authentication failed"). Expression actions keep the face
// frontal, so they capture immediately.
const isPoseAction = (a: LivenessAction | null | undefined): boolean =>
  a === 'turn_left' || a === 'turn_right' || a === 'nod';

type Props = {
  onVerificationSuccess?: (faceImage?: any, frames?: string[]) => void;
  onVerificationFailure?: () => void;
  attendanceType?: 'in' | 'out' | 'spotcheck' | 'class' | null;
  currentLocation?: {
    latitude: number;
    longitude: number;
  } | null;
  /**
   * Liveness wiring (consumed by LivenessChallenge). When `livenessModeEnabled`
   * is set, the camera does NOT run the face-recognition/blink-auth flow; instead
   * it watches for `currentAction` and fires `onActionDetected` once the user
   * performs it. The modal advances the challenge sequence from there.
   * `magnitudes` are the raw sensor readings at detection time (blink closedness,
   * smile probability, yaw/pitch deviation) — the liveness evidence the server
   * re-adjudicates with the attendance mark.
   */
  onActionDetected?: (
    action: LivenessAction,
    confidence: number,
    magnitudes?: Record<string, number>
  ) => void;
  livenessModeEnabled?: boolean;
  /** The single action the challenge currently expects (drives detection). */
  currentAction?: LivenessAction | null;
  /**
   * Monotonic step index. Two consecutive steps can require the SAME action
   * (e.g. an allowed double-blink), in which case `currentAction` doesn't change
   * and a value-keyed reset would never fire — leaving the previous step's
   * emitted/baseline state and wedging the second step. Keying the reset on this
   * index guarantees a clean reset on every advance.
   */
  actionNonce?: number;
  /**
   * Liveness binding: when this flips true (in liveness mode), the camera
   * immediately captures the CURRENT live frame and runs face recognition from
   * the SAME session — so the face that performed the random actions is the one
   * identified. There is no separate capture step a video could be swapped into.
   * Identity-only here (no attendance mark); the screen marks once on success.
   */
  recognizeNow?: boolean;
  /**
   * Liveness only: fired the instant the recognition photo is ACTUALLY being
   * captured. The modal drives its "Verifying…" veil off this (not `recognizeNow`)
   * so that when the last action was a head turn/nod we can first wait — visibly —
   * for the user to face forward again, without the veil hiding that coaching.
   */
  onVerifyingStart?: () => void;
  /**
   * Fired once the LIVE camera is actually mounted — i.e. permission is granted
   * AND a device is available, the same condition under which the real preview
   * (not the "Allow camera access" gate) renders. The liveness modal gates its
   * spoken step instructions on this so TTS never plays over the permission gate.
   */
  onCameraReady?: () => void;
  /**
   * Fired when the current expression action (blink/smile) is UNDETECTABLE on
   * this device — ML Kit classification probabilities came back null/absent for
   * every frame over a sustained window, so the step can never complete no
   * matter what the user does. The modal should swap the step for a head-pose
   * action (turn/nod), which needs only yaw/pitch and works on every device.
   * Fired at most once per step.
   */
  onActionUnsupported?: (action: LivenessAction) => void;
};
// MLKit eye-open probability thresholds for blink liveness detection.
const EYES_CLOSED_THRESHOLD = 0.35; // both eyes below this => closed
const EYES_OPEN_THRESHOLD = 0.6; // both eyes above this => open
const REQUIRED_BLINKS = 1; // Number of blinks required for authentication
// Face framing checks, expressed as ratios of the captured image dimensions.
const FACE_SIZE_MIN_RATIO = 0.22; // face width / image width — minimum
const FACE_SIZE_MAX_RATIO = 0.9; // face width / image width — maximum
const CENTER_TOLERANCE_RATIO = 0.25; // allowed offset of face center from image center
const POLL_INTERVAL_MS = 500; // how often we run a detection pass
const LIVENESS_POLL_INTERVAL_MS = 120; // sample as fast as the detector allows during a challenge
// Dev-only on-screen detection readout (the green monospace line). Off in the UI;
// the same data still goes to logcat for calibration.
const SHOW_DETECTION_DEBUG = false;

// ---- Liveness challenge detection thresholds (ML Kit face data) ------------
// Head pose comes from ML Kit `rotationY` (yaw, left/right) and `rotationX`
// (pitch, up/down), in degrees. Signs depend on the camera mirroring, so they
// are calibrated on a real device; flip LIVENESS_YAW_SIGN / _PITCH_SIGN if a
// turn registers as the wrong direction.
// Thresholds calibrated against on-device readings (Vivo front cam): neutral
// yaw 0-6 / pitch ~-8 (offset!) / smile ~0.01; turn peaked ~43,
// nod ~-33, smile ~0.99.
const LIVENESS = {
  // SIGNED deviation from a per-step NEUTRAL baseline — NOT an accumulated range.
  // Why this matters: a range test (max−min over the step) keeps growing as ML
  // Kit's frame-to-frame yaw/pitch NOISE piles up — at frame-processor frame rate
  // that crosses the threshold on its own, so a step "completes" while the user
  // holds perfectly still, in any direction. A signed deviation only fires when
  // the head is ACTUALLY that far off neutral, in the requested direction, at a
  // single instant — noise can't fake it, and it enforces left vs right.
  yawTurnDeg: 16, // |yaw − baseline| past this, in the requested direction = a turn
  pitchNodDeg: 12, // |pitch − baseline| past this = a nod (vertical → direction-agnostic)
  // Expression thresholds were first calibrated on ONE device (Vivo: neutral
  // smile ~0.01, full smile ~0.99) and proved too strict in the field — beards
  // depress smilingProbability (mouth corners hidden) and glasses/low light
  // depress eye-open probabilities, so steps could NEVER complete on some faces
  // and phones. Loosened + made smile ADAPTIVE (see smileRise) so "smile" means
  // "clearly more smiling than YOUR neutral face", not one fixed number.
  smileProb: 0.45, // smilingProbability past this = a smile (absolute path)
  smileRise: 0.3, // OR probability rose this far above the step's observed minimum
  smileFloor: 0.3, // adaptive path still needs at least this absolute probability
  smileArmBelow: 0.35, // must first see a clearly NON-smiling face before a smile counts
  blinkClosed: 0.35, // both eyes below this = closed
  blinkOpen: 0.55, // both eyes above this = open
  blinkArmOpen: 0.6, // must first see eyes clearly OPEN before a blink can count
  // A genuine blink is done with a still head. If the head is turning/nodding by
  // more than this (deg between consecutive samples), the eye-open probability
  // dip is an ANGLE artifact, not a blink — so we don't count it. Stops "move
  // your head" from passing a blink step.
  blinkStillDeg: 10,
  baselineSamples: 5, // settled frames averaged into the neutral baseline (turn/nod only)
  baselineStableDeg: 6, // frame-to-frame pose delta below this = head is settled
  baselineMaxWait: 22, // give up waiting for "settled" after this many frames (never hang)
  // A sustained action (turn/nod/smile) must hold PAST its threshold
  // continuously for this long before it counts. This is the core anti-false-pass
  // guard: a single noisy frame — or a brief, random/incidental movement — crosses
  // a threshold for one frame and would otherwise "complete" the step. Requiring
  // the signal to persist ~¼s means the user has to ACTUALLY perform (and briefly
  // hold) the requested action; random motion can't fake a held signal.
  holdMs: 400,
  // If an expression step's ML Kit classification signal (eye-open / smiling
  // probability) is null on EVERY frame for this long, the device simply doesn't
  // provide it — the step is impossible, not "not performed yet". We then fire
  // onActionUnsupported so the modal swaps the step for a pose action.
  nullSignalTimeoutMs: 2500,
};
// Front-camera coordinate conventions. Turn detection is SIGNED, so this decides
// which way "right" is. If a correctly-followed "turn right" shows "Other way",
// flip LIVENESS_YAW_SIGN to 1 (hot-reloads instantly — no rebuild). Nod uses the
// ABSOLUTE deviation, so its sign never matters.
const LIVENESS_YAW_SIGN = -1; // (rotationY * sign) increasing => user turning RIGHT
const LIVENESS_PITCH_SIGN = 1; // unused for pass/fail (nod is magnitude-only)

// Return-to-frontal capture gate. When the LAST challenge action is a head turn
// or nod, the recognition photo must NOT be grabbed mid-turn (a non-frontal face
// won't match). We wait until the head is back near its neutral pose, held for a
// couple of frames, before capturing.
const FRONTAL_RETURN_DEG = 10; // |yaw−neutral| & |pitch−neutral| under this = frontal again
const FRONTAL_STREAK = 2;      // consecutive frontal frames required before capture
const SETTLE_MAX_WAIT_MS = 3500; // capture anyway after this, so it never hangs

// ---- Frame-processor (VisionCamera) fast path ------------------------------
// When true, face detection runs as a real-time VisionCamera frame processor:
// ML Kit reads the in-memory camera buffer directly — no takeSnapshot→write→
// decode→detect round-trip per frame. That round-trip was the entire source of
// the "too slow / laggy" feel; the frame processor is an order of magnitude
// faster and gives near-instant action detection.
//
// KILL-SWITCH: flip this to false to instantly revert to the snapshot loop
// (e.g. if the native frame-processor build isn't ready) — nothing else changes.
const USE_FRAME_PROCESSOR = true;

// Resolve the frame-processor face-detector Camera DEFENSIVELY. The plugin and
// VisionCamera 4.7 use the LEGACY react-native-worklets-core, while Reanimated 4
// (also installed here) ships the NEW react-native-worklets — a split that breaks
// the moment worklets-core's native JSI runtime isn't live in the running binary
// (a stale native build, or the two worklets stacks not co-installed). When that
// happens, rendering the plugin Camera throws "Cannot read property
// 'useSharedValue' of undefined" and the verify screen crashes on check-in/out.
// So: take the fast frame-processor path ONLY when worklets-core is actually
// healthy, and otherwise transparently fall back to the ML Kit snapshot loop
// below — no crash, and the fast path re-engages automatically once the native
// build is correct.
let FaceDetectorCamera: React.ComponentType<any> | null = null;
let frameProcessorAvailable = false;
if (USE_FRAME_PROCESSOR) {
  try {
    const workletsCore = require("react-native-worklets-core");
    if (
      workletsCore &&
      typeof workletsCore.useSharedValue === "function" &&
      (globalThis as any).Worklets != null
    ) {
      FaceDetectorCamera = require("react-native-vision-camera-face-detector").Camera;
      frameProcessorAvailable = FaceDetectorCamera != null;
    }
  } catch {
    // Native worklets-core unavailable — handled by the warning below.
  }
  if (!frameProcessorAvailable) {
    console.warn(
      "[CameraStream] react-native-worklets-core runtime unavailable — using the " +
        "ML Kit snapshot fallback for face detection. Rebuild the native app " +
        "(npx react-native run-android / run-ios) to restore the fast frame processor."
    );
  }
}

// On-device anti-spoof (PAD) camera: face detection + the screen/photo-replay
// model in ONE frame processor. Resolved with the SAME defensiveness as the
// face detector above — requiring it also pulls in vision-camera-resize-plugin
// and react-native-fast-tflite, so a missing/stale native build is caught HERE
// (at module load) rather than crashing the verify screen at render. When it
// isn't available we transparently fall back to the plain face-detector Camera
// (face detection still works, just without spoof enforcement).
// On-device anti-spoof (PAD) is DISABLED on the camera frame. Running the TFLite
// model synchronously on EVERY frame saturated the frame thread and stuttered the
// preview ("stuck frames"). The SAME PAD already runs server-side on /verify-face
// (face-back/check.py) on the captured photo, so removing it from the live frame
// loses no spoof protection. We use the plain face-detector Camera instead (ML Kit
// detection only, run via the plugin's runAsync) → smooth preview. Set this back
// to true to re-enable on-device per-frame PAD.
const USE_ONDEVICE_ANTISPOOF = false;
let AntiSpoofCameraComp: React.ComponentType<any> | null = null;
let antiSpoofCameraAvailable = false;
if (USE_ONDEVICE_ANTISPOOF && frameProcessorAvailable && TFLITE_AVAILABLE) {
  try {
    require("vision-camera-resize-plugin");
    AntiSpoofCameraComp = require("./liveness/AntiSpoofCamera").AntiSpoofCamera;
    antiSpoofCameraAvailable = AntiSpoofCameraComp != null;
  } catch {
    antiSpoofCameraAvailable = false;
  }
}

// Defends against a DEEPER version of the same stale-native-build failure the
// worklets-core check above already guards: that check only confirms the
// worklets-core JSI runtime is alive, not that the "detectFaces" native plugin
// itself is registered. When it isn't (e.g. this package was added without a
// full native rebuild), react-native-vision-camera-face-detector's own Camera
// throws synchronously INSIDE ITS RENDER ("Failed to load Frame Processor
// Plugin 'detectFaces'!" / FrameProcessorsUnavailableError) the first time it
// ever mounts — which in this app is the exact instant the user grants camera
// permission on the "Allow camera access" gate. That's a plain React render
// exception with no ErrorBoundary anywhere in the app to catch it, so it took
// down the whole app instead of just this screen. This boundary catches it and
// falls back to the plain ML Kit snapshot-loop Camera (same graceful
// degradation this file already does for the worklets-core case), and flips
// the module-level flags so every later mount this session skips the crashing
// path entirely instead of flashing it again first.
class FrameProcessorErrorBoundary extends React.Component<
  { onCrash: () => void; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { onCrash: () => void; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.warn(
      "[CameraStream] frame-processor Camera crashed at mount — falling back to the ML Kit snapshot loop:",
      error
    );
    this.props.onCrash();
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

// The plugin returns faces in its own shape (bounds/yawAngle/pitchAngle/CONTOUR
// names). Map them onto the exact ML Kit `Face` fields the existing pipeline
// reads — handleFaces (frame box), detectLivenessAction (rotationY/rotationX,
// eye/smile probs). With autoMode enabled the
// native side already scales bounds + contours into window space, so the framing
// math downstream can treat them as screen coordinates.
function mapPluginFace(pf: PluginFace): Face {
  return {
    frame: {
      left: pf.bounds.x,
      top: pf.bounds.y,
      width: pf.bounds.width,
      height: pf.bounds.height,
    },
    rotationY: pf.yawAngle,
    rotationX: pf.pitchAngle,
    leftEyeOpenProbability: pf.leftEyeOpenProbability,
    rightEyeOpenProbability: pf.rightEyeOpenProbability,
    smilingProbability: pf.smilingProbability,
    contours: pf.contours
      ? {
          upperLipBottom: { points: pf.contours.UPPER_LIP_BOTTOM },
          lowerLipTop: { points: pf.contours.LOWER_LIP_TOP },
        }
      : undefined,
  } as unknown as Face;
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Oval face-guide geometry (Skia cutout overlay). Large enough to comfortably
// frame the whole head — room for turns and an open mouth.
const OVAL_WIDTH = Math.min(screenWidth * 0.88, 400);
const OVAL_HEIGHT = OVAL_WIDTH * 1.34;
const OVAL_X = (screenWidth - OVAL_WIDTH) / 2;
const OVAL_Y = (screenHeight - OVAL_HEIGHT) / 2 - screenHeight * 0.04;
const PULSE_PAD = 14;

// Liveness presentation: a clean CIRCLE centred on screen, with everything
// outside it painted white (the camera shows only through the circle). The ring
// around it turns green the moment a face is framed. Centre sits a touch above
// the middle to leave room for the big instruction beneath it.
const LIVE_D = Math.min(screenWidth * 0.88, 380);
const LIVE_R = LIVE_D / 2;
const LIVE_CX = screenWidth / 2;
const LIVE_CY = screenHeight * 0.43;

// Maps the currently-expected action to a glyph for the big instruction card.
const LIVE_ACTION_ICON: Record<string, LucideIcon> = {
  blink: Eye,
  turn_left: ArrowLeft,
  turn_right: ArrowRight,
  nod: ChevronsDown,
  smile: Smile,
};

// Read a local `file://` capture (VisionCamera's takePhoto only returns a disk
// path, no base64) into a "data:image/jpeg;base64,..." string. fetch()/Blob/
// FileReader on a file:// URI are all supported by RN's built-in environment —
// no extra native dependency needed. Callers that JSON-encode the result
// (rather than uploading it as multipart) need a real data-URI, not a bare path.
// Face verification doesn't need a full-resolution photo, and storing multi-MB
// base64 blobs in every attendance record bloats the DB fast. Cap the longest
// side here — ~800px keeps the face plenty sharp for the engine while cutting a
// full-size capture (~660 KB base64) down to roughly a tenth of that.
const FACE_IMAGE_MAX_DIM = 800;
const FACE_IMAGE_JPEG_QUALITY = 80;

async function fileUriToBase64(uri: string): Promise<string> {
  // Primary: Skia (already a dependency) reads the capture natively — reliable
  // where RN's fetch/Blob on a file:// URI is flaky — and lets us DOWNSCALE
  // before encoding. Sending the raw file path (the old behaviour when the JS
  // blob read failed) stored a useless device-local path on the server and made
  // the mark-time face check unpassable.
  try {
    const data = await Skia.Data.fromURI(uri);
    const image = Skia.Image.MakeImageFromEncoded(data);
    if (!image) throw new Error('Skia could not decode the captured photo');
    const w = image.width();
    const h = image.height();
    const scale = Math.min(1, FACE_IMAGE_MAX_DIM / Math.max(w, h));
    if (scale < 1) {
      const dw = Math.round(w * scale);
      const dh = Math.round(h * scale);
      const surface = Skia.Surface.Make(dw, dh);
      if (surface) {
        const canvas = surface.getCanvas();
        canvas.drawImageRect(
          image,
          Skia.XYWHRect(0, 0, w, h),
          Skia.XYWHRect(0, 0, dw, dh),
          Skia.Paint()
        );
        const snapshot = surface.makeImageSnapshot();
        const b64 = snapshot.encodeToBase64(ImageFormat.JPEG, FACE_IMAGE_JPEG_QUALITY);
        return `data:image/jpeg;base64,${b64}`;
      }
    }
    // Already small enough (or surface creation failed): encode as-is.
    const b64 = image.encodeToBase64(ImageFormat.JPEG, FACE_IMAGE_JPEG_QUALITY);
    return `data:image/jpeg;base64,${b64}`;
  } catch (e) {
    console.warn('[CameraStream] Skia base64 failed, falling back to fetch/FileReader:', e);
  }
  // Fallback: RN's built-in fetch/Blob/FileReader (full resolution — bigger,
  // but a valid image beats no image).
  const response = await fetch(uri);
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('FileReader failed to read capture'));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

type Outcome = 'success' | 'attendance_failed' | 'auth_failed' | 'spoof' | null;

export const CameraStream: React.FC<Props> = ({ onVerificationSuccess, onVerificationFailure, attendanceType, currentLocation, livenessModeEnabled, onActionDetected, currentAction, actionNonce, recognizeNow, onVerifyingStart, onCameraReady, onActionUnsupported }) => {
  const { user } = useAuth();
  const navigation = useNavigation();
  const camPerm = useCameraPermission();
  const { theme } = useTheme();
  const { colors, spacing: sp, radii, typography, shadows } = theme;
  const insets = useSafeAreaInsets();
  const [permsGranted, setPermsGranted] = React.useState<{
    cam: boolean;
  }>({ cam: camPerm.hasPermission });
  // Flips true if the frame-processor Camera crashes at mount (stale native
  // build — see FrameProcessorErrorBoundary above) so this render immediately
  // falls back to the plain snapshot-loop Camera instead of retrying the path
  // that just crashed.
  const [frameProcessorCrashed, setFrameProcessorCrashed] = React.useState(false);
  const handleFrameProcessorCrash = React.useCallback(() => {
    // Also disable it for every later mount THIS session (new screen visits,
    // retries) so the crashing path is never attempted again, not just on
    // this instance.
    frameProcessorAvailable = false;
    antiSpoofCameraAvailable = false;
    setFrameProcessorCrashed(true);
  }, []);

  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);
  const [blinkCount, setBlinkCount] = React.useState(0);
  const [isFaceInPosition, setIsFaceInPosition] = React.useState(false);
  const [authMessage, setAuthMessage] = React.useState("Position your face in the oval");
  const cameraRef = useRef<Camera>(null);

  // Face capture and recognition states
  const [isCapturingFace, setIsCapturingFace] = React.useState(false);
  const [isProcessingRecognition, setIsProcessingRecognition] = React.useState(false);
  const [recognitionResult, setRecognitionResult] = React.useState<{
    success: boolean;
    message: string;
    confidence?: number;
  } | null>(null);
  const [capturedImageData, setCapturedImageData] = React.useState<string | null>(null);
  const [userId, setUserId] = React.useState(config.defaultUserId);

  // Presentation-only: drives the terminal success/failure treatments and the
  // retry/cancel actions that used to live inside Alert dialogs.
  const [outcome, setOutcome] = React.useState<Outcome>(null);
  const successNavTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- On-device anti-spoof (PAD) -------------------------------------------
  // The PAD model (loaded defensively; null until a real antispoof.tflite is
  // bundled + the app is rebuilt) and a per-session tracker that smooths the
  // frame processor's per-frame live scores into one spoof/live verdict. The
  // ref lets captureFaceForRecognition read the latest verdict without
  // re-creating its callback every render. `spoofWarning` drives a live badge.
  const spoof = useAntiSpoofModel();
  const spoofTracker = useSpoofTracker();
  const spoofTrackerRef = useRef(spoofTracker);
  spoofTrackerRef.current = spoofTracker;
  const [spoofWarning, setSpoofWarning] = React.useState(false);

  useEffect(() => {
    if (spoof.ready) console.log("[CameraStream] anti-spoof PAD active");
    else console.log("[CameraStream] anti-spoof unavailable:", spoof.error);
  }, [spoof.ready, spoof.error]);

  // Fold each frame's live score into the tracker; flip the live warning badge
  // once enough frames confirm (or clear) a replay.
  const onSpoofScore = React.useCallback((liveScore: number) => {
    const t = spoofTrackerRef.current;
    t.push(liveScore);
    const v = t.verdict();
    setSpoofWarning((prev) => (v.decided ? v.isSpoof : prev));
  }, []);

  // Blink liveness state machine (ref so the polling loop reads latest value)
  const sawEyesClosedRef = useRef(false);

  // ---- Challenge-liveness state machines (refs: read inside the detect loop) --
  // `currentAction` is mirrored into a ref so the async detect loop always sees
  // the latest expected action without re-subscribing. `emittedRef` debounces to
  // one emit per step. `liveMsg` is the live coaching string shown in liveness
  // mode. The per-action arming refs below enforce a genuine neutral→action
  // transition so nothing can complete without the user actually doing it.
  const currentActionRef = useRef<LivenessAction | null>(currentAction ?? null);
  const emittedRef = useRef(false);
  // Per-step NEUTRAL baseline for head pose. We average the first few in-position
  // frames of each step to learn THIS device's resting yaw/pitch (every phone has
  // a different offset), then measure SIGNED deviation from it. That's what makes
  // turn detection both noise-proof (the head must really move that far) and
  // direction-aware (left vs right is just the sign of the deviation).
  const baselineYawRef = useRef<number | null>(null);
  const baselinePitchRef = useRef<number | null>(null);
  const baselineSamplesRef = useRef(0);
  // Only fold SETTLED frames into the baseline (frame-to-frame pose delta small),
  // so a head still swinging back from the previous turn can't poison neutral.
  const prevYawRef = useRef<number | null>(null);
  const prevPitchRef = useRef<number | null>(null);
  // Frame-to-frame head motion, updated EVERY frame for EVERY action (unlike
  // prevYaw/Pitch which the pose baseline only updates on pose steps). Used to
  // reject a blink whose eye-closure is really a head-turn angle artifact.
  const motionYawRef = useRef<number | null>(null);
  const motionPitchRef = useRef<number | null>(null);
  const baselineWaitRef = useRef(0);
  // Every transient/expression action requires an explicit neutral→action
  // transition (arming) so a face that's ALREADY blinking / smiling / mouth-open
  // when the step starts can't pass without genuinely performing it.
  const blinkArmedRef = useRef(false); // saw eyes clearly OPEN
  const blinkPeakRef = useRef({ l: 0, r: 0 });
  const smileArmedRef = useRef(false); // saw a clearly NON-smiling face
  // Lowest smilingProbability seen this step = this face's NEUTRAL level. The
  // adaptive pass path fires on a clear RISE above it (smileRise), so faces whose
  // absolute probability never reaches smileProb (beards!) can still pass by
  // genuinely smiling.
  const minSmileRef = useRef(1);
  // Null-signal watchdog: epoch-ms since the CURRENT expression step has seen
  // ONLY null classification probabilities. Any real value clears it. When it
  // exceeds nullSignalTimeoutMs the step is undetectable on this device and we
  // fire onActionUnsupported (once — unsupportedEmittedRef).
  const nullSignalSinceRef = useRef<number | null>(null);
  const unsupportedEmittedRef = useRef(false);
  const onActionUnsupportedRef = useRef(onActionUnsupported);
  onActionUnsupportedRef.current = onActionUnsupported;
  // Epoch-ms at which the CURRENT step's pass condition first became continuously
  // true (turn/nod/smile). Reset to null on any frame the condition is
  // false, so only an UNBROKEN hold past LIVENESS.holdMs completes the step.
  const actionHoldStartRef = useRef<number | null>(null);
  const [liveMsg, setLiveMsg] = React.useState('Center your face to begin');

  // ---- Return-to-frontal capture gate (see FRONTAL_RETURN_DEG) ---------------
  // `lastActionRef` survives currentAction→null when the modal flips into
  // recognition, so we still know whether the FINAL action moved the head.
  // `settleYaw/PitchRef` hold the neutral pose to return to (copied from the
  // step's learned baseline at emit time). `waitingForFrontal` is true while we
  // hold off the capture, waiting for the head to face forward again.
  const lastActionRef = useRef<LivenessAction | null>(currentAction ?? null);
  const settleYawRef = useRef<number | null>(null);
  const settlePitchRef = useRef<number | null>(null);
  const frontalStreakRef = useRef(0);
  const [waitingForFrontal, setWaitingForFrontal] = React.useState(false);
  const waitingForFrontalRef = useRef(false);
  waitingForFrontalRef.current = waitingForFrontal;
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirror onVerifyingStart into a ref so captureFaceForRecognition can call it
  // without taking it as a dependency (keeps the recognizeNow effect stable).
  const onVerifyingStartRef = useRef(onVerifyingStart);
  onVerifyingStartRef.current = onVerifyingStart;
  // Tell the parent the moment the live camera is actually up (permission granted
  // + a device available — the exact condition that renders the real preview
  // instead of the "Allow camera access" gate). The liveness modal waits for this
  // before speaking the first step, so voice never plays over the permission gate.
  const onCameraReadyRef = useRef(onCameraReady);
  onCameraReadyRef.current = onCameraReady;

  // Reset the per-step machinery whenever the expected action changes.
  // Keyed on actionNonce (step index) too, so two consecutive same-action steps
  // still reset cleanly (a value-only dep wouldn't fire on blink→blink).
  useEffect(() => {
    currentActionRef.current = currentAction ?? null;
    if (currentAction) lastActionRef.current = currentAction;
    emittedRef.current = false;
    sawEyesClosedRef.current = false;
    blinkArmedRef.current = false;
    blinkPeakRef.current = { l: 0, r: 0 };
    smileArmedRef.current = false;
    minSmileRef.current = 1;
    nullSignalSinceRef.current = null;
    unsupportedEmittedRef.current = false;
    actionHoldStartRef.current = null;
    baselineYawRef.current = null;
    baselinePitchRef.current = null;
    baselineSamplesRef.current = 0;
    baselineWaitRef.current = 0;
    prevYawRef.current = null;
    prevPitchRef.current = null;
  }, [currentAction, actionNonce]);

  // When the challenge finishes, capture + recognize from THIS same live session.
  const recognizeFiredRef = useRef(false);

  // Multi-frame anti-spoof: the URI of the MOST RECENT detection-loop snapshot,
  // and the base64 frames collected at each PASSED liveness action. Sent to the
  // server alongside the final capture so anti-spoof judges the WHOLE session,
  // not just the last photo — if a screen/bezel entered any action frame it's
  // caught (see server verifyMulti). Best-effort: a frame that fails to encode
  // is simply skipped, never blocking verification.
  const latestFrameUriRef = useRef<string | null>(null);
  const challengeFramesRef = useRef<string[]>([]);
  // Was 4 — every extra frame is another full pass through face-back's
  // FaceNet(+ArcFace)+anti-spoof loop per check-in (see verify-face-multi's
  // per-frame loops), so this constant directly controls how much AI-inference
  // work each check-in costs the face-service. Capped to 2 (the most recent 2
  // action-confirmation frames) to roughly halve that per-request cost —
  // fewer independent looks at the face for anti-spoof to fuse across, a
  // deliberate security/latency tradeoff, not a bug.
  const MAX_CHALLENGE_FRAMES = 2;

  const captureChallengeFrame = React.useCallback(async () => {
    const uri = latestFrameUriRef.current;
    if (!uri) return;
    try {
      const raw = await fileUriToBase64(uri);
      const small = downscaleForUpload(raw);
      const frames = challengeFramesRef.current;
      frames.push(small);
      // Keep only the most recent few — enough for the aggregate PAD decision
      // without bloating the upload.
      if (frames.length > MAX_CHALLENGE_FRAMES) frames.shift();
    } catch (e) {
      // A single un-encodable frame must never derail the live challenge.
      console.warn('[CameraStream] challenge frame capture skipped:', e);
    }
  }, []);

  const askForPermissions = React.useCallback(() => {
    if (camPerm.hasPermission) {
      setPermsGranted((prev) => ({ ...prev, cam: true }));
      return;
    }
    camPerm.requestPermission().then((granted) => {
      setPermsGranted((prev) => ({ ...prev, cam: granted }));
      // Once Android marks Camera as "permanently denied" (USER_FIXED — after a
      // deny with "don't ask again", or two denials), requestPermission() no
      // longer shows a dialog and just resolves false, so tapping "Allow camera"
      // silently does nothing. Bounce the user to the app's settings page to
      // grant it manually; the hasPermission hook re-checks on return and the
      // live camera renders.
      if (!granted) {
        Linking.openSettings().catch(() => {});
      }
    }).catch((e) => {
      console.warn('CameraStream: camera permission request failed:', e);
      setPermsGranted((prev) => ({ ...prev, cam: false }));
      Linking.openSettings().catch(() => {});
    });
  }, [camPerm]);

  // `camPerm.hasPermission` (vision-camera's hook) already re-checks the real OS
  // permission on every AppState change — e.g. the user leaves this screen,
  // grants Camera from Settings, and comes back. But our own `permsGranted.cam`
  // was only ever set once (at mount / inside askForPermissions), so after
  // denying twice (Android then requires Settings) and granting there, this
  // screen kept showing "Allow camera access" forever even though the OS
  // permission was already granted. Mirror it here so the moment
  // camPerm.hasPermission flips true, the real camera renders.
  useEffect(() => {
    if (camPerm.hasPermission) {
      setPermsGranted((prev) => (prev.cam ? prev : { ...prev, cam: true }));
    }
  }, [camPerm.hasPermission]);


  useEffect(() => {
    const fetchUserId = async () => {
      const user_id = await getDefaultUserId();

      // Fallback to current user's ID from auth context if AsyncStorage fails
      if (!user_id && user) {
        console.log('Using user ID from auth context as fallback:', user.uid || user.id);
        setUserId(user.uid || user.id);
      } else {
        console.log('Setting user ID from AsyncStorage:', user_id);
        setUserId(user_id);
      }
    };
    fetchUserId();
  }, [user]);


  const [active, setActive] = React.useState<CameraPosition>("front");
  const device = useCameraDevice(active);
  // Low-resolution capture = much smaller snapshots = far faster ML Kit detection.
  // We only need to find/track a face, not a high-res photo — this is the single
  // biggest speed win available without frame processors.
  const format = useCameraFormat(device, [
    { videoResolution: { width: 1280, height: 720 } },
    { photoResolution: { width: 1280, height: 720 } },
  ]);

  // Signal "camera live" to the parent. This matches the `permsGranted.cam &&
  // device` condition that renders the actual <Camera> (vs the permission gate),
  // so the liveness modal only starts voice guidance once the preview is up — no
  // TTS over the "Allow camera access" screen.
  const cameraLive = permsGranted.cam && !!device;
  useEffect(() => {
    if (cameraLive) onCameraReadyRef.current?.();
  }, [cameraLive]);

  // Frame-processor detector config. MEMOIZED so the native plugin instance is
  // created once — re-creating it every render would stutter the pipeline. No
  // liveness action needs lip contours, so they stay off. autoMode makes the
  // native side scale bounds into window space → the framing checks below can
  // use screen dimensions directly.
  const faceDetectionOptions = React.useMemo(
    () => ({
      performanceMode: "fast" as const,
      classificationMode: "all" as const,
      contourMode: "none" as const,
      landmarkMode: "none" as const,
      trackingEnabled: false,
      minFaceSize: 0.1,
      autoMode: true,
      windowWidth: screenWidth,
      windowHeight: screenHeight,
    }),
    []
  );

  const setActiveCamera = () => {
    setActive((currentCamera) =>
      currentCamera === "front" ? "back" : "front"
    );
  };

  // Guards against overlapping detection passes / double captures.
  const isProcessing = useRef(false);
  const detectingRef = useRef(false);
  const [dbg, setDbg] = React.useState("starting…");
  const dbgTickRef = useRef(0);

  // Function to store face authentication result in database
  // Block + surface a spoof: the live session was judged a screen/photo replay.
  // Enforced immediately (no shadow mode). In liveness mode we bounce back so the
  // whole challenge restarts; otherwise the user gets Try again / Cancel.
  const handleSpoofDetected = React.useCallback(() => {
    setIsCapturingFace(false);
    setIsProcessingRecognition(false);
    // Internal state name only — nothing in the UI copy below says "spoof" or
    // otherwise reveals which defense fired (silent-detection: the employee
    // sees the same generic failure as any other unsuccessful verification).
    setOutcome('spoof');
    setAuthMessage('We could not verify your photo. Please try again.');
    haptic('error');
    speak('We could not verify your photo. Please try again.');
    showToast({
      type: 'error',
      title: 'Verification unsuccessful',
      message: 'We could not verify your photo. Please try again or contact your administrator.',
    });
    spoofTrackerRef.current.reset();
    if (livenessModeEnabled) {
      setTimeout(() => onVerificationFailure?.(), 1800);
    }
  }, [livenessModeEnabled, onVerificationFailure]);

  // Function to capture face image and send to backend
  const captureFaceForRecognition = React.useCallback(async () => {
  try {
    // Tell the modal real capture has begun → it shows the "Verifying…" veil now
    // (deferred until here when we were first waiting for the head to face forward).
    onVerifyingStartRef.current?.();
    // Set processing state immediately
    setIsCapturingFace(true);
    setIsProcessingRecognition(true);
    setAuthMessage("Processing facial recognition…");

    console.log('=== Starting Face Recognition ===');
    console.log('API URL:', `${getApiBaseUrl()}/attendance/verify-face`);
    console.log('Student ID:', userId);
    console.log('Timestamp:', new Date().toISOString());

    const startTime = Date.now();

    const photo = await cameraRef.current?.takePhoto({
      flash: 'off',
      enableShutterSound: false,
    });

    if (!photo) {
      throw new Error("Failed to capture image");
    }

    const fileUri = `file://${photo.path}`; // Android/iOS path

    const captureTime = Date.now();
    console.log('Image captured in:', captureTime - startTime, 'ms');
    console.log('Photo details:', {
      path: photo.path,
      width: photo.width,
      height: photo.height,
      fileSize: (photo as any).fileSize || 'unknown'
    });

    // Spot-check: /spot-checks/:id/respond is the SOLE authoritative verifier —
    // it independently re-runs identity + PAD + liveness against this exact
    // capture and never trusts what the client claims (see spotChecks.js). The
    // /attendance/verify-face round trip below was only ever a UX nicety
    // (instant "face not recognized" feedback mid-challenge); paying its full
    // network + face-match + PAD cost a SECOND time before the liveness nonce
    // gets adjudicated ate into the challenge's 45s TTL and occasionally
    // expired a nonce for an otherwise-genuine response (nonce_expired reads
    // identically to every other spot-check rejection: "Verification could
    // not be completed..."). Keep the on-device spoof gate (no network needed)
    // and hand the capture straight to the caller; skip the redundant server
    // round trip here entirely.
    if (attendanceType === 'spotcheck') {
      const spoofVerdict = spoofTrackerRef.current.verdict();
      if (spoofVerdict.decided && spoofVerdict.isSpoof) {
        console.log(
          '[CameraStream] SPOOF blocked (on-device, spot-check) — liveScore',
          spoofVerdict.liveScore.toFixed(3),
          'over',
          spoofVerdict.frames,
          'frames'
        );
        handleSpoofDetected();
        return;
      }
      setIsCapturingFace(false);
      setIsProcessingRecognition(false);

      // MULTI-FRAME anti-spoof for spot-checks. A single frame of a FRAME-
      // FILLING video replay sits right at the PAD model's decision boundary,
      // so it oscillates real/uncertain attempt-to-attempt (the "caught only a
      // few times out of ten" symptom). Capture a short BURST instead: because
      // the replayed video is PLAYING, frames ~220ms apart are DIFFERENT video
      // moments, giving the server's multi-frame PAD (/verify-face-multi →
      // predict_multi, where ANY confident-fake frame fails the whole attempt)
      // several decorrelated shots instead of one coin-flip. Fully defensive —
      // any burst hiccup falls back to the single frame, never breaking spot
      // checks.
      const spotFrames: string[] = [];
      try {
        const first = downscaleForUpload(await fileUriToBase64(fileUri));
        if (first) spotFrames.push(first);
      } catch (e) {
        console.error('[CameraStream] spot-check first-frame encode failed:', e);
      }
      const SPOT_BURST_EXTRA = 2;   // 2 more → 3 total
      const SPOT_BURST_GAP_MS = 220; // spans distinct moments of a playing replay
      for (let i = 0; i < SPOT_BURST_EXTRA; i += 1) {
        try {
          await new Promise((r) => setTimeout(r, SPOT_BURST_GAP_MS));
          const extra = await cameraRef.current?.takePhoto({ flash: 'off', enableShutterSound: false });
          if (!extra) continue;
          const b64 = downscaleForUpload(await fileUriToBase64(`file://${extra.path}`));
          if (b64) spotFrames.push(b64);
        } catch (e) {
          console.error('[CameraStream] spot-check burst frame failed (continuing):', e);
        }
      }
      // Array (burst) → server runs multi-frame PAD; single string / file uri →
      // unchanged single-frame path.
      const spotPayload: any = spotFrames.length > 1 ? spotFrames : (spotFrames[0] || fileUri);
      onVerificationSuccess?.(spotPayload);
      return;
    }

    // Create FormData immediately after capture. No user_id — the BACKEND
    // derives the identity from the auth token (so a missing/stale local id
    // can't break verification).
    const formData = new FormData();
    formData.append('face_image', {
      uri: fileUri,
      name: 'face.jpg',
      type: 'image/jpeg',
    } as any);
    // Tag the capture type so the server files it under the right folder
    // (in → checkin, out → checkout).
    formData.append('type', attendanceType || 'in');

    // WHICH physical device this capture came from — the anti-spoof model's
    // fake/real texture judgement is sensitive to each phone's camera
    // post-processing (sharpening/HDR/denoise vary a lot by manufacturer), so
    // a device-specific false-positive pattern is otherwise invisible to the
    // admin. Best-effort; a failed read just omits the fields.
    let deviceTelemetryForSpoof: { deviceId?: string; deviceModel?: string; manufacturer?: string } = {};
    try {
      deviceTelemetryForSpoof = await collectDeviceTelemetry();
      if (deviceTelemetryForSpoof.deviceId) formData.append('deviceId', deviceTelemetryForSpoof.deviceId);
      if (deviceTelemetryForSpoof.deviceModel) formData.append('deviceModel', deviceTelemetryForSpoof.deviceModel);
      if (deviceTelemetryForSpoof.manufacturer) formData.append('manufacturer', deviceTelemetryForSpoof.manufacturer);
    } catch (e) {
      console.warn('[CameraStream] device telemetry read failed (continuing without it):', e);
    }

    // Multi-frame anti-spoof: attach the frames captured at each liveness action
    // so the server judges the WHOLE session (a replay's screen/bezel caught in
    // ANY frame fails the attempt). Sent as a JSON array of base64 in `frames`;
    // absent/empty → server uses single-frame behaviour, exactly as before.
    const challengeFrames = challengeFramesRef.current.slice();
    challengeFramesRef.current = [];
    if (challengeFrames.length > 0) {
      try {
        formData.append('frames', JSON.stringify(challengeFrames));
      } catch (e) {
        console.warn('[CameraStream] could not attach challenge frames:', e);
      }
    }

    console.log(`FormData created (${challengeFrames.length} extra frame(s)), starting API call...`);

    // Call the BACKEND verify-face (NOT check.py directly): the server forwards
    // to the face engine and logs the attempt image for admin review.
    const authToken = await AsyncStorage.getItem('authToken');
    const apiStartTime = Date.now();

    // A bare fetch() had no timeout and no retry, so a single transient
    // network blip (tower handoff, brief WiFi drop, DNS hiccup — none of
    // which imply anything is actually wrong) threw a raw
    // "TypeError: Network request failed" straight into the catch block and
    // failed the WHOLE liveness challenge, forcing a full restart. One quick,
    // silent retry absorbs that; a genuinely unreachable backend still fails
    // the same way as before, just ~1s later.
    const buildRequest = () => {
      const retryForm = new FormData();
      retryForm.append('face_image', { uri: fileUri, name: 'face.jpg', type: 'image/jpeg' } as any);
      retryForm.append('type', attendanceType || 'in');
      if (deviceTelemetryForSpoof.deviceId) retryForm.append('deviceId', deviceTelemetryForSpoof.deviceId);
      if (deviceTelemetryForSpoof.deviceModel) retryForm.append('deviceModel', deviceTelemetryForSpoof.deviceModel);
      if (deviceTelemetryForSpoof.manufacturer) retryForm.append('manufacturer', deviceTelemetryForSpoof.manufacturer);
      return retryForm;
    };
    const FETCH_TIMEOUT_MS = 20000;
    const fetchOnce = async (body: FormData) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        return await fetch(`${getApiBaseUrl()}/attendance/verify-face`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            // Don't set Content-Type for FormData - React Native sets correct boundary
          },
          body,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    };

    let response: Response;
    try {
      response = await fetchOnce(formData);
    } catch (firstErr: any) {
      const isTransient = firstErr?.name === 'AbortError' || /network request failed/i.test(String(firstErr?.message || ''));
      if (!isTransient) throw firstErr;
      console.warn('[CameraStream] verify-face network hiccup, retrying once:', firstErr?.message);
      await new Promise((r) => setTimeout(r, 600));
      response = await fetchOnce(buildRequest());
    }
    const apiEndTime = Date.now();

    console.log('API call completed in:', apiEndTime - apiStartTime, 'ms');
    console.log('Total time from start:', apiEndTime - startTime, 'ms');
    console.log('Response status:', response.status);

    const data = await response.json();
    console.log('API Response:', data);

    setIsCapturingFace(false);
    setIsProcessingRecognition(false);

    // Unusable capture (too dark / too bright / blurry / face not found): the
    // server refused to judge the frame and asked for a recapture. This is NOT
    // a failed verification and NOT a spoof — guide the user and let them
    // immediately try again.
    if (data?.retry) {
      console.log('[CameraStream] server asked to recapture:', data.retryReason);
      const retryMsg = data.message || 'Could not read the photo clearly. Please try again.';
      setAuthMessage(retryMsg);
      haptic('impactLight');
      showToast({ type: 'warning', title: 'Please try again', message: retryMsg });
      if (livenessModeEnabled) {
        // Restart the liveness challenge so the recapture is bound to a fresh
        // live session.
        setTimeout(() => onVerificationFailure?.(), 1400);
      } else {
        // Re-arm the blink gate so the user can recapture right away.
        setTimeout(() => resetAuthentication(), 1400);
      }
      return;
    }

    // SERVER anti-spoof gate (authoritative). The backend ran the MiniFASNet PAD
    // model on this exact uploaded frame; if it judged a phone-screen / photo
    // replay, block regardless of match (the replayed face is real, so it would
    // otherwise pass recognition). The server has already logged the attempt for
    // the super-admin's "Fake Attempts" review.
    // Block ONLY on a CONFIDENT fake, exactly like the server does. The old
    // condition ALSO blocked whenever `spoof.available !== true` / `label !==
    // 'real'`, which under a check-in rush treated an OVERLOADED/unreachable
    // engine (which returns no PAD verdict) as a spoof and dead-ended the user
    // in a retry loop — the "white screen after the first liveness step". PAD
    // being unavailable carries no fraud signal (see the server's own comment in
    // routes/attendance.js), so it must never block on its own.
    const confidentFake =
      data?.spoof?.detected === true ||
      data?.spoof?.label === 'fake' ||
      data?.reason === 'spoof_verification_required';
    if (confidentFake) {
      console.log('[CameraStream] SERVER spoof block', data.spoof);
      if (data?.retry || data?.reason === 'spoof_verification_required') {
        setAuthMessage(data.message || 'Live camera verification could not be confirmed. Please try again.');
        showToast({ type: 'warning', title: 'Live verification required', message: data.message || 'Please use the live camera and try again.' });
        if (livenessModeEnabled) setTimeout(() => onVerificationFailure?.(), 1400);
      } else {
        handleSpoofDetected();
      }
      return;
    }

    // Face engine unreachable/overloaded (no identity verdict came back): NEVER
    // dead-end or loop the user. Hand the capture to the mark step, where the
    // server records the attendance and DEFERS the identity match to the
    // background re-verify job ("mark now, verify async"). A transient engine
    // outage during a check-in rush must never cost a genuine employee their
    // attendance — the match is confirmed after the fact instead.
    if (data?.reachable === false) {
      console.log('[CameraStream] face engine unreachable — proceeding to deferred mark');
      let deferredImg: string | undefined;
      try {
        deferredImg = downscaleForUpload(await fileUriToBase64(fileUri));
      } catch (_e) {
        deferredImg = undefined;
      }
      onVerificationSuccess?.(deferredImg || fileUri, livenessModeEnabled ? challengeFrames : undefined);
      return;
    }

    // On-device anti-spoof gate. Runs BEFORE the match check on purpose: a screen
    // replay shows the user's REAL face, so it would otherwise pass recognition.
    // If this live session was judged a replay, block it regardless of match.
    const spoofVerdict = spoofTrackerRef.current.verdict();
    if (spoofVerdict.decided && spoofVerdict.isSpoof) {
      console.log(
        '[CameraStream] SPOOF blocked — liveScore',
        spoofVerdict.liveScore.toFixed(3),
        'over',
        spoofVerdict.frames,
        'frames'
      );
      handleSpoofDetected();
      return;
    }

    if (response.ok && data.match) {

      const result = { success: true, message: "Verified", confidence: 95 };
      setRecognitionResult(result);
      setAuthMessage("Face recognition successful");
      const confidence = (data?.similarity * 100).toFixed(1); // "83.4"

      let imageForMark: string | undefined;
      try {
        const rawBase64 = await fileUriToBase64(fileUri);
        imageForMark = downscaleForUpload(rawBase64);
      } catch (e) {
        console.error('[CameraStream] could not base64-encode capture, marking without image:', e);
        imageForMark = undefined;
      }

      // Liveness-bound flow: identity confirmed on the SAME live session that
      // performed the challenge. Don't mark here (the screen marks once); just
      // hand the captured frame back so it's provably the live, recognized face.
      // Also forward `challengeFrames` (the OTHER frames from this session,
      // already sent to /verify-face above) so the screen's follow-up
      // /attendance/mark call can re-verify against the same multi-frame
      // evidence instead of just this one frame in isolation.
      if (livenessModeEnabled) {
        if (imageForMark) {
          onVerificationSuccess?.(imageForMark, challengeFrames);
        } else {
          onVerificationSuccess?.(fileUri, challengeFrames);
        }
        return;
      }

      // Show the success treatment, then hand off to the screen. The SCREEN
      // marks attendance (authenticated apiService.markAttendance with the
      // base64 capture) — the old in-component mark posted to an undefined
      // legacy URL with no auth token and no image, so it could never succeed
      // and would have double-marked if it ever did.
      setTimeout(() => {
        setOutcome('success');
        haptic('success');
        showToast({
          type: 'success',
          title: 'Face verified',
          message: `Face verified with ${confidence}% confidence`,
        });
        successNavTimer.current = setTimeout(() => {
          console.log('[CameraStream] Success treatment shown, calling success callback');
          if (onVerificationSuccess) {
            console.log('[CameraStream] Calling onVerificationSuccess callback');
            onVerificationSuccess(imageForMark);
          } else {
            console.log('[CameraStream] No callback provided, navigating back to AttendanceScreen');
            navigation.goBack();
          }
        }, 1200);
      }, 500);
    } else {
      // `data.reason` is a machine-readable code (may be 'spoof_detected',
      // 'no_match', a quality token, ...) — never render it directly, it can
      // leak which security layer rejected the attempt.
      const result = { success: false, message: 'We could not verify your photo. Please try again.' };
      setRecognitionResult(result);
      setAuthMessage('We could not verify your photo. Please try again.');

      // Liveness-bound flow: face didn't match — bounce back so the challenge
      // restarts fresh (the whole liveness+identity check must be redone live).
      if (livenessModeEnabled) {
        haptic('error');
        onVerificationFailure?.();
        return;
      }

      // Show the failure treatment briefly, then redirect back to the attendance
      // screen (per product: a failed verify returns the user to attendance).
      setTimeout(() => {
        setOutcome('auth_failed');
        haptic('error');
        showToast({
          type: 'error',
          title: 'Authentication failed',
          message: 'Face verification failed. Returning to attendance.',
        });
      }, 500);
      setTimeout(() => {
        onVerificationFailure?.();
      }, 1600);
    }
  } catch (error) {
    console.error('Face capture error:', error);
    setIsCapturingFace(false);
    setIsProcessingRecognition(false);
    // A dropped/weak connection during the verify-face round trip used to read
    // identically to an actual recognition failure ("Recognition failed.
    // Please try again.") — nothing told the user WHAT to fix, so on poor
    // signal this could repeat indefinitely with no clue it was connectivity.
    const msg = error instanceof Error ? error.message : String(error);
    if (isNetworkError(msg)) {
      setAuthMessage("You're offline. Please connect your network.");
      showToast({
        type: 'error',
        title: "You're offline",
        message: 'Please connect your network and try again.',
      });
    } else {
      setAuthMessage("Recognition failed. Please try again.");
    }
    if (livenessModeEnabled) onVerificationFailure?.();
  }
}, [userId, attendanceType, currentLocation, onVerificationSuccess, onVerificationFailure, navigation, livenessModeEnabled, handleSpoofDetected]);

  // Liveness → recognition binding: the moment the challenge completes, grab the
  // current live frame and recognize it (fires once per recognizeNow rising edge).
  useEffect(() => {
    if (recognizeNow && livenessModeEnabled) {
      if (recognizeFiredRef.current || waitingForFrontalRef.current) return;
      // If the FINAL action turned/nodded the head, DON'T grab the photo yet — a
      // non-frontal face fails recognition (the "authentication failed" the user
      // saw). Wait (visibly) for them to face forward again, then capture. Smile /
      // blink keep the face frontal, so those capture immediately.
      if (isPoseAction(lastActionRef.current) && settleYawRef.current != null) {
        frontalStreakRef.current = 0;
        setWaitingForFrontal(true);
        setLiveMsg('Face forward to finish');
        speak('Almost done. Please face forward.');
        if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
        settleTimerRef.current = setTimeout(() => {
          // Never hang: capture even if they never perfectly re-centred.
          if (!recognizeFiredRef.current) {
            recognizeFiredRef.current = true;
            setWaitingForFrontal(false);
            captureFaceForRecognition();
          }
        }, SETTLE_MAX_WAIT_MS);
      } else {
        recognizeFiredRef.current = true;
        captureFaceForRecognition();
      }
    } else if (!recognizeNow) {
      recognizeFiredRef.current = false;
      // Fresh challenge (or a restart after failure) — drop any frames collected
      // from the previous run so they can't leak into the next attempt's bundle.
      challengeFramesRef.current = [];
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
      setWaitingForFrontal(false);
    }
  }, [recognizeNow, livenessModeEnabled, captureFaceForRecognition]);


  // Function to send face data to backend
  const sendFaceToBackend = async (): Promise<{
    success: boolean;
    message: string;
    confidence?: number;
  }> => {
    try {
      if (config.demoMode) {
        // Demo mode - simulate successful response
        await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate network delay
        return {
          success: true,
          message: 'Demo: Face recognized successfully',
          confidence: 92,
        };
      }

      // Create FormData for file upload
      const formData = new FormData();
      formData.append('user_id', userId);

      // For React Native, we'll use a different approach for image data
      // This is a placeholder - in a real implementation, you would:
      // 1. Use react-native-vision-camera to take a photo
      // 2. Get the file URI
      // 3. Append it to FormData properly

      // Placeholder image data (replace with actual camera capture)
      const imageUri = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxAAPwCdABmX/9k=';

      // For React Native, create the file object manually
      const imageFile = {
        uri: imageUri,
        type: 'image/jpeg',
        name: 'face_capture.jpg',
      };

      formData.append('face_image', imageFile as any);

       const authToken2 = await AsyncStorage.getItem('authToken');
       const response = await fetch(`${getApiBaseUrl()}/attendance/verify-face`, {
        method: 'POST',
        headers: authToken2 ? { Authorization: `Bearer ${authToken2}` } : undefined,
        body: formData,
      });


      const data = await response.json() as any;
      console.log('Backend response:', data);
      if (response.ok) {
        if (data.match) {
          return {
            success: true,
            message: 'Face verified successfully',
            confidence: 95, // Your backend doesn't return confidence, so we'll use a default
          };
        } else {
          // Same rule as above — `data.reason` is machine-readable, not for display.
          return {
            success: false,
            message: 'We could not verify your photo. Please try again.',
          };
        }
      } else {
        return {
          success: false,
          message: data.error || 'Verification failed',
        };
      }
    } catch (error) {
      console.error('Backend communication error:', error);
      return {
        success: false,
        message: 'Network error. Please check your connection.',
      };
    }
  };

  // ---- Challenge liveness: detect the ONE currently-expected action ---------
  // Fires onActionDetected exactly once per step (debounced by emittedRef).
  // Expression actions (blink/smile) require a neutral→action
  // transition; pose actions (turn/nod) require a signed deviation from a learned
  // neutral baseline — so no action can complete unless the user actually does it.
  const detectLivenessAction = React.useCallback(
    (face: Face) => {
      const action = currentActionRef.current;
      if (!action || emittedRef.current) return;

      const emit = (confidence: number, doneMsg: string) => {
        emittedRef.current = true;
        // For a head-pose action, remember the neutral pose to return to so that
        // if this is the LAST step the recognition photo is taken facing forward.
        if (isPoseAction(action)) {
          settleYawRef.current = baselineYawRef.current;
          settlePitchRef.current = baselinePitchRef.current;
        }
        setLiveMsg(doneMsg);
        // Raw sensor magnitudes for the server's liveness adjudication
        // (livenessService._actionMagnitudeOk). eyeBlink = closedness (1-open),
        // matching the server's "blink peak" convention. MLKit has one smile
        // probability, reported as both L/R. The turn detector is now
        // DIRECTION-AWARE and LIVENESS_YAW_SIGN is calibrated to the server's
        // convention (+yaw = right), so report the REAL signed deviation — the
        // server then independently re-checks direction (turn_left needs
        // yaw ≤ −15, turn_right ≥ +15) instead of trusting a fabricated sign.
        const emitYaw = yaw - (baselineYawRef.current ?? 0);
        const emitPitch = pitch - (baselinePitchRef.current ?? 0);
        const magnitudes = {
          eyeBlinkL:
            action === 'blink' ? blinkPeakRef.current.l : 1 - (face.leftEyeOpenProbability ?? 1),
          eyeBlinkR:
            action === 'blink' ? blinkPeakRef.current.r : 1 - (face.rightEyeOpenProbability ?? 1),
          smileL: face.smilingProbability ?? 0,
          smileR: face.smilingProbability ?? 0,
          yawDeg: emitYaw,
          pitchDeg: emitPitch,
        };
        // Grab the frame this action was confirmed on for the multi-frame
        // anti-spoof bundle (fire-and-forget — never blocks the challenge).
        captureChallengeFrame();
        onActionDetected?.(action, Math.max(0, Math.min(1, confidence)), magnitudes);
      };

      // Sustained-action gate. Returns true only once `ok` (the action's pass
      // condition) has been continuously true for LIVENESS.holdMs. Any false frame
      // resets the timer, so a one-frame noise spike or a brief random movement can
      // never complete a step — the user must genuinely hold the requested action.
      // (Blink is exempt: it's a fast transition, not a held pose, so it keeps its
      // own open→closed→open cycle below.)
      const held = (ok: boolean): boolean => {
        if (!ok) {
          actionHoldStartRef.current = null;
          return false;
        }
        const now = Date.now();
        if (actionHoldStartRef.current == null) actionHoldStartRef.current = now;
        return now - actionHoldStartRef.current >= LIVENESS.holdMs;
      };

      const yaw = (face.rotationY ?? 0) * LIVENESS_YAW_SIGN;
      const pitch = (face.rotationX ?? 0) * LIVENESS_PITCH_SIGN;
      const avgOpen =
        ((face.leftEyeOpenProbability ?? 1) + (face.rightEyeOpenProbability ?? 1)) / 2;

      // Is the head actively moving this frame? (updated every frame, every action)
      const headMoving =
        (motionYawRef.current != null &&
          Math.abs(yaw - motionYawRef.current) > LIVENESS.blinkStillDeg) ||
        (motionPitchRef.current != null &&
          Math.abs(pitch - motionPitchRef.current) > LIVENESS.blinkStillDeg);
      motionYawRef.current = yaw;
      motionPitchRef.current = pitch;

      // Null-signal watchdog for expression steps: some devices/detector builds
      // never fill the classification probabilities (they arrive null on every
      // frame) — the step is then IMPOSSIBLE, not merely "not performed yet".
      // After nullSignalTimeoutMs of only-null frames, report it upward so the
      // modal swaps this step for a pose action. Any real value cancels it.
      const trackNullSignal = (isNull: boolean): boolean => {
        if (!isNull) {
          nullSignalSinceRef.current = null;
          return false;
        }
        const now = Date.now();
        if (nullSignalSinceRef.current == null) nullSignalSinceRef.current = now;
        if (
          now - nullSignalSinceRef.current >= LIVENESS.nullSignalTimeoutMs &&
          !unsupportedEmittedRef.current
        ) {
          unsupportedEmittedRef.current = true;
          setLiveMsg('Switching to a different step…');
          onActionUnsupportedRef.current?.(action);
        }
        return true;
      };

      // ── Transient / expression actions ─────────────────────────────────────
      // No pose baseline → these detect IMMEDIATELY (fast). Each requires an
      // explicit neutral→action transition (arming) so a face that is ALREADY
      // blinking / smiling / mouth-open when the step begins can't pass for free.
      // That arming replaces the baseline's "first frame can't auto-complete"
      // guarantee for these actions.
      switch (action) {
        case 'blink': {
          if (
            trackNullSignal(
              face.leftEyeOpenProbability == null && face.rightEyeOpenProbability == null
            )
          ) {
            setLiveMsg('Blink your eyes');
            return;
          }
          // A blink done WHILE turning/nodding is almost always an eye-open
          // angle artifact, not a real blink — ignore the whole cycle then, so
          // "move your head" can't pass a blink step.
          if (headMoving) {
            setLiveMsg('Hold still and blink');
            return;
          }
          // Real cycle: clearly OPEN (arm) → CLOSED → OPEN.
          if (avgOpen > LIVENESS.blinkArmOpen) blinkArmedRef.current = true;
          if (blinkArmedRef.current && avgOpen < LIVENESS.blinkClosed) {
            sawEyesClosedRef.current = true;
            blinkPeakRef.current = {
              l: Math.max(blinkPeakRef.current.l, 1 - (face.leftEyeOpenProbability ?? 1)),
              r: Math.max(blinkPeakRef.current.r, 1 - (face.rightEyeOpenProbability ?? 1)),
            };
            setLiveMsg('Hold… now open your eyes');
          } else if (avgOpen > LIVENESS.blinkOpen && sawEyesClosedRef.current) {
            emit(0.9, 'Blink detected ✓');
          } else {
            setLiveMsg('Blink your eyes');
          }
          return;
        }
        case 'smile': {
          if (trackNullSignal(face.smilingProbability == null)) {
            setLiveMsg('Smile at the camera');
            return;
          }
          // Must see a clearly NON-smiling face first, then HOLD a smile briefly.
          // Passes on EITHER the absolute threshold OR a clear rise above this
          // face's own observed neutral (adaptive — beards depress the absolute
          // probability, so "your smile vs your neutral" is the reliable signal).
          const p = face.smilingProbability ?? 0;
          minSmileRef.current = Math.min(minSmileRef.current, p);
          if (p < LIVENESS.smileArmBelow) smileArmedRef.current = true;
          const smiling =
            smileArmedRef.current &&
            (p >= LIVENESS.smileProb ||
              (p >= LIVENESS.smileFloor && p - minSmileRef.current >= LIVENESS.smileRise));
          if (held(smiling)) emit(p, 'Smile detected ✓');
          else if (!smileArmedRef.current) setLiveMsg('Relax your face, then smile');
          else if (smiling) setLiveMsg('Keep smiling…');
          else setLiveMsg('Smile at the camera');
          return;
        }
      }

      // ── Pose actions (turn_left / turn_right / nod) ─────────────────────────
      // Learn a NEUTRAL baseline from SETTLED frames only (small frame-to-frame
      // pose delta), then measure signed deviation. Rejecting unsettled frames
      // keeps a head still swinging back from the previous step out of the
      // baseline — otherwise it shifts the zero-point and the next turn/nod misses.
      const dyFrame = prevYawRef.current == null ? Infinity : Math.abs(yaw - prevYawRef.current);
      const dpFrame =
        prevPitchRef.current == null ? Infinity : Math.abs(pitch - prevPitchRef.current);
      prevYawRef.current = yaw;
      prevPitchRef.current = pitch;

      if (baselineSamplesRef.current < LIVENESS.baselineSamples) {
        const settled =
          dyFrame < LIVENESS.baselineStableDeg && dpFrame < LIVENESS.baselineStableDeg;
        baselineWaitRef.current += 1;
        // Wait for a settled head, but never hang forever — accept after maxWait.
        if (!settled && baselineWaitRef.current < LIVENESS.baselineMaxWait) {
          setLiveMsg('Hold still…');
          return;
        }
        const n = baselineSamplesRef.current;
        baselineYawRef.current = ((baselineYawRef.current ?? 0) * n + yaw) / (n + 1);
        baselinePitchRef.current = ((baselinePitchRef.current ?? 0) * n + pitch) / (n + 1);
        baselineSamplesRef.current = n + 1;
        setLiveMsg('Hold still…');
        return;
      }

      // Signed deviation from the learned neutral. dYaw > 0 ⇒ turned RIGHT.
      const dYaw = yaw - (baselineYawRef.current ?? 0);
      const dPitch = pitch - (baselinePitchRef.current ?? 0);

      switch (action) {
        case 'turn_right':
        case 'turn_left': {
          // DIRECTION-AWARE. `dYaw` is the SIGNED deviation from the learned
          // neutral, with LIVENESS_YAW_SIGN calibrated so +dYaw = the user turned
          // RIGHT and −dYaw = LEFT. Turning the WRONG way must NOT pass — that is
          // the entire point of a randomized left/right challenge (magnitude-only
          // let a left turn satisfy "turn right" and vice-versa). Deviation from
          // the per-step baseline still can't be faked by sensor noise or a static
          // photo — the head must really move that far, in the requested direction.
          // NOTE: if genuine right/left turns read as the OPPOSITE on this device,
          // flip LIVENESS_YAW_SIGN (one constant, hot-reloadable) — do not go back
          // to magnitude-only.
          const turning =
            action === 'turn_right'
              ? dYaw >= LIVENESS.yawTurnDeg
              : dYaw <= -LIVENESS.yawTurnDeg;
          const wrongWay =
            action === 'turn_right'
              ? dYaw <= -LIVENESS.yawTurnDeg
              : dYaw >= LIVENESS.yawTurnDeg;
          if (held(turning)) {
            emit(Math.min(1, Math.abs(dYaw) / 30), 'Turn detected ✓');
          } else if (turning) {
            setLiveMsg('Hold it…');
          } else if (wrongWay) {
            setLiveMsg(
              action === 'turn_right'
                ? 'Other way — turn your face RIGHT →'
                : '← Other way — turn your face LEFT'
            );
          } else {
            setLiveMsg(
              action === 'turn_right'
                ? 'Turn your face to the right →'
                : '← Turn your face to the left'
            );
          }
          break;
        }
        case 'nod': {
          // Vertical only — no left/right ambiguity, so MAGNITUDE is enough and the
          // pitch sign is irrelevant. Must HOLD the dip so a single noisy frame
          // (or random head motion) can't complete it.
          const nodding = Math.abs(dPitch) >= LIVENESS.pitchNodDeg;
          if (held(nodding)) emit(Math.min(1, Math.abs(dPitch) / 25), 'Nod detected ✓');
          else if (nodding) setLiveMsg('Hold it…');
          else setLiveMsg('Nod your head down');
          break;
        }
      }
    },
    [onActionDetected]
  );

  // Return-to-frontal gate: while we're holding off the recognition capture after
  // a turn/nod last step, fire the capture only once the face is genuinely facing
  // forward again (back near the step's neutral pose), held for a couple of frames.
  const checkReturnToFrontal = React.useCallback(
    (face: Face) => {
      if (recognizeFiredRef.current) return;
      const yaw = (face.rotationY ?? 0) * LIVENESS_YAW_SIGN;
      const pitch = (face.rotationX ?? 0) * LIVENESS_PITCH_SIGN;
      const avgOpen =
        ((face.leftEyeOpenProbability ?? 1) + (face.rightEyeOpenProbability ?? 1)) / 2;
      const dYaw = Math.abs(yaw - (settleYawRef.current ?? 0));
      const dPitch = Math.abs(pitch - (settlePitchRef.current ?? 0));
      const frontal =
        dYaw <= FRONTAL_RETURN_DEG && dPitch <= FRONTAL_RETURN_DEG && avgOpen > 0.4;
      if (frontal) {
        frontalStreakRef.current += 1;
        setLiveMsg('Hold still — verifying');
        if (frontalStreakRef.current >= FRONTAL_STREAK) {
          recognizeFiredRef.current = true;
          if (settleTimerRef.current) {
            clearTimeout(settleTimerRef.current);
            settleTimerRef.current = null;
          }
          setWaitingForFrontal(false);
          captureFaceForRecognition();
        }
      } else {
        frontalStreakRef.current = 0;
        setLiveMsg('Face forward to finish');
      }
    },
    [captureFaceForRecognition]
  );

  // ---- ML Kit based liveness + positioning ---------------------------------
  // Evaluate one detection result: confirm a single, well-framed face is
  // present and run a simple blink challenge using ML Kit eye-open probabilities.
  const handleFaces = React.useCallback(
    (faces: Face[], imgW: number, imgH: number) => {
      if (isAuthenticated || isProcessing.current) {
        return;
      }

      if (!faces || faces.length === 0) {
        setIsFaceInPosition(false);
        setAuthMessage("No face detected");
        // Don't wipe the liveness blink state on a transient drop: ML Kit often
        // loses the face on the fully-closed-eye frame, which is the worst moment
        // to forget we just saw the eyes close. The per-step reset handles it.
        if (!livenessModeEnabled) sawEyesClosedRef.current = false;
        return;
      }

      if (faces.length > 1) {
        setIsFaceInPosition(false);
        setAuthMessage("Multiple faces detected — only one person, please");
        if (!livenessModeEnabled) sawEyesClosedRef.current = false;
        return;
      }

      const face = faces[0];
      const { frame } = face;

      // ── "Face placed in the circle" check ───────────────────────────────────
      // With the frame processor, face bounds are in WINDOW (screen) space, so we
      // test the real liveness-circle geometry — the green ring then means the face
      // is genuinely inside the circle, not just "a face exists somewhere". The iOS
      // snapshot path reports IMAGE-space bounds, so it uses (tightened) ratios.
      // We stay forgiving enough that a turning/nodding head — whose box narrows
      // and shifts — doesn't drop out of position mid-action and pause detection.
      const windowSpace =
        livenessModeEnabled && imgW === screenWidth && imgH === screenHeight;

      let isCentered: boolean;
      let isProperSize: boolean;
      let tooFar: boolean;
      let tooClose: boolean;

      if (windowSpace) {
        const faceCx = frame.left + frame.width / 2;
        const faceCy = frame.top + frame.height / 2;
        const dist = Math.hypot(faceCx - LIVE_CX, faceCy - LIVE_CY);
        isCentered = dist <= LIVE_R * 0.8; // centre must sit well within the ring
        tooFar = frame.width < LIVE_D * 0.4;
        tooClose = frame.width > LIVE_D * 1.45;
        isProperSize = !tooFar && !tooClose;
      } else {
        const sizeRatio = frame.width / imgW;
        const centerX = frame.left + frame.width / 2;
        const centerY = frame.top + frame.height / 2;
        const offsetX = Math.abs(centerX - imgW / 2) / imgW;
        const offsetY = Math.abs(centerY - imgH / 2) / imgH;
        // iOS takePhoto has a much wider field of view than the on-screen preview,
        // so the face is a smaller fraction of the frame than it looks — hence the
        // smaller iOS min size. Liveness thresholds here are TIGHTENED from before
        // (was centerTol 0.5 / minSize 0.06) so the ring only greens when the face
        // is actually centred in the circle, not for any face anywhere in frame.
        const minSize =
          Platform.OS === "ios"
            ? livenessModeEnabled
              ? 0.11
              : 0.06
            : livenessModeEnabled
              ? 0.1
              : FACE_SIZE_MIN_RATIO;
        const maxSize =
          Platform.OS === "ios" ? 0.98 : livenessModeEnabled ? 0.97 : FACE_SIZE_MAX_RATIO;
        const centerTol =
          Platform.OS === "ios"
            ? livenessModeEnabled
              ? 0.3
              : 0.5
            : livenessModeEnabled
              ? 0.3
              : CENTER_TOLERANCE_RATIO;
        isCentered = offsetX < centerTol && offsetY < centerTol;
        isProperSize = sizeRatio >= minSize && sizeRatio <= maxSize;
        tooFar = sizeRatio < minSize;
        tooClose = sizeRatio > maxSize;
      }

      if (!isCentered || !isProperSize) {
        setIsFaceInPosition(false);
        if (!livenessModeEnabled) sawEyesClosedRef.current = false;
        if (tooFar) {
          setAuthMessage("Move closer to the camera");
        } else if (tooClose) {
          setAuthMessage("Move away from the camera");
        } else {
          setAuthMessage(
            livenessModeEnabled
              ? "Center your face in the circle"
              : "Center your face in the oval"
          );
        }
        return;
      }

      setIsFaceInPosition(true);

      // Liveness-challenge mode: detect ONLY the action the challenge expects and
      // report it upward. No face-recognition/auth capture happens here. Once the
      // last action is done and we're waiting for the head to return to frontal,
      // route frames to that gate instead (it fires the capture when facing front).
      if (livenessModeEnabled) {
        if (waitingForFrontalRef.current) checkReturnToFrontal(face);
        else detectLivenessAction(face);
        return;
      }

      // Blink challenge using eye-open probabilities (classificationMode: 'all').
      const left = face.leftEyeOpenProbability ?? 1;
      const right = face.rightEyeOpenProbability ?? 1;
      const avgOpen = (left + right) / 2;

      if (avgOpen < EYES_CLOSED_THRESHOLD) {
        sawEyesClosedRef.current = true;
        setAuthMessage("Hold still — blink detected");
      } else if (avgOpen > EYES_OPEN_THRESHOLD && sawEyesClosedRef.current) {
        // Saw a closed -> open transition: a blink. Authenticate and capture.
        sawEyesClosedRef.current = false;
        setBlinkCount(REQUIRED_BLINKS);
        setIsAuthenticated(true);
        captureFaceForRecognition();
      } else {
        setAuthMessage(
          `Blink your eyes to verify (${blinkCount}/${REQUIRED_BLINKS})`
        );
      }
    },
    [isAuthenticated, blinkCount, captureFaceForRecognition, livenessModeEnabled, detectLivenessAction, checkReturnToFrontal]
  );

  // Frame-processor callback. The plugin has already hopped back to the JS thread
  // by the time this runs (via Worklets.createRunOnJS inside its Camera wrapper),
  // so we can touch React state freely here. Map the plugin faces onto the ML Kit
  // shape and feed the SAME handleFaces pipeline the snapshot loop uses. autoMode
  // gives us window-space bounds, so the image size is the screen size.
  const onFacesDetected = React.useCallback(
    (faces: PluginFace[]) => {
      if (!frameProcessorAvailable) return;
      const mapped = faces.map(mapPluginFace);
      handleFaces(mapped, screenWidth, screenHeight);
      // Dev calibration readout (same data the snapshot loop logged).
      if (livenessModeEnabled) {
        const pf = faces[0];
        if (pf) {
          const eyeAvg =
            ((pf.leftEyeOpenProbability ?? 1) + (pf.rightEyeOpenProbability ?? 1)) / 2;
          const line = `FP faces ${faces.length} · yaw ${(pf.yawAngle ?? 0).toFixed(
            0
          )} pit ${(pf.pitchAngle ?? 0).toFixed(0)} eye ${eyeAvg.toFixed(2)} smi ${(
            pf.smilingProbability ?? 0
          ).toFixed(2)}`;
          if (SHOW_DETECTION_DEBUG) setDbg(line);
          console.log(`[liveness] ${line}`);
        } else {
          console.log(`[liveness] FP faces 0`);
        }
      }
    },
    [handleFaces, livenessModeEnabled]
  );

  // Manual capture fallback (in case the blink challenge doesn't trigger).
  const handleManualCapture = React.useCallback(() => {
    if (isAuthenticated || isCapturingFace || isProcessing.current) {
      return;
    }
    setIsAuthenticated(true);
    captureFaceForRecognition();
  }, [isAuthenticated, isCapturingFace, captureFaceForRecognition]);

  // Reset authentication
  const resetAuthentication = () => {
    setIsAuthenticated(false);
    setBlinkCount(0);
    setIsFaceInPosition(false);
    setAuthMessage("Position your face in the oval");
    sawEyesClosedRef.current = false;
    isProcessing.current = false;
    setIsCapturingFace(false);
    setIsProcessingRecognition(false);
    setRecognitionResult(null);
    setCapturedImageData(null);
    setOutcome(null);
    spoofTrackerRef.current.reset();
    setSpoofWarning(false);
    console.log('Authentication reset');
  };

  // Cancel from a failure state (used to live on the Alert's Cancel button).
  const handleCancelAfterFailure = React.useCallback(() => {
    if (onVerificationFailure) {
      onVerificationFailure();
    } else {
      navigation.goBack();
    }
  }, [onVerificationFailure, navigation]);

  // Poll the camera and run ML Kit face detection on each snapshot.
  // FALLBACK ONLY: when the frame processor is active it owns detection, so this
  // loop stays dormant (otherwise both would run and double-capture).
  useEffect(() => {
    if (frameProcessorAvailable) return;
    if (!permsGranted.cam || !device) {
      return;
    }
    let cancelled = false;

    const tick = async () => {
      if (
        cancelled ||
        detectingRef.current ||
        isProcessing.current ||
        isAuthenticated ||
        isCapturingFace ||
        !cameraRef.current
      ) {
        return;
      }
      detectingRef.current = true;
      const tickNo = ++dbgTickRef.current;
      let dbgLine = "";
      try {
        // VisionCamera's takeSnapshot is Android-only; on iOS it throws, which
        // previously broke face detection (every pass failed silently). Use
        // takePhoto on iOS instead — the Camera already has `photo` enabled.
        // DEBUG_TIMING is only ever consumed by the dbgLine string built below
        // (shown via setDbg, gated by SHOW_DETECTION_DEBUG — hardcoded false —
        // or logged via console.log, stripped entirely from release builds by
        // babel's transform-remove-console). In production neither consumer
        // exists, so t0/capMs were pure dead work on every single tick of this
        // loop — up to ~8 times/second during a liveness challenge. Gating the
        // whole debug block on __DEV__ keeps it available for the on-device
        // threshold calibration the comments below describe, at zero cost in
        // what actually ships.
        const DEBUG_TIMING = __DEV__ || SHOW_DETECTION_DEBUG;
        const frame =
          Platform.OS === "ios"
            ? await cameraRef.current.takePhoto({
                flash: "off",
                enableShutterSound: false,
                qualityPrioritization: "speed",
              })
            : await cameraRef.current.takeSnapshot({ quality: 35 });
        const uri = frame.path.startsWith("file://")
          ? frame.path
          : `file://${frame.path}`;
        // Remember this frame so a passed liveness action can grab it for the
        // multi-frame anti-spoof upload (captureChallengeFrame).
        latestFrameUriRef.current = uri;
        const t1 = DEBUG_TIMING ? Date.now() : 0;
        const faces = await FaceDetection.detect(uri, {
          performanceMode: "fast",
          classificationMode: "all",
          landmarkMode: "none",
          // No liveness action needs lip contours (pricey, ~700ms/frame, which
          // would make fast blinks hard to catch), so they stay off.
          contourMode: "none",
        });
        // On iOS the native detector downscales the takePhoto buffer to max 1080px
        // and rotates the face upright before detection, so MLKit's coordinates are
        // in that smaller portrait space. Mirror the exact transform here (must stay
        // in sync with FaceDetection.m's maxDim) so the framing ratios line up.
        let imgW = frame.width;
        let imgH = frame.height;
        if (Platform.OS === "ios") {
          let w = frame.width;
          let h = frame.height;
          if (w > h) {
            const t = w;
            w = h;
            h = t;
          }
          const MAX_DIM = 1080;
          const scale = Math.min(1, MAX_DIM / Math.max(w, h));
          imgW = Math.round(w * scale);
          imgH = Math.round(h * scale);
        }
        if (DEBUG_TIMING) {
          const detMs = Date.now() - t1;
          dbgLine = `cap ${frame.width}x${frame.height} · faces ${
            faces?.length ?? 0
          } ${detMs}ms`;
          if (faces?.length === 1) {
            const fw = faces[0].frame.width;
            dbgLine += ` · size ${(fw / imgW).toFixed(2)} (need 0.22-0.9)`;
            // Live signal readout for calibrating liveness thresholds on device.
            if (livenessModeEnabled) {
              const f = faces[0];
              const eyeAvg =
                ((f.leftEyeOpenProbability ?? 1) + (f.rightEyeOpenProbability ?? 1)) / 2;
              dbgLine += ` · yaw ${(f.rotationY ?? 0).toFixed(0)} pit ${(
                f.rotationX ?? 0
              ).toFixed(0)} eye ${eyeAvg.toFixed(2)} smi ${(f.smilingProbability ?? 0).toFixed(
                2
              )}`;
            }
          }
        }
        if (!cancelled) {
          handleFaces(faces, imgW, imgH);
        }
      } catch (e: any) {
        dbgLine = `ERR ${(e?.message ?? String(e)).slice(0, 90)}`;
        // A failed snapshot/detect must NOT leave a stale green "face in position"
        // ring when the face is actually gone (common on some Android devices).
        if (!cancelled) {
          setIsFaceInPosition(false);
          sawEyesClosedRef.current = false;
        }
      } finally {
        detectingRef.current = false;
        if (!cancelled && SHOW_DETECTION_DEBUG) setDbg(`#${tickNo} ${dbgLine}`);
        // Mirror signals to logcat during a challenge so thresholds (yaw/pitch
        // sign, mouth ratio) can be calibrated from a connected machine.
        if (livenessModeEnabled) console.log(`[liveness] ${dbgLine}`);
      }
    };

    const intervalId = setInterval(
      tick,
      livenessModeEnabled ? LIVENESS_POLL_INTERVAL_MS : POLL_INTERVAL_MS
    );
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [permsGranted.cam, device, isAuthenticated, isCapturingFace, handleFaces, livenessModeEnabled]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      isProcessing.current = false;
      if (successNavTimer.current) {
        clearTimeout(successNavTimer.current);
      }
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
      }
    };
  }, []);

  // ---- Presentation-only derived state -------------------------------------
  const searching =
    !isFaceInPosition && !isAuthenticated && !recognitionResult && !isCapturingFace;

  const guideColor =
    recognitionResult && !recognitionResult.success
      ? colors.danger
      : isAuthenticated || recognitionResult?.success || isFaceInPosition
        ? colors.success // green as soon as a well-framed face is detected
        : colors.white;

  const statusColor = outcome === 'spoof'
    ? colors.danger
    : recognitionResult?.success
    ? colors.success
    : recognitionResult
      ? colors.danger
      : isAuthenticated
        ? colors.success
        : colors.text;

  // Skia paths: dimmed surround with an oval cutout + the oval guide stroke.
  const dimPath = React.useMemo(() => {
    const p = Skia.Path.Make();
    p.addRect(Skia.XYWHRect(0, 0, screenWidth, screenHeight));
    p.addOval(Skia.XYWHRect(OVAL_X, OVAL_Y, OVAL_WIDTH, OVAL_HEIGHT));
    return p;
  }, []);
  const guidePath = React.useMemo(() => {
    const p = Skia.Path.Make();
    p.addOval(Skia.XYWHRect(OVAL_X, OVAL_Y, OVAL_WIDTH, OVAL_HEIGHT));
    return p;
  }, []);
  const pulsePath = React.useMemo(() => {
    const p = Skia.Path.Make();
    p.addOval(
      Skia.XYWHRect(2, 2, OVAL_WIDTH + PULSE_PAD * 2 - 4, OVAL_HEIGHT + PULSE_PAD * 2 - 4)
    );
    return p;
  }, []);

  // Liveness overlay: white everywhere except a centred circular camera window,
  // plus the ring + a soft outer pulse while waiting for a face.
  const liveSurroundPath = React.useMemo(() => {
    const p = Skia.Path.Make();
    p.addRect(Skia.XYWHRect(0, 0, screenWidth, screenHeight));
    p.addCircle(LIVE_CX, LIVE_CY, LIVE_R);
    return p;
  }, []);
  const liveRingPath = React.useMemo(() => {
    const p = Skia.Path.Make();
    p.addCircle(LIVE_CX, LIVE_CY, LIVE_R);
    return p;
  }, []);
  const livePulsePath = React.useMemo(() => {
    const p = Skia.Path.Make();
    p.addCircle(LIVE_CX, LIVE_CY, LIVE_R + 11);
    return p;
  }, []);
  // The CIRCLE ring shows GREEN only when the face is genuinely placed in the
  // circle, and NO colour at all otherwise (per request) — the white surround
  // still defines the circular camera window, so there's nothing to "look at"
  // until the face is correctly framed, at which point the green confirms it.
  const circleStrokeColor = isFaceInPosition ? colors.success : 'transparent';
  // The instruction-card icon/badge keeps a visible accent (green when framed,
  // brand otherwise) so the action glyph beneath the circle is never invisible.
  const liveRingColor = isFaceInPosition ? colors.success : colors.brand;
  const LiveActionIcon =
    (currentAction && LIVE_ACTION_ICON[currentAction]) || ScanFace;

  // Pulsing guide ring while searching for a face.
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (searching) {
      pulse.value = withRepeat(
        withTiming(1, {
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          reduceMotion: ReduceMotion.System,
        }),
        -1,
        true
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(0, { duration: 200, reduceMotion: ReduceMotion.System });
    }
  }, [searching, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.7 - pulse.value * 0.45,
    transform: [{ scale: 1 + pulse.value * 0.04 }],
  }));

  if (permsGranted.cam) {
    if (!device) {
      return (
        <View style={[styles.centerFill, { backgroundColor: colors.bg }]}>
          <Animated.View entering={FadeInDown.duration(300)}>
            <EmptyState
              icon={CameraOff}
              title="No camera available"
              message="This device has no usable camera for face verification."
            />
          </Animated.View>
        </View>
      );
    }

    const showManualCapture =
      isFaceInPosition && !isAuthenticated && !recognitionResult && !isCapturingFace;
    const showTryAgain =
      (isAuthenticated || !!recognitionResult || outcome === 'spoof') &&
      outcome !== 'success' &&
      !isCapturingFace &&
      !isProcessingRecognition;
    const showCancel =
      outcome === 'attendance_failed' ||
      outcome === 'auth_failed' ||
      outcome === 'spoof';

    return (
      <View style={[styles.container, { backgroundColor: colors.black }]}>
        {/* Full-screen camera. Best path: the anti-spoof Camera runs ML Kit face
            detection AND the on-device PAD model in one frame processor (calls
            onFacesDetected + onSpoofScore). Next: the plain face-detector Camera
            (face detection only, no spoof). Last: a plain Camera the ML Kit
            snapshot loop drives. Same ref every time, so the recognition
            takePhoto capture works in all modes. */}
        {!frameProcessorCrashed && antiSpoofCameraAvailable && AntiSpoofCameraComp ? (
          <FrameProcessorErrorBoundary onCrash={handleFrameProcessorCrash}>
            <AntiSpoofCameraComp
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              device={device}
              format={format}
              isActive={true}
              photo={true}
              resizeMode="cover"
              faceDetectionOptions={faceDetectionOptions}
              faceDetectionCallback={onFacesDetected}
              spoofCallback={onSpoofScore}
              spoofModel={spoof.model}
            />
          </FrameProcessorErrorBoundary>
        ) : !frameProcessorCrashed && frameProcessorAvailable && FaceDetectorCamera ? (
          <FrameProcessorErrorBoundary onCrash={handleFrameProcessorCrash}>
            <FaceDetectorCamera
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              device={device}
              format={format}
              isActive={true}
              photo={true}
              resizeMode="cover"
              faceDetectionOptions={faceDetectionOptions}
              faceDetectionCallback={onFacesDetected}
            />
          </FrameProcessorErrorBoundary>
        ) : (
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            format={format}
            isActive={true}
            photo={true}
            resizeMode="cover"
          />
        )}

        {/* Live anti-spoof warning: a red pill the moment the PAD model flags the
            frame (the hard block happens at the verify step). Wording is
            deliberately generic — a live, pre-submission "replay detected"
            badge would hand an attacker real-time feedback to tune against. */}
        {spoofWarning && (
          <Animated.View
            entering={FadeIn.duration(200)}
            pointerEvents="none"
            style={[
              styles.spoofBadge,
              { top: insets.top + sp.md, backgroundColor: colors.danger },
            ]}
          >
            <ShieldAlert size={16} color={colors.white} />
            <Text style={[typography.small, { color: colors.white, fontWeight: "700" }]}>
              Adjust and try again
            </Text>
          </Animated.View>
        )}

        {/* DEBUG: live face-detection readout (dev only; hidden in the UI). */}
        {SHOW_DETECTION_DEBUG && (
          <View
            pointerEvents="none"
            style={{ position: "absolute", top: 48, left: 8, right: 8, zIndex: 999 }}
          >
            <Text
              style={{
                color: "#00ff00",
                fontSize: 12,
                fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
                backgroundColor: "rgba(0,0,0,0.65)",
                paddingHorizontal: 6,
                paddingVertical: 3,
              }}
            >
              {dbg}
            </Text>
          </View>
        )}

        {livenessModeEnabled ? (
          <>
            {/* White surround with a centred circular camera window + a ring that
                goes green the instant a face is framed. */}
            <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
              <SkiaPath path={liveSurroundPath} fillType="evenOdd" color={colors.white} />
              <SkiaPath path={liveRingPath} style="stroke" strokeWidth={8} color={circleStrokeColor} />
            </Canvas>

            {/* Soft outer pulse while we're still looking for a face. */}
            {searching && (
              <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, pulseStyle]}>
                <Canvas style={styles.fill}>
                  <SkiaPath path={livePulsePath} style="stroke" strokeWidth={3} color={circleStrokeColor} />
                </Canvas>
              </Animated.View>
            )}

            {/* Big, single-action instruction beneath the circle. The action is
                revealed only while its step is live (anti video-replay). */}
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: LIVE_CY + LIVE_R + 24,
                left: 24,
                right: 24,
                alignItems: "center",
              }}
            >
              <Animated.View
                key={liveMsg}
                entering={FadeInDown.duration(260)}
                style={{
                  width: "100%",
                  maxWidth: 360,
                  alignItems: "center",
                  backgroundColor: colors.surface,
                  borderRadius: radii.xl,
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingVertical: sp.xl,
                  paddingHorizontal: sp.lg,
                  ...shadows.e3,
                }}
              >
                {/* Icon badge — soft tint + a ring that turns green on detection */}
                <View
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 38,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isFaceInPosition ? colors.successSoft : colors.brandSoft,
                    borderWidth: 2,
                    borderColor: liveRingColor,
                    marginBottom: sp.md,
                  }}
                >
                  <LiveActionIcon size={36} color={liveRingColor} strokeWidth={2.4} />
                </View>

                {/* The single live action */}
                <Text
                  accessibilityLiveRegion="polite"
                  style={{
                    color: colors.text,
                    fontSize: 24,
                    lineHeight: 30,
                    fontWeight: "800",
                    textAlign: "center",
                  }}
                >
                  {liveMsg}
                </Text>

                {/* Live status pill */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 7,
                    marginTop: sp.md,
                    paddingHorizontal: sp.md,
                    paddingVertical: 6,
                    borderRadius: radii.pill,
                    backgroundColor: isFaceInPosition ? colors.successSoft : colors.surfaceAlt,
                  }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: isFaceInPosition ? colors.success : "#94A3B8",
                    }}
                  />
                  <Text
                    style={{
                      color: isFaceInPosition ? colors.success : colors.textMuted,
                      fontSize: 13,
                      fontWeight: "700",
                    }}
                  >
                    {isFaceInPosition ? "Face detected — hold still" : "Searching for your face…"}
                  </Text>
                </View>
              </Animated.View>
            </View>
          </>
        ) : (
          <>
            {/* Skia overlay: dimmed surround with oval face-guide cutout */}
            <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
              <SkiaPath path={dimPath} fillType="evenOdd" color={colors.overlay} />
              <SkiaPath path={guidePath} style="stroke" strokeWidth={3} color={guideColor} />
            </Canvas>

            {/* Pulsing guide ring while searching for a face */}
            {searching && (
              <Animated.View pointerEvents="none" style={[styles.pulseRing, pulseStyle]}>
                <Canvas style={styles.fill}>
                  <SkiaPath
                    path={pulsePath}
                    style="stroke"
                    strokeWidth={2}
                    color={colors.brandScale[200]}
                  />
                </Canvas>
              </Animated.View>
            )}
          </>
        )}

        {/* Header (hidden when embedded inside the liveness modal chrome) */}
        {!livenessModeEnabled && (
          <Animated.View
            entering={FadeInDown.duration(300)}
            style={[
              styles.header,
              {
                top: insets.top + sp.md,
                backgroundColor: colors.overlay,
                borderRadius: radii.lg,
                paddingVertical: sp.md,
                paddingHorizontal: sp.lg,
              },
            ]}
          >
            <ScanFace size={22} color={colors.white} />
            <View style={styles.headerTextWrap}>
              <Text style={[typography.title, { color: colors.white }]}>
                Face Authentication
              </Text>
              <Text style={[typography.caption, { color: colors.white, opacity: 0.85 }]}>
                Mark your attendance securely
              </Text>
            </View>
          </Animated.View>
        )}

        {/* Camera switch (hidden during liveness — front cam is required there) */}
        {!livenessModeEnabled && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Switch camera"
            accessibilityHint="Toggles between front and back camera"
            hitSlop={8}
            onPress={setActiveCamera}
            style={({ pressed }) => [
              styles.switchButton,
              {
                top: insets.top + sp.md,
                right: sp.lg,
                backgroundColor: colors.overlay,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <SwitchCamera size={22} color={colors.white} />
          </Pressable>
        )}

        {/* Success treatment (liveness shows its own "Verified ✓" in the modal) */}
        {outcome === 'success' && !livenessModeEnabled && (
          <Animated.View
            entering={ZoomIn.duration(300)}
            pointerEvents="none"
            style={styles.successOverlay}
          >
            <View style={[styles.successBadge, { backgroundColor: colors.success }]}>
              <CircleCheck size={56} color={colors.white} />
            </View>
            <Text style={[typography.h3, { color: colors.white, marginTop: sp.lg }]}>
              Identity verified
            </Text>
            <Text style={[typography.small, { color: colors.white, opacity: 0.9 }]}>
              Attendance marked successfully
            </Text>
          </Animated.View>
        )}

        {outcome === 'spoof' && !livenessModeEnabled && (
          <Animated.View
            entering={ZoomIn.duration(300)}
            pointerEvents="none"
            style={styles.successOverlay}
          >
            <View style={[styles.successBadge, { backgroundColor: colors.danger }]}>
              <ShieldAlert size={56} color={colors.white} />
            </View>
            <Text style={[typography.h3, { color: colors.white, marginTop: sp.lg }]}>
              Verification unsuccessful
            </Text>
            <Text style={[typography.small, { color: colors.white, opacity: 0.9, textAlign: 'center', paddingHorizontal: sp.xl }]}>
              We could not verify your photo. Please try again or contact your administrator.
            </Text>
          </Animated.View>
        )}

        {/* Bottom: face-recognition status + actions. Hidden during a liveness
            challenge — the LivenessChallenge modal renders its own UI on top. */}
        {!livenessModeEnabled && (
        <View
          style={[styles.bottomArea, { bottom: insets.bottom + sp.xl, gap: sp.md }]}
        >
          <Animated.View
            entering={FadeInDown.duration(300).delay(50)}
            style={[
              styles.statusCard,
              {
                backgroundColor: colors.surface,
                borderRadius: radii.lg,
                padding: sp.lg,
                gap: sp.lg,
                ...shadows.e3,
              },
            ]}
          >
            <ProgressRing
              size={48}
              strokeWidth={5}
              segments={REQUIRED_BLINKS}
              filledSegments={blinkCount}
              color={colors.success}
              trackColor={colors.surfaceAlt}
            >
              <Eye
                size={18}
                color={blinkCount >= REQUIRED_BLINKS ? colors.success : colors.textMuted}
              />
            </ProgressRing>
            <View style={styles.statusTextWrap}>
              <Text
                accessibilityLiveRegion="polite"
                style={[typography.bodyBold, { color: statusColor }]}
              >
                {authMessage}
              </Text>
              {(isCapturingFace || isProcessingRecognition) && (
                <Animated.View entering={FadeIn.duration(200)} style={[styles.processingRow, { gap: sp.sm, marginTop: sp.xs }]}>
                  <ActivityIndicator size="small" color={colors.brand} />
                  <Text style={[typography.caption, { color: colors.textMuted }]}>
                    Processing…
                  </Text>
                </Animated.View>
              )}
            </View>
          </Animated.View>

          {showManualCapture && (
            <Animated.View entering={FadeInDown.duration(300)}>
              <Button
                title="Capture now"
                icon={CameraIcon}
                onPress={handleManualCapture}
                variant="primary"
                fullWidth
                accessibilityLabel="Capture now"
                accessibilityHint="Takes a photo for face verification"
              />
            </Animated.View>
          )}

          {showTryAgain && (
            <Animated.View entering={FadeInDown.duration(300)} style={{ gap: sp.sm }}>
              <Button
                title="Try again"
                icon={RotateCcw}
                onPress={resetAuthentication}
                variant="primary"
                fullWidth
                accessibilityLabel="Try face verification again"
              />
              {showCancel && (
                <Button
                  title="Cancel"
                  icon={X}
                  onPress={handleCancelAfterFailure}
                  variant="ghost"
                  fullWidth
                  accessibilityLabel="Cancel face verification"
                />
              )}
            </Animated.View>
          )}
        </View>
        )}
      </View>
    );
  } else {
    return <NeedPermissions askForPermissions={askForPermissions} />;
  }
};

const NeedPermissions: React.FC<{ askForPermissions: () => void }> = ({
  askForPermissions,
}) => {
  const { theme } = useTheme();
  return (
    <View style={[styles.centerFill, { backgroundColor: theme.colors.bg }]}>
      <Animated.View entering={FadeInDown.duration(300)}>
        <EmptyState
          icon={CameraIcon}
          title="Allow camera access"
          message="SAACMS needs your camera so Face Detection can verify your identity when marking attendance."
          actionLabel="Allow camera"
          onAction={askForPermissions}
        />
      </Animated.View>
    </View>
  );
};

// Static layout only — every color comes from the theme at render time.
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  centerFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    left: OVAL_X - PULSE_PAD,
    top: OVAL_Y - PULSE_PAD,
    width: OVAL_WIDTH + PULSE_PAD * 2,
    height: OVAL_HEIGHT + PULSE_PAD * 2,
  },
  header: {
    position: "absolute",
    left: 16,
    right: 72,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 10,
  },
  headerTextWrap: {
    marginLeft: 12,
    flexShrink: 1,
  },
  switchButton: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
  successOverlay: {
    position: "absolute",
    left: OVAL_X,
    top: OVAL_Y,
    width: OVAL_WIDTH,
    height: OVAL_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 15,
  },
  successBadge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  spoofBadge: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    zIndex: 30,
  },
  bottomArea: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 10,
  },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusTextWrap: {
    flex: 1,
  },
  processingRow: {
    flexDirection: "row",
    alignItems: "center",
  },
});
