/**
 * Text-to-speech for the liveness flow — reads each step's instruction aloud so
 * the user can HEAR what to do, not just read it.
 *
 * Defensive by design: react-native-tts is a native module. If it isn't present
 * in the current build (e.g. before the next native rebuild, or on a platform
 * where it failed to link), every call here is a silent no-op — the app keeps
 * working with the on-screen text, just without voice. Nothing in the liveness
 * flow depends on speech succeeding.
 */

import { NativeModules, Platform } from 'react-native';

// Diagnostic: surfaced so we can SEE on-device why voice is/ isn't working.
// (Logged via console.warn → also reaches os_log / `devicectl --console`.)
let loadError = '';
const nativePresent = !!(NativeModules as any)?.TextToSpeech;

// Load the native module lazily and defensively. On the new architecture,
// constructing react-native-tts's NativeEventEmitter throws if the native side
// isn't linked, so the require itself can throw — hence the try/catch.
let Tts: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Tts = require('react-native-tts').default ?? require('react-native-tts');
} catch (e: any) {
  loadError = e?.message ? String(e.message) : String(e);
  Tts = null;
}

if (Tts) {
  // Apply each optional setting INDEPENDENTLY so one failing setter can't disable
  // speech. THIS was the iOS bug: `setDefaultRate(rate, BOOL)` throws "Objective C
  // type BOOL is unsupported" under the bridgeless interop, and the old shared
  // try/catch then nulled out Tts — killing ALL voice. Now each call is isolated.
  const safe = (label: string, fn: () => any) => {
    try {
      fn();
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.warn(`[speech] setup ${label} failed (continuing): ${e?.message || e}`);
    }
  };

  if (Platform.OS === 'ios') {
    // iOS only plays AVSpeechSynthesizer through the *currently active*
    // AVAudioSession. The hardware mute switch silences the default session, and
    // during liveness the CAMERA holds it in a record category — so 'ignore' makes
    // react-native-tts switch to Playback + VoicePrompt + MixWithOthers on each
    // utterance: audible even on silent, layered over the live camera session.
    //
    // We deliberately do NOT call setDefaultRate on iOS — its BOOL argument crashes
    // the bridgeless interop (the bug above); the default rate is fine. And no
    // setDucking: it toggles the shared session and can stop the camera.
    safe('setIgnoreSilentSwitch', () => Tts.setIgnoreSilentSwitch('ignore'));
  } else {
    // Android: a touch slower reads clearer; duck other audio for the prompt.
    safe('setDefaultRate', () => Tts.setDefaultRate(0.5, true));
    safe('setDucking', () => Tts.setDucking(true));
  }
  safe('setDefaultPitch', () => Tts.setDefaultPitch(1.0));
  // Pin a concrete language so iOS always has a voice selected (no voice → silence).
  safe('setDefaultLanguage', () => Tts.setDefaultLanguage('en-US'));
  // Warm up the engine so the FIRST utterance isn't dropped during init.
  safe('getInitStatus', () => Tts.getInitStatus?.()?.catch?.(() => {}));
}

// eslint-disable-next-line no-console
console.warn(
  `[speech] init — platform=${Platform.OS} nativeModulePresent=${nativePresent} ` +
    `ttsLoaded=${!!Tts}${loadError ? ` loadError="${loadError}"` : ''}`,
);

/** Is voice guidance actually available in this build? */
export const speechAvailable = (): boolean => !!Tts;

/** Diagnostic snapshot for on-device troubleshooting. */
export const speechDiagnostic = () => ({
  platform: Platform.OS,
  nativeModulePresent: nativePresent,
  ttsLoaded: !!Tts,
  loadError,
});

/**
 * Speak `text`, interrupting anything currently being spoken. Safe to call
 * rapidly — each new instruction cancels the previous one so steps never queue
 * up and lag behind what's on screen.
 */
export function speak(text: string): void {
  if (!text) return;
  if (!Tts) {
    // eslint-disable-next-line no-console
    console.warn(`[speech] speak("${text}") SKIPPED — Tts not loaded (${loadError || 'no native module'})`);
    return;
  }
  // Best-effort interrupt of the current utterance. react-native-tts's stop()
  // passes a BOOL that CRASHES RN 0.84's bridgeless interop, so isolate it — a
  // throw here must NEVER abort the actual speak (this WAS the bug: stop() threw
  // before speak() ran, so nothing was ever spoken).
  try { Tts.stop?.(); } catch { /* ignore — stop() is unsupported on this bridge */ }
  try {
    const r = Tts.speak(text);
    // react-native-tts resolves/rejects a promise; surface any native error.
    if (r && typeof r.then === 'function') {
      r.then(
        // eslint-disable-next-line no-console
        () => console.warn(`[speech] speak OK: "${text}"`),
        // eslint-disable-next-line no-console
        (err: any) => console.warn(`[speech] speak REJECTED "${text}": ${err?.message || err}`),
      );
    } else {
      // eslint-disable-next-line no-console
      console.warn(`[speech] speak called (no promise) "${text}"`);
    }
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn(`[speech] speak THREW "${text}": ${e?.message || e}`);
  }
}

/** Stop any in-progress speech (e.g. when the check closes or succeeds). */
export function stopSpeaking(): void {
  if (!Tts) return;
  try {
    Tts.stop?.();
  } catch {
    /* no-op */
  }
}