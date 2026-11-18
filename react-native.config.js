module.exports = {
  assets: ["./assets/models"],

  // iOS deliberately runs the ML-Kit *snapshot* face path + SERVER-side spoof
  // detection (see face-back/antispoof_service.py). It does NOT use VisionCamera
  // frame processors (disabled via $VCEnableFrameProcessors in ios/Podfile) nor
  // on-device TFLite PAD. Autolinking these native modules into iOS only bloats
  // the binary, widens the native crash surface on older devices, and risks the
  // react-native-worklets-core New-Arch codegen failure the Podfile warns about.
  //
  // So skip them on iOS (Android still autolinks them — that's where they run).
  // At runtime CameraStream require()s each one in a try/catch and falls back to
  // the snapshot path when they're absent, so disabling here is transparent.
  dependencies: {
    "react-native-fast-tflite": { platforms: { ios: null } },
    "vision-camera-resize-plugin": { platforms: { ios: null } },
    "react-native-vision-camera-face-detector": { platforms: { ios: null } },
    "react-native-worklets-core": { platforms: { ios: null } },
  },
};
