from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
import os, uuid, numpy as np, cv2
import torch
from dotenv import load_dotenv
from facenet_pytorch import MTCNN, InceptionResnetV1
from ultralytics import YOLO

# On-device-grade anti-spoof (PAD): is the captured frame a real live face or a
# screen/photo replay? Imported defensively — if the MiniFASNet weights or deps
# can't load, `antispoof_predict` is None and verification continues unchanged.
try:
    from antispoof_service import predict_safe as antispoof_predict
    from antispoof_service import predict_multi_safe as antispoof_predict_multi
except Exception as _e:  # noqa: BLE001
    print("[check] antispoof import failed (verification continues without PAD):", _e)
    antispoof_predict = None
    antispoof_predict_multi = None

# Hosted-VLM RESCAN (see /antispoof-vlm-rescan below) — deliberately separate
# from the antispoof_predict path above, and never awaited by check-in/out or
# spot-check while the user is waiting on a response (measured 10-60s per
# call, unacceptable in that path). Imported defensively like the others.
try:
    import vlm_spoof_service
except Exception as _e:  # noqa: BLE001
    print("[check] vlm_spoof_service import failed (async rescan disabled):", _e)
    vlm_spoof_service = None

# OPTIONAL additive ArcFace (InsightFace buffalo_l) identity signal. Imported
# defensively — if insightface isn't installed, `arcface` is None and every
# recognition decision stays exactly facenet-only (see arcface_service.py). No
# re-enrollment is forced: only people enrolled while ArcFace is active get an
# ArcFace reference, and only they get the extra second-opinion check.
try:
    import arcface_service as arcface
except Exception as _e:  # noqa: BLE001
    print("[check] arcface import failed (recognition continues facenet-only):", _e)
    arcface = None

# Load the Node server's .env so we share its working MONGODB_URI
# (single source of truth — avoids stale/duplicated Atlas credentials).
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "server", ".env"))

# Flask setup
app = Flask(__name__)
CORS(app)
UPLOAD_FOLDER = "temp_uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# MongoDB setup
MONGODB_URI = os.environ.get("MONGODB_URI")
if not MONGODB_URI:
    raise RuntimeError("MONGODB_URI not set (expected in ../server/.env)")
client = MongoClient(MONGODB_URI)
# The shared MONGODB_URI (server/.env) has no database-name path segment
# (mongodb+srv://.../?retryWrites=...), so pymongo's get_default_database()
# raises instead of picking one. Node's mongoose.connect() on the SAME URI
# doesn't hit this — the MongoDB Node driver silently falls back to a "test"
# database when the URI omits one. Mirror that exact fallback here (rather
# than requiring everyone's .env to be edited, or guessing a name) so both
# sides of the stack keep reading/writing the SAME database as they already
# do today. Override via MONGO_DB_NAME if a deployment's URI is ever fixed to
# include an explicit database name.
db = client.get_database(os.environ.get("MONGO_DB_NAME", "test"))
collection = db["embedings"]

# Calibrated against observed production scores (2026-07-16): the SAME enrolled
# person scores 0.87-0.89 on sharp captures but only 0.74-0.75 on soft/low-light
# captures (sharpness ~10 vs ~200+), while unusable motion-blurred frames score
# ~0.24 and impostors with these embeddings sit around 0.2-0.4. The previous
# 0.78 default sat INSIDE the genuine-user band, so real users were rejected
# whenever capture quality dipped. 0.65 keeps ~0.1 margin to the worst genuine
# capture AND ~0.2 margin above the impostor band — and identity is not the
# only gate: PAD anti-spoof, the server-adjudicated liveness challenge, and
# camera-integrity attestation all still stand independently.
# Keep overrideable only for a measured ROC recalibration; do not lower this
# ad-hoc because repeated probing can otherwise eventually find a
# false-positive expression/angle.
FACE_MATCH_THRESHOLD = float(os.environ.get("FACE_MATCH_THRESHOLD", "0.65"))

# A tiny passport-style face in a large image is not a reliable biometric
# sample. Require a reasonably sized, single face for both enrollment and
# verification. The active liveness/PAD checks remain separate gates.
MIN_IMAGE_SIDE = int(os.environ.get("FACE_MIN_IMAGE_SIDE", "150"))
MIN_FACE_AREA_RATIO = float(os.environ.get("FACE_MIN_AREA_RATIO", "0.03"))

