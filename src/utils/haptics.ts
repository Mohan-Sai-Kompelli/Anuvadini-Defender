/**
 * Lightweight haptic feedback via React Native's core Vibration API.
 *
 * We deliberately do NOT depend on react-native-haptic-feedback: it isn't
 * installed (nor in package.json), and dynamically `require`-ing it crashes the
 * Hermes RELEASE bundle with a fatal "Requiring unknown module" that escapes the
 * try/catch (the dev/Metro bundle tolerated it, release does not). Vibration is
 * always available and this helper never throws.
 */
import { Vibration } from 'react-native';

export type HapticType = 'impactLight' | 'success' | 'error' | 'selection';

export function haptic(type: HapticType = 'impactLight'): void {
  try {
    switch (type) {
      case 'success':
        Vibration.vibrate(30);
        break;
      case 'error':
        Vibration.vibrate([0, 40, 60, 40]);
        break;
      case 'selection':
        Vibration.vibrate(10);
        break;
      case 'impactLight':
      default:
        Vibration.vibrate(15);
        break;
    }
  } catch {
    // Haptics must never crash the app.
  }
}
