import { Platform } from 'react-native';
import { Camera } from 'react-native-vision-camera';

/**
 * Device + camera attestation for the server's injection / deepfake guard.
 *
 * Camera-injection attacks feed a pre-recorded or deepfake video into the camera
 * pipeline instead of the live sensor — almost always from an emulator, a rooted
 * device with a camera hook (Frida/Xposed), or a virtual/USB camera. This gathers
 * the signals we CAN read with the deps already installed (no native rebuild):
 *   • Android build properties → emulator / test-device heuristic
 *   • camera hardware enumeration → external / virtual camera, missing front lens
 *
 * The server (services/injectionRiskService.js) turns this into a risk score.
 * The strongest production signals — Play Integrity verdict and Frida/Xposed
 * hook detection — need native modules; when the app starts including
 * `playIntegrity` / `hookDetected` / `isRooted` here, the server scores them
 * automatically. Best-effort: every step is guarded so this never blocks a mark.
 */
export async function collectAttestation(
  extra: Record<string, any> = {}
): Promise<Record<string, any>> {
  const att: Record<string, any> = {
    platform: Platform.OS,
    osVersion: String((Platform as any).Version ?? ''),
    appCollected: true,
  };

  // Android build properties (RN exposes these on Platform.constants).
  try {
    const c: any = (Platform as any).constants || {};
    att.brand = c.Brand;
    att.manufacturer = c.Manufacturer;
    att.model = c.Model;
    att.device = c.Device;
    att.product = c.Product;
    att.hardware = c.Hardware;
    att.board = c.Board;
    att.fingerprint = c.Fingerprint;
    att.tags = c.Tags;
    att.isTesting = c.isTesting === true;
  } catch {
    /* ignore */
  }

  // Camera hardware → flag external/virtual cameras or a missing front lens.
  try {
    const devices: any[] = (Camera as any).getAvailableCameraDevices?.() || [];
    att.cameraCount = devices.length;
    att.cameraPositions = devices.map((d) => d?.position).filter(Boolean);
    att.hasFrontHardwareCamera = devices.some((d) => d?.position === 'front');
    att.hasExternalCamera = devices.some((d) => d?.position === 'external');
  } catch {
    att.cameraEnumerationFailed = true;
  }

  // Merge any frame-liveness signals the caller computed (variance / timing).
  return { ...att, ...extra };
}