# A thin enrollment (1-2 photos) has no redundancy: one bad crop/angle
# failing the quality or PAD gate leaves nothing to build a reference from.
# This is the authoritative check — it counts USABLE images (after quality +
# PAD screening), not raw uploads, since a spoof-flagged or blurry photo
# shouldn't count toward the minimum. The Node layer also checks the raw
# upload count up front so a doomed request never reaches here at all.
MIN_ENROLLMENT_IMAGES = int(os.environ.get("MIN_FACE_ENROLL_IMAGES", "5"))

def face_quality_gate(image_path):
    """Return (ok, reason) for dimensions, face count and face scale."""
    img = cv2.imread(image_path)
    if img is None:
        return False, "invalid_image"
    h, w = img.shape[:2]
    if min(h, w) < MIN_IMAGE_SIDE:
        return False, "image_too_small"
    try:
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        boxes, probs = mtcnn.detect(img_rgb)
        if boxes is None:
            boxes = []
    except Exception:
        return False, "face_quality_unavailable"
    if len(boxes) != 1:
        return False, "single_face_required"
    x1, y1, x2, y2 = map(int, boxes[0][:4])
    area = max(0, x2 - x1) * max(0, y2 - y1)
    if area / float(w * h) < MIN_FACE_AREA_RATIO:
        return False, "face_too_small"
    return True, None

# Load models
model = YOLO("detection/weights/best.pt")  # Update this path
# select_largest (not keep_all): exactly ONE aligned 160x160 face tensor comes
# back. keep_all=True could return a stacked (N,3,160,160) tensor whose
# flattened embedding became a corrupt 512*N vector — a latent crash whenever
# a second face slipped into the crop.
mtcnn = MTCNN(select_largest=True, post_process=True)
resnet = InceptionResnetV1(pretrained='vggface2').eval()

# Helpers
def save_temp_image(file_storage):
    ext = os.path.splitext(file_storage.filename)[1]
    filename = f"{uuid.uuid4()}{ext}"
    path = os.path.join(UPLOAD_FOLDER, filename)
    file_storage.save(path)
    return path

# Night captures: below this mean gray, YOLO/MTCNN routinely fail to find the
# face at all, so identity matching was impossible after dark. Mirrors the
# anti-spoof service's own low-light gate (ANTISPOOF_MIN_BRIGHTNESS).
NIGHT_MEAN_GRAY = float(os.environ.get("FACE_NIGHT_MEAN_GRAY", "45"))

def enhance_night_frame_for_matching(img_path):
    """If the captured frame is a night/low-light shot, write a brightened +
    denoised copy next to it and return that path; otherwise return img_path.

    Only the IDENTITY-MATCHING pipeline (quality gate + YOLO + MTCNN +
    embedding) reads the enhanced copy. The anti-spoof PAD keeps judging the
    ORIGINAL frame — it has its own calibrated low-light handling, and feeding
    it a denoised frame would blunt the replay-texture cues it relies on.
    Returns (path_for_matching, cleanup_path_or_None)."""
    img = cv2.imread(img_path)
    if img is None:
        return img_path, None
    mean_gray = float(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).mean())
    if mean_gray >= NIGHT_MEAN_GRAY:
        return img_path, None
    if mean_gray <= 1:
        mean_gray = 1.0
    # Gamma-brighten toward mean ~110 (exponent < 1 brightens), then denoise —
    # night frames carry heavy ISO grain that confuses face detection too.
    exp = np.log(110.0 / 255.0) / np.log(mean_gray / 255.0)
    exp = min(1.0, max(0.30, exp))
    lut = np.array([((i / 255.0) ** exp) * 255 for i in range(256)]).astype("uint8")
    out = cv2.LUT(img, lut)
    out = cv2.fastNlMeansDenoisingColored(out, None, 10, 10, 7, 21)
    enhanced_path = img_path + ".night.jpg"
    cv2.imwrite(enhanced_path, out)
    return enhanced_path, enhanced_path

def normalize_embedding(embedding):
    return embedding / np.linalg.norm(embedding)

def _expand_box(x1, y1, x2, y2, w, h, margin_frac=0.30):
    """Grow a detection box by margin_frac on every side, clamped to the image.

    YOLO's box hugs the face; cropping it verbatim clips chin/forehead and
    starves MTCNN (which re-detects inside the crop for alignment) of the
    surrounding context it needs. The extra margin only helps MTCNN find and
    align the face — MTCNN still cuts its OWN tight box for the embedding, so
    the final crop geometry (and therefore the embedding domain the stored
    references live in) is unchanged.
    """
    bw, bh = x2 - x1, y2 - y1
    mx, my = int(bw * margin_frac), int(bh * margin_frac)
    return max(0, x1 - mx), max(0, y1 - my), min(w, x2 + mx), min(h, y2 + my)


