# -*- coding: utf-8 -*-
"""
calibrate_screen_gate.py
------------------------
Measure the WHOLE-FRAME screen-replay signal (moiré ratio + periodicity peak)
on your OWN captures so the screen-replay gate can be turned on SAFELY.

WHY THIS EXISTS
    A frame-filling video replay (a phone/laptop screen that fills the camera
    frame) shows the person's REAL face, so MiniFASNet — which only ever sees
    the cropped face — scores it 'real' with high confidence and lets it pass.
    The only cue is OUTSIDE the face crop: the screen's pixel lattice / bezel /
    dock / video-scrubber. antispoof_service._screen_moire() measures that as
    (ratio, peak), but the ENFORCEMENT is OFF by default because the safe
    threshold is CAMERA-DEPENDENT: on some front cameras a genuine face trips
    the same band, and falsely rejecting a real employee is the worst outcome.

    This tool removes the guesswork. Point it at a folder of GENUINE captures
    and a folder of REPLAY captures (you already have both saved under
    face-back/face_storage/... — the replay ones are the screen-replay attempts).
    It prints, per image, the (ratio, peak) and the PAD label, then tells you
    whether the two sets SEPARATE and the exact env values to set.

USAGE (from the face-back folder, with its venv active):
    python calibrate_screen_gate.py --genuine <dir-of-real-selfies> \
                                    --replay  <dir-of-screen-replays>

    Each dir is scanned recursively for .jpg/.jpeg/.png. You can pass the same
    face_storage subtree twice and eyeball the split if they're mixed, but a
    clean split (real vs replay) gives a trustworthy recommendation.

WHAT TO DO WITH THE OUTPUT
    * "SEPARABLE" → set the two ANTISPOOF_SCREEN_MOIRE / _PEAK values it prints
      in server/.env (or the face-back env) and set
      ANTISPOOF_SCREEN_MOIRE_ENFORCE=1. From then on a whole-frame screen
      signature ESCALATES a 'real'/'uncertain' PAD verdict to 'fake' — i.e. the
      exact replays in these screenshots get blocked, on both check-in/out and
      spot-checks (spot-check multi-frame fuses per-frame labels, so any screen
      frame fails the attempt).
    * "NOT separable on these cameras" → do NOT enable the hard block (it would
      reject genuine users); collect more replay captures and fine-tune the PAD
      model instead (see anti-spam/train.py + the notes in antispoof_service).
"""

import argparse
import os
import sys

# antispoof_service lives beside this file; import its singleton + metric.
_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

IMG_EXTS = (".jpg", ".jpeg", ".png")


def _iter_images(root):
    for dirpath, _dirs, files in os.walk(root):
        for f in files:
            if f.lower().endswith(IMG_EXTS):
                yield os.path.join(dirpath, f)


def _measure(inst, path):
    """Return (ratio, peak, label) for one image, or None if unreadable."""
    cv2 = inst._cv2
    img = cv2.imread(path)
    if img is None or getattr(img, "size", 0) == 0:
        return None
    try:
        ratio, peak = inst._screen_moire(img)
    except Exception as e:  # noqa: BLE001
        print(f"  [warn] moire failed on {path}: {e}")
        return None
    # Full PAD verdict too, so you can see what the model alone decided.
    try:
        verdict = inst.predict_image(img)
        label = verdict.get("label")
    except Exception:
        label = "?"
    return ratio, peak, label


def _summarize(name, rows):
    print(f"\n=== {name}  ({len(rows)} images) ===")
    if not rows:
        print("  (no readable images)")
        return None
    ratios = sorted(r[1] for r in rows)
    peaks = sorted(r[2] for r in rows)
    for path, ratio, peak, label in rows:
        print(f"  ratio={ratio:.4f}  peak={peak:5.1f}  pad={label:9s}  {os.path.basename(path)}")
    lo_r, hi_r = ratios[0], ratios[-1]
    lo_p, hi_p = peaks[0], peaks[-1]
    med_r = ratios[len(ratios) // 2]
    med_p = peaks[len(peaks) // 2]
    print(f"  ratio  min={lo_r:.4f}  median={med_r:.4f}  max={hi_r:.4f}")
    print(f"  peak   min={lo_p:.1f}  median={med_p:.1f}  max={hi_p:.1f}")
    return {"ratio": ratios, "peak": peaks}


def main():
    ap = argparse.ArgumentParser(description="Calibrate the whole-frame screen-replay gate.")
    ap.add_argument("--genuine", required=True, help="dir of REAL live-face captures")
    ap.add_argument("--replay", required=True, help="dir of SCREEN-REPLAY captures")
    args = ap.parse_args()

    from antispoof_service import get_antispoof

    inst = get_antispoof()
    if inst is None:
        print("ERROR: anti-spoof model could not load — run this from the face-back venv.")
        sys.exit(1)

    genuine_rows = []
    for p in _iter_images(args.genuine):
        m = _measure(inst, p)
        if m:
            genuine_rows.append((p, *m))
    replay_rows = []
    for p in _iter_images(args.replay):
        m = _measure(inst, p)
        if m:
            replay_rows.append((p, *m))

    g = _summarize("GENUINE (must NOT be flagged)", genuine_rows)
    r = _summarize("REPLAY (should be flagged)", replay_rows)

    print("\n" + "=" * 60)
    if not g or not r:
        print("Need readable images in BOTH folders to recommend a threshold.")
        return

    # A screen is flagged only when ratio >= RATIO_THR AND peak >= PEAK_THR.
    # For a SAFE gate we want a threshold ABOVE every genuine sample and
    # AT/BELOW enough replay samples. Recommend the genuine max as the floor
    # (plus a small margin) and report how many replays that would catch.
    g_ratio_max = g["ratio"][-1]
    g_peak_max = g["peak"][-1]
    # A touch above the worst genuine sample so no genuine frame trips it.
    rec_ratio = round(g_ratio_max + 0.005, 4)
    rec_peak = round(g_peak_max + 0.5, 1)

    caught = sum(1 for (_p, ratio, peak, _l) in replay_rows
                 if ratio >= rec_ratio and peak >= rec_peak)
    total = len(replay_rows)

    print(f"Genuine worst-case : ratio={g_ratio_max:.4f}  peak={g_peak_max:.1f}")
    print(f"Recommended (above all genuine):")
    print(f"    ANTISPOOF_SCREEN_MOIRE={rec_ratio}")
    print(f"    ANTISPOOF_SCREEN_MOIRE_PEAK={rec_peak}")
    print(f"    ANTISPOOF_SCREEN_MOIRE_ENFORCE=1")
    print(f"With these, {caught}/{total} of your replay captures get BLOCKED "
          f"and 0/{len(genuine_rows)} genuine get falsely rejected.")
    if caught == 0:
        print("\n>>> NOT separable on these cameras: the replays don't score above\n"
              "    your genuine faces on this whole-frame signal. Do NOT enable the\n"
              "    hard block — collect more replay captures and fine-tune the PAD\n"
              "    model (anti-spam/train.py) instead.")
    elif caught < total:
        print(f"\n>>> PARTIAL: {total - caught} replay(s) look too clean on this\n"
              "    signal to catch without risking genuine users. Enable the block\n"
              "    for the rest, and fine-tune the model for full coverage.")
    else:
        print("\n>>> SEPARABLE: safe to enable — every replay is caught, no genuine\n"
              "    frame is at risk. Set the three env vars above and restart face-back.")


if __name__ == "__main__":
    main()
