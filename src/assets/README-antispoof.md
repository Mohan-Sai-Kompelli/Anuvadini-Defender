# On-device anti-spoof (PAD) model — `antispoof.tflite`

This file is the **face presentation-attack detection** model that runs on the
camera frames to catch a face replayed on a phone/tablet screen (or a printed
photo). It is loaded by `src/liveness/antiSpoof.ts` →
`require('../assets/antispoof.tflite')` and executed in the frame processor in
`src/liveness/AntiSpoofCamera.tsx`.

> The committed `antispoof.tflite` is a **placeholder**. Until you replace it
> with a real model **and natively rebuild**, the app runs normally but the PAD
> hook reports `ready: false` and **nothing is enforced** — there is no way to
> detect a screen replay without a model.

## Get a model

The default constants in `antiSpoof.ts` target the **MiniVision
Silent-Face-Anti-Spoofing** model (a.k.a. MiniFASNet), which is the standard
open-source screen/print PAD model:

- Repo: `https://github.com/minivision-ai/Silent-Face-Anti-Spoofing`
- The released weights are PyTorch (`.pth`) — convert to TFLite once:
  `PyTorch → ONNX (torch.onnx.export) → TensorFlow (onnx-tf) → TFLite (tf.lite.TFLiteConverter)`
  Export at the model's native input (the `2.7_80x80` / `4_0_0_80x80` variants
  use **80×80 RGB**).
- Alternatively, any TFLite face anti-spoof / liveness model works — just match
  the four model-specific constants below.

Drop the converted file here as `antispoof.tflite` (overwrite the placeholder).

## Match the constants in `src/liveness/antiSpoof.ts`

| Constant | Meaning | MiniFASNet default |
|---|---|---|
| `ANTISPOOF_INPUT_SIZE` | square input side (px) | `80` |
| `ANTISPOOF_INPUT_DTYPE` | input tensor dtype | `'float32'` → the resize plugin emits channels in **[0, 1]**, which equals MiniVision's `ToTensor()` test transform (no mean/std) |
| `ANTISPOOF_PIXEL_FORMAT` | channel order | `'rgb'` — flip to `'bgr'` if live faces score low (MiniVision loads BGR via OpenCV) |
| `ANTISPOOF_LIVE_CLASS_INDEX` | output index meaning "real/live" | `1` (classes: `[fake_2d, real, fake_3d]`) |
| `ANTISPOOF_LIVE_THRESHOLD` | block below this smoothed live prob | `0.6` |

If your model expects 0–255 inputs or its own mean/std normalization, adjust the
preprocessing in `AntiSpoofCamera.tsx` (the `resize(...)` call) accordingly —
e.g. switch `dataType` to `'uint8'`, or scale the float buffer before `runSync`.

## Rebuild (required — this adds native modules)

```bash
npm install            # pulls react-native-fast-tflite + vision-camera-resize-plugin
cd ios && pod install && cd ..        # iOS only
npx react-native run-android          # or run-ios — a full native rebuild
```

Metro already bundles `.tflite` (see `metro.config.js` `assetExts`) and Android
keeps it uncompressed (`android/app/build.gradle` `noCompress`).

## Verify it loaded

Watch logs while opening the verify screen:
- `[CameraStream] anti-spoof PAD active` → model loaded, enforcing.
- `[CameraStream] anti-spoof unavailable: …` → still on the placeholder / dep
  missing / stale native build.