def _embed_aligned(face_tensor):
    """Aligned 160x160 face tensor -> L2-normalized 512-d embedding with
    horizontal-flip test-time augmentation (embed face + mirror, average).
    Flip-TTA is a standard, model-free robustness gain against pose and
    lighting asymmetry — the two embeddings agree strongly for a genuine
    stable identity and average out single-view noise."""
    if face_tensor is None:
        return None
    if len(face_tensor.shape) == 3:
        face_tensor = face_tensor.unsqueeze(0)
    with torch.no_grad():
        batch = torch.cat([face_tensor, torch.flip(face_tensor, dims=[3])], dim=0)
        embs = resnet(batch).cpu().numpy()
    return normalize_embedding(embs.mean(axis=0).flatten())


def get_face_embedding(image_path):
    img = cv2.imread(image_path)
    # cv2.imread returns None for unreadable / unsupported (e.g. HEIC) / corrupt
    # files. Without this guard, the crop below raised
    # "TypeError: 'NoneType' object is not subscriptable" — a 500 on /verify-face
    # and, during enrollment, an uncaught crash that aborted the WHOLE
    # /create-embedding so even the good images were never stored.
    if img is None:
        print(f"[get_face_embedding] could not decode image: {image_path}")
        return None
    h, w = img.shape[:2]
    results = model(img)
    boxes = results[0].boxes.xyxy.cpu().numpy()

    # Candidate regions for MTCNN, best first: margin-expanded YOLO boxes
    # (largest face first), then the FULL frame as a fallback — if YOLO's box
    # was off (partial face, unusual angle) MTCNN still gets one clean shot at
    # the whole image instead of the old behaviour of giving up with no_face.
    candidates = []
    for box in sorted(boxes, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]), reverse=True):
        x1, y1, x2, y2 = _expand_box(*map(int, box[:4]), w, h)
        if x2 - x1 >= 40 and y2 - y1 >= 40:
            candidates.append(img[y1:y2, x1:x2])
    candidates.append(img)

    for crop in candidates:
        face_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        try:
            face_tensor = mtcnn(face_rgb)
        except Exception as e:  # noqa: BLE001
            print(f"[get_face_embedding] mtcnn failed on a candidate crop: {e}")
            continue
        emb = _embed_aligned(face_tensor)
        if emb is not None:
            return emb
    return None

# Below this consensus similarity to the group mean, a per-image embedding is
# treated as an outlier (wrong person cropped in, a YOLO/MTCNN misdetection
# that aligned the wrong region, etc.) rather than just "a different pose".
# Genuine multi-pose variation for the same person still clusters well above
# this on a 512-d VGGFace2 embedding; ~0.5 is comfortably below normal
# same-identity pose spread and comfortably above cross-identity noise.
OUTLIER_SIM_FLOOR = float(os.environ.get("FACE_OUTLIER_SIM_FLOOR", "0.5"))
# Never prune below this many views — with very few images, an unusual but
# genuine pose could look like an "outlier" against the rest; better to keep
# it than to shrink an already-thin enrollment further.
OUTLIER_MIN_KEEP = 3


def _reject_outliers(embeddings):
    """Drop per-image embeddings that don't agree with the group consensus.

    One mis-cropped face or wrong-person frame slipping into the enrollment
    batch would otherwise drag the averaged reference off the true identity
    AND get stored as a valid "view" for best-view verification matching —
    i.e. it wouldn't just blur the mean, it would let that other face/crop
    authenticate too. Filtering here removes it from both.
    """
    n = len(embeddings)
    if n <= OUTLIER_MIN_KEEP:
        return embeddings
    mean = normalize_embedding(np.mean(embeddings, axis=0))
    sims = [float(np.dot(e, mean)) for e in embeddings]
    order = sorted(range(n), key=lambda i: sims[i], reverse=True)
    kept = [i for i in order if sims[i] >= OUTLIER_SIM_FLOOR]
    if len(kept) < OUTLIER_MIN_KEEP:
        # Everything looked equally "off" (e.g. a genuinely hard batch) —
        # keep the best-agreeing ones rather than aggregating nothing.
        kept = order[:OUTLIER_MIN_KEEP]
    dropped = n - len(kept)
    if dropped:
        print(f"[get_aggregated_embedding] dropped {dropped}/{n} outlier image(s) "
              f"(sim floor {OUTLIER_SIM_FLOOR})")
    return [embeddings[i] for i in kept]


