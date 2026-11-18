import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';

/**
 * Plays the app's notification sound (android/app/src/main/res/raw/dragon_alert.mp3)
 * for a FOREGROUND push notification.
 *
 * Why this is needed: Android/FCM only auto-plays a notification's configured
 * channel sound (dragon_alert — see notificationChannelService.ts and the
 * server's firebaseService.js) when the app is BACKGROUNDED or KILLED, because
 * that's when the OS itself draws the system notification. While the app is
 * OPEN, FCM delivers the message silently to onMessage() with no system UI and
 * no sound — firebasePushService.ts already shows an in-app toast for this
 * case, but toasts don't carry audio. This fills that gap so every
 * notification (spot-checks especially — they're time-sensitive) is audible
 * regardless of whether the app is open or closed.
 *
 * Reuses react-native-audio-recorder-player (already a project dependency, no
 * new native module/rebuild needed) — Android's MediaPlayer natively resolves
 * the `android.resource://<package>/raw/<name>` URI scheme, which is exactly
 * how you play a bundled res/raw file, so no file needs to be copied out to
 * the filesystem first.
 */
let AudioRecorderPlayer: any = null;
try {
  AudioRecorderPlayer = require('react-native-audio-recorder-player').default;
} catch (e) {
  console.warn('[notificationSound] react-native-audio-recorder-player not available:', e);
}

let player: any = null;
function getPlayer() {
  if (!AudioRecorderPlayer) return null;
  if (!player) player = new AudioRecorderPlayer();
  return player;
}

export async function playNotificationSound(): Promise<void> {
  if (Platform.OS !== 'android') return; // dragon_alert.mp3 is an Android res/raw asset only
  const p = getPlayer();
  if (!p) return;
  try {
    const pkg = DeviceInfo.getBundleId();
    const uri = `android.resource://${pkg}/raw/dragon_alert`;
    await p.startPlayer(uri);
    // Release the player once playback finishes so a second notification a
    // moment later isn't blocked by "Player is already running."
    p.addPlayBackListener((e: any) => {
      if (e?.currentPosition >= e?.duration && e?.duration > 0) {
        p.stopPlayer().catch(() => {});
        p.removePlayBackListener();
      }
    });
  } catch (error) {
    console.warn('[notificationSound] failed to play dragon_alert:', error);
  }
}