def get_aggregated_embedding(image_paths):
    """Returns (mean_embedding, per_image_embeddings) — or (None, []).

    The mean is the compact reference; the per-image list is ALSO stored so
    verification can take the best match against each enrolled view
    (frontal/left/right/smiling...) instead of only their average, which
    blurs pose-specific detail exactly when the live capture matches one
    enrolled view strongly. Both are built from the SAME outlier-filtered set
    so a bad frame can't leak into either."""
    embeddings = []
    for img_path in image_paths:
        # Never let one bad image (unreadable, no face, model hiccup) abort the
        # whole enrollment — skip it and aggregate from the rest.
        try:
            emb = get_face_embedding(img_path)
        except Exception as e:  # noqa: BLE001
            print(f"[get_aggregated_embedding] skipping {img_path}: {e}")
            emb = None
        if emb is not None:
            embeddings.append(emb)
    if not embeddings:
        return None, []
    kept = _reject_outliers(embeddings)
    agg_emb = normalize_embedding(np.mean(kept, axis=0))
    return agg_emb, kept

def cosine_similarity(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

@app.route("/create-embedding", methods=["POST"])
def create_embedding():
    print("Received files:", request.files)
    user_id = request.form.get("user_id")
    name = request.form.get("name")
    email = request.form.get("email")
    # Accept multiple images: field name 'face_images'
    face_images = request.files.getlist("face_images")
    print(f"Received user_id: {user_id}, name: {name}, email: {email}")
    print(f"Received face_images: {face_images}")

    if not user_id or not face_images or len(face_images) == 0:
        return jsonify({"error": "user_id and at least one face image are required"}), 400

    img_paths = []
    for file_storage in face_images:
        img_path = save_temp_image(file_storage)
        img_paths.append(img_path)

    # ------------------------------------------------------------------
    # Enrollment security screening (closes the biggest gap in the anti-
    # fraud pipeline: an enrolled reference face used to become permanent
    # ground truth with ZERO liveness/anti-spoof scrutiny — only geometric
    # checks. Every future /verify-face cosine-similarity match is judged
    # against whatever gets enrolled, so a spoofed reference defeats every
    # downstream control forever.
    #
    # Reuses the EXACT SAME fine-tuned MiniFASNet PAD model and margin logic
    # already proven at verification time (antispoof_service.py) — no new
    # model, no duplicated decision logic. Each uploaded image is classified
    # independently into one of three tiers so a genuine employee with one
    # bad photo is never penalized, only that one photo is set aside:
    #   usable           -> passed geometry AND PAD -> used for the embedding
    #   quality_rejected -> failed geometry, brightness/sharpness, or PAD
    #                       couldn't find a face. NOT a security signal —
    #                       excluded so a bad photo can't degrade the
    #                       reference embedding, but never flags the person.
    #   spoof_suspected   -> PAD confidently flagged FAKE (print/replay
    #                       texture). Excluded from the embedding; reported
    #                       back to the caller (server/services/
    #                       faceVerifyService.js -> securityEventService.js)
    #                       so a SecurityEvent is recorded for admin review.
    # Enrollment never hard-fails on a single bad/suspect image as long as at
    # least one image is usable — mirrors the "poor quality != spoof, never
    # falsely accuse" requirement for the live verification path.
    # ------------------------------------------------------------------
    usable_paths = []
    per_image = []
    for img_path in img_paths:
        ok, reason = face_quality_gate(img_path)
        if not ok:
            per_image.append({"status": "quality_rejected", "reason": reason})
            continue
        spoof = antispoof_predict(image_path=img_path) if antispoof_predict else {"available": False}
        label = spoof.get("label") if isinstance(spoof, dict) else None
        if label == "fake":
            per_image.append({
                "status": "spoof_suspected",
                "reason": "pad_fake",
                "score": spoof.get("score"),
                "margin": spoof.get("margin"),
            })
            continue
        if label in ("retry", "no_face"):
            # PAD's own capture-quality / no-face gate — same "poor quality,
            # not fraud" bucket as the geometry gate above.
            per_image.append({"status": "quality_rejected", "reason": spoof.get("reason") or label})
            continue
        # label is 'real' or 'uncertain' — or PAD is simply unavailable
        # (`spoof.get("available")` False): a privileged admin/HOD upload is
        # not the same trust boundary as an anonymous attendance attempt, so
        # PAD-unavailable fails OPEN here (matches the geometry-only
        # behaviour this endpoint always had) rather than blocking every
        # enrollment whenever the PAD service happens to be down.
        per_image.append({"status": "usable", "label": label, "score": spoof.get("score")})
        usable_paths.append(img_path)

    spoof_count = sum(1 for p in per_image if p["status"] == "spoof_suspected")
    quality_count = sum(1 for p in per_image if p["status"] == "quality_rejected")
    usable_count = len(usable_paths)

    if usable_count == 0:
        for p in img_paths:
            try:
                os.remove(p)
            except OSError:
                pass
        security = {
            "perImage": per_image,
            "usableCount": 0,
            "spoofCount": spoof_count,
            "qualityCount": quality_count,
            "flagged": spoof_count > 0,
        }
        if spoof_count > 0 and quality_count == 0:
            # Every submitted image was confidently flagged — tell the admin
            # plainly (they are a privileged operator uploading on someone
            # else's behalf, not an anonymous attacker probing the system).
            return jsonify({
                "error": "All submitted images failed a security check and could not be used for enrollment.",
                "security": security,
            }), 400
        reason_str = ""
        if len(per_image) > 0 and "reason" in per_image[0]:
            reason_str = f" (Reason: {per_image[0]['reason']})"
        return jsonify({
            "error": f"No usable image — please provide a clearer, well-lit photo of the face.{reason_str}",
            "security": security,
        }), 400

    if usable_count < MIN_ENROLLMENT_IMAGES:
        for p in img_paths:
            try:
                os.remove(p)
            except OSError:
                pass
        security = {
            "perImage": per_image,
            "usableCount": usable_count,
            "spoofCount": spoof_count,
            "qualityCount": quality_count,
            "flagged": spoof_count > 0,
        }
        return jsonify({
            "error": (
                f"Only {usable_count} of {len(img_paths)} uploaded images passed the "
                f"quality/security check — at least {MIN_ENROLLMENT_IMAGES} usable images "
                "are required for a reliable enrollment. Please retake the rejected photos "
                "(clear, well-lit, single face) and try again."
            ),
            "security": security,
        }), 400

    embedding, per_image_embeddings = get_aggregated_embedding(usable_paths)

    # Compute ArcFace references BEFORE the temp files are deleted below (only
    # when the InsightFace ensemble is active). Stored per usable view + a mean;
    # verify-face-multi uses them as a second opinion. Empty when ArcFace isn't
    # installed → recognition stays facenet-only for this person, as before.
    arc_views = []
    if arcface is not None and arcface.available():
        for p in usable_paths:
            emb = arcface.embed_safe(image_path=p)
            if emb is not None:
                arc_views.append(emb)

    # Clean up temp files (all of them, including any excluded images).
    for img_path in img_paths:
        try:
            os.remove(img_path)
        except OSError:
            pass

    if embedding is None:
        return jsonify({
            "error": "No face detected in any image",
            "security": {"perImage": per_image, "usableCount": usable_count, "spoofCount": spoof_count, "qualityCount": quality_count},
        }), 400

    update = {
        "name": name,
        "email": email,
        "embedding": embedding.tolist(),
        # Per-enrolled-view embeddings for best-view matching at verify
        # time. Older docs simply lack this field and fall back to the
        # mean-only comparison.
        "embeddings": [e.tolist() for e in per_image_embeddings],
    }

    if arc_views:
        arc_mean = np.mean(np.array(arc_views), axis=0)
        arc_mean = (arc_mean / np.linalg.norm(arc_mean)).tolist()
        update["arcface_embedding"] = arc_mean
        update["arcface_embeddings"] = arc_views
        print(f"[create-embedding] stored {len(arc_views)} ArcFace view(s) for {user_id}")

    collection.update_one({"_id": user_id}, {"$set": update}, upsert=True)

    return jsonify({
        "status": "success",
        "message": "Embedding saved",
        "security": {
            "perImage": per_image,
            "usableCount": usable_count,
            "spoofCount": spoof_count,
            "qualityCount": quality_count,
            "flagged": spoof_count > 0,
        },
    })



@app.route("/verify-face", methods=["POST"])
def verify_face():
    user_id = request.form.get("user_id")
    face_image = request.files.get("face_image")
    print(f"Received user_id: {user_id}")
    

    if not user_id or not face_image:
        return jsonify({"error": "user_id and face_image are required"}), 400

    student = collection.find_one({"_id": user_id})
    if not student or "embedding" not in student:
        return jsonify({"match": False, "reason": "No embedding found"}), 404

    stored_embedding = np.array(student["embedding"])
    img_path = save_temp_image(face_image)
    # Night capture? Brighten+denoise a COPY for the identity-matching pipeline
    # so the face can actually be found/matched after dark. PAD still judges
    # the original frame (it has its own calibrated low-light handling).
    match_path, night_cleanup = enhance_night_frame_for_matching(img_path)
    quality_ok, quality_reason = face_quality_gate(match_path)
    if not quality_ok:
        os.remove(img_path)
        if night_cleanup:
            try:
                os.remove(night_cleanup)
            except OSError:
                pass
        return jsonify({
            "match": False,
            "reason": quality_reason,
            "spoof": {"available": True, "label": "retry", "reason": quality_reason},
        })
    test_embedding = get_face_embedding(match_path)
    # Run the anti-spoof PAD on the SAME captured frame before we delete it. A
    # screen/photo replay shows the user's REAL face, so it would otherwise pass
    # the embedding match — this is what catches it.
    spoof = antispoof_predict(image_path=img_path) if antispoof_predict else {"available": False}
    os.remove(img_path)
    if night_cleanup:
        try:
            os.remove(night_cleanup)
        except OSError:
            pass
    print(f"Spoof verdict: {spoof}")

    if test_embedding is None:
        # 200, not 400: "no face found in the frame" is a business outcome the
        # caller must read (the Node wrapper treats non-2xx as service-down and
        # would lose the spoof/retry info that tells the app to recapture).
        return jsonify({"match": False, "reason": "no_face", "spoof": spoof})

    # Best-view matching: compare against the mean reference AND every
    # individually enrolled view (when available), and score on the best.
    # A live capture that strongly matches ONE enrolled view (say the
    # left-profile enrollment photo) is genuine even if the mean — which
    # blurs all poses together — sits lower. Impostors don't benefit: their
    # similarity is low against every view, so the max stays low too.
    references = []
    if stored_embedding.shape == test_embedding.shape:
        references.append(stored_embedding)
    for e in student.get("embeddings") or []:
        ref = np.array(e)
        if ref.shape == test_embedding.shape:
            references.append(ref)
    if not references:
        # The stored reference predates this pipeline and is dimensionally
        # corrupt (the old keep_all bug could flatten N faces into one 512*N
        # vector). Comparing would crash; the honest answer is re-enrollment.
        print(f"[verify_face] stored embedding shape {stored_embedding.shape} incompatible with {test_embedding.shape} — re-enrollment required for {user_id}")
        return jsonify({"match": False, "reason": "Stored face data is invalid — please re-register this person's face.", "spoof": spoof})
    sims = [cosine_similarity(ref, test_embedding) for ref in references]
    sim = max(sims)
    print(f"Similarity: {sim} (best of {len(references)} reference view(s): {[round(float(s), 4) for s in sims]})")

    is_match = bool(sim >= FACE_MATCH_THRESHOLD)
    
    response = {
        "match": is_match,
        "similarity": round(float(sim), 4),
        "name": student["name"] if is_match else None,
        "spoof": spoof
    }
    
    if not is_match:
        response["reason"] = f"Face not recognized (Score: {sim:.2f}, Needs: {FACE_MATCH_THRESHOLD:.2f})"
        
    return jsonify(response)


@app.route("/verify-face-multi", methods=["POST"])
def verify_face_multi():
    """Multi-frame verification: one identity decision + one anti-spoof decision
    over the SEVERAL frames the app captured across the live liveness challenge
    (one per action step + the final capture).

    Identity  : best-of-N — the highest cosine similarity of ANY frame against
                ANY enrolled reference view. One well-framed frame is enough to
                recognise a genuine user (impostors stay low on every frame).
    Anti-spoof: antispoof_service.predict_multi — ANY confident-fake frame fails
                the whole attempt (during a live challenge the attacker's
                screen/bezel enters at least one frame), while a genuine session
                scores real on every frame. This is the frame-filling-replay fix
                that a single final photo could never catch.

    Multipart: user_id + repeated `face_images` (>=1). Falls back gracefully to
    single-frame behaviour when only one image is sent.
    """
    user_id = request.form.get("user_id")
    face_images = request.files.getlist("face_images")
    # Tolerate a lone `face_image` too, so the app can use one endpoint.
    if not face_images:
        single = request.files.get("face_image")
        if single:
            face_images = [single]
    print(f"Received user_id: {user_id}, frames: {len(face_images)}")

    if not user_id or not face_images:
        return jsonify({"error": "user_id and at least one face_image are required"}), 400

    student = collection.find_one({"_id": user_id})
    if not student or "embedding" not in student:
        return jsonify({"match": False, "reason": "No embedding found"}), 404

    stored_embedding = np.array(student["embedding"])

    # Build the reference set once (mean + per-view embeddings).
    def _references(test_shape):
        refs = []
        if stored_embedding.shape == test_shape:
            refs.append(stored_embedding)
        for e in student.get("embeddings") or []:
            ref = np.array(e)
            if ref.shape == test_shape:
                refs.append(ref)
        return refs

    orig_paths = []          # untouched frames — PAD judges these
    match_paths = []         # night-enhanced copies for identity matching
    cleanup_paths = []
    try:
        for fs in face_images:
            p = save_temp_image(fs)
            orig_paths.append(p)
            cleanup_paths.append(p)
            mpath, night_cleanup = enhance_night_frame_for_matching(p)
            match_paths.append(mpath)
            if night_cleanup:
                cleanup_paths.append(night_cleanup)

        # ArcFace second-opinion references for this person (only present if they
        # were enrolled while the InsightFace ensemble was active).
        arc_refs = []
        if arcface is not None and arcface.available():
            arc_refs = list(student.get("arcface_embeddings") or [])
            single = student.get("arcface_embedding")
            if single:
                arc_refs.append(single)

        # ---- Identity: best similarity across every usable frame ----
        best_sim = -1.0
        best_name = None
        best_arc_sim = None       # None = no ArcFace comparison was possible
        any_quality_ok = False
        any_face = False
        for mpath in match_paths:
            ok, _reason = face_quality_gate(mpath)
            if not ok:
                continue
            any_quality_ok = True
            emb = get_face_embedding(mpath)
            if emb is None:
                continue
            any_face = True
            refs = _references(emb.shape)
            if not refs:
                continue
            sim = max(cosine_similarity(r, emb) for r in refs)
            if sim > best_sim:
                best_sim = sim
                best_name = student.get("name")
            # Additive ArcFace check on the SAME frame (best across frames).
            if arc_refs:
                arc_emb = arcface.embed_safe(image_path=mpath)
                arc_sim = arcface.best_similarity(arc_emb, arc_refs)
                if arc_sim is not None and (best_arc_sim is None or arc_sim > best_arc_sim):
                    best_arc_sim = arc_sim

        # ---- Anti-spoof: fuse across ALL original frames ----
        if antispoof_predict_multi:
            spoof = antispoof_predict_multi(image_paths=orig_paths)
        elif antispoof_predict:
            spoof = antispoof_predict(image_path=orig_paths[-1])
        else:
            spoof = {"available": False}
    finally:
        for p in cleanup_paths:
            try:
                os.remove(p)
            except OSError:
                pass

    print(f"Multi verify: best_sim={best_sim:.4f} frames={len(orig_paths)} spoof={spoof.get('label')}")

    if not any_quality_ok:
        return jsonify({"match": False, "reason": "low_quality",
                        "spoof": {"available": True, "label": "retry", "reason": "low_quality"}})
    if not any_face:
        return jsonify({"match": False, "reason": "no_face", "spoof": spoof})

    facenet_match = bool(best_sim >= FACE_MATCH_THRESHOLD)
    # ArcFace is a SECOND OPINION that can only VETO a facenet match, never
    # create one (additive security, no re-enrollment, no new false-accepts on
    # people without an ArcFace reference). It vetoes only when it has a
    # reference to compare AND clearly disagrees (sim below its permissive
    # floor) — a likely impostor that fooled facenet.
    arc_veto = (best_arc_sim is not None and best_arc_sim < arcface.ARCFACE_MATCH_THRESHOLD) if arcface else False
    is_match = facenet_match and not arc_veto

    response = {
        "match": is_match,
        "similarity": round(float(best_sim), 4),
        "arcSimilarity": round(float(best_arc_sim), 4) if best_arc_sim is not None else None,
        "name": best_name if is_match else None,
        "frameCount": len(orig_paths),
        "spoof": spoof,
    }
    if not is_match:
        if arc_veto and facenet_match:
            print(f"[verify-multi] ArcFace VETO: facenet {best_sim:.3f} ok but ArcFace {best_arc_sim:.3f} "
                  f"< {arcface.ARCFACE_MATCH_THRESHOLD} — likely impostor")
            response["reason"] = f"Face not recognized (Score: {best_sim:.2f}, Needs: {FACE_MATCH_THRESHOLD:.2f})"
        else:
            response["reason"] = f"Face not recognized (Score: {best_sim:.2f}, Needs: {FACE_MATCH_THRESHOLD:.2f})"
    return jsonify(response)


@app.route("/antispoof", methods=["POST"])
def antispoof():
    """Anti-spoof ONLY (no identity match). Used by the super-admin retroactive
    'Check Anti-Spam Faces' scan: given a stored capture, is it a real live face
    or a phone-screen / photo replay? Returns { spoof: {available, real, label,
    score} }."""
    face_image = request.files.get("face_image")
    if not face_image:
        return jsonify({"error": "face_image is required"}), 400
    img_path = save_temp_image(face_image)
    try:
        result = antispoof_predict(image_path=img_path) if antispoof_predict else {"available": False}
    finally:
        try:
            os.remove(img_path)
        except OSError:
            pass
    return jsonify({"spoof": result})


@app.route("/antispoof-vlm-rescan", methods=["POST"])
def antispoof_vlm_rescan():
    """VLM-ONLY rescan — called by Node AFTER attendance/spot-check has
    already been marked and responded to the user (fire-and-forget, never
    awaited on the request path — see server/routes/attendance.js and
    spotChecks.js). This is deliberately the ONLY place vlm_spoof_service
    runs: a 10-60s hosted-model call has no business blocking a user's
    "Verifying..." screen, so it never runs inside /verify-face,
    /verify-face-multi, or /antispoof. Its sole purpose is to correct the
    admin spoof-review dashboard's label after the fact, for the cases the
    fast local models (MiniFASNet, DeePixBiS) couldn't confidently call.
    Returns { vlm: {available, isFake, label, reason, raw} } — the caller
    decides what to do with it (create/update a SpoofAttempt, etc.); this
    route itself never touches the database."""
    face_image = request.files.get("face_image")
    if not face_image:
        return jsonify({"error": "face_image is required"}), 400
    if vlm_spoof_service is None:
        return jsonify({"vlm": {"available": False, "isFake": False, "label": None, "reason": "module_unavailable", "raw": None}})
    img_path = save_temp_image(face_image)
    try:
        img = cv2.imread(img_path)
        result = vlm_spoof_service.predict_safe(img) if img is not None else {
            "available": False, "isFake": False, "label": None, "reason": "unreadable_image", "raw": None,
        }
    finally:
        try:
            os.remove(img_path)
        except OSError:
            pass
    return jsonify({"vlm": result})


if __name__ == "__main__":
    port = int(os.environ.get("FACE_API_PORT", "50011"))
    # Flask's built-in dev server (app.run without threaded=True) handles ONE
    # request at a time. A spot-check round pushes many staff through
    # /verify-face within the same few-minute window, and each response also
    # re-verifies server-side (server/routes/spotChecks.js) — so requests
    # queued up behind this single thread, and whichever one waited past the
    # Node side's FACE_API_TIMEOUT_MS (8s) failed closed with a generic
    # "Verification could not be completed" error even though nothing was
    # actually wrong with that person's face. waitress is a real threaded WSGI
    # server (gunicorn needs fcntl, unavailable on Windows) so concurrent
    # verifications are actually processed instead of queuing serially.
    # FACE_BACK_DEV=1 keeps the old debug/reloader dev server for local debugging.
    if os.environ.get("FACE_BACK_DEV") == "1":
        app.run(host="0.0.0.0", port=port, debug=True)
    else:
        from waitress import serve
        threads = int(os.environ.get("FACE_API_THREADS", "8"))
        print(f"[check] serving with waitress on 0.0.0.0:{port} (threads={threads})")
        serve(app, host="0.0.0.0", port=port, threads=threads)
