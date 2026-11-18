/**
 * Deferred face re-verification ("mark now, verify async").
 *
 * When the face engine is unreachable/overloaded during a check-in rush, the
 * attendance route (routes/attendance.js) still records the mark but flags it
 * `faceVerifyPending: true` (see FACE_VERIFY_FAIL_CLOSED=false). This job settles
 * that debt: once the engine is healthy again it re-verifies each pending
 * capture against the enrolled identity and updates `faceVerified`. A capture
 * that turns out NOT to match (or is a confident spoof) raises the SAME
 * impersonation alert the real-time path would have — so overload buys
 * availability WITHOUT losing the fraud signal, it only delays it.
 *
 * Runs on a short cron (see index.js). Idempotent + self-throttling: a batch at
 * a time, skips while a previous cycle is still running, and leaves a record
 * pending (to retry next cycle) whenever the engine is still down.
 */
const fs = require('fs');
const path = require('path');
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const faceVerifyService = require('./faceVerifyService');
const securityEventService = require('./securityEventService');

const SERVER_ROOT = path.join(__dirname, '..');
const BATCH = parseInt(process.env.FACE_REVERIFY_BATCH || '25', 10);
const MISMATCH_ALERT_MAX = parseFloat(process.env.MISMATCH_ALERT_MAX_SIMILARITY || '0.45');

/**
 * Resolve the stored capture into something faceVerifyService.verify accepts.
 * attendance.faceImage is either a server-root-relative disk path
 * (face_storage/…) or, on a disk-write fallback, an inline base64 data URL.
 */
function loadCapture(faceImage) {
  if (!faceImage || typeof faceImage !== 'string') return null;
  if (faceImage.startsWith('data:') || !faceImage.includes('/')) {
    return faceImage; // inline base64 / data URL
  }
  try {
    return fs.readFileSync(path.join(SERVER_ROOT, faceImage));
  } catch (_e) {
    return null;
  }
}

let running = false;

async function processPending() {
  if (running) return { skipped: true };
  running = true;
  let settled = 0;
  let stillDown = 0;
  try {
    const pending = await Attendance.find({ faceVerifyPending: true })
      .sort({ createdAt: 1 })
      .limit(BATCH);
    if (!pending.length) return { settled: 0 };

    for (const att of pending) {
      const student = await Student.findById(att.student).select('uid fullName name organization');
      if (!student) {
        att.faceVerifyPending = false;
        att.faceVerifyDeferredReason = 'student_not_found';
        att.faceVerifyReverifiedAt = new Date();
        await att.save();
        settled++;
        continue;
      }

      const image = loadCapture(att.faceImage);
      if (!image) {
        // No capture to re-verify against — cannot ever settle; stop retrying.
        att.faceVerifyPending = false;
        att.faceVerifyDeferredReason = 'capture_missing';
        att.faceVerifyReverifiedAt = new Date();
        await att.save();
        settled++;
        continue;
      }

      const result = await faceVerifyService.verify(
        { uid: student.uid, faceImage: image },
        { conservativeFakeGate: true }
      );

      if (!result.reachable) {
        // Engine still saturated/down — leave pending, retry next cycle.
        stillDown++;
        continue;
      }

      const spoofFake = !!(result.spoof && result.spoof.isFake === true);
      const matched = result.match === true && !spoofFake;
      att.faceVerified = matched;
      att.faceVerifyPending = false;
      att.faceVerifyReverifiedAt = new Date();
      if (typeof result.score === 'number') att.verificationScore = result.score;
      await att.save();
      settled++;

      if (!matched) {
        // The deferred mark did NOT check out. Raise the same alert the
        // real-time path would have, now with the stored evidence, so an
        // admin can review the attendance that was let through during the rush.
        try {
          await securityEventService.record({
            category: spoofFake ? 'spoof_detected' : 'face_mismatch_pattern',
            severity: 'high',
            student,
            sessionType: att.type,
            detection: {
              faceMatchConfidence: result.similarity ?? result.score ?? null,
              signals: [spoofFake ? 'deferred_spoof' : 'deferred_mismatch'],
            },
            evidenceImage: typeof image === 'string' ? image : undefined,
            summaryForAdmin: `A DEFERRED (engine-overload) ${att.type === 'in' ? 'check-in' : 'check-out'} on ${student.fullName || student.uid} FAILED re-verification (${spoofFake ? 'confident spoof' : 'identity mismatch'}). The attendance was recorded during the rush and now needs manual review.`,
          });
        } catch (e) {
          console.error('[faceReverify] alert record failed:', e.message);
        }
        console.log(`[faceReverify] att=${att._id} uid=${student.uid} FAILED re-verify (${spoofFake ? 'spoof' : 'mismatch'}, sim=${result.similarity ?? result.score}) — flagged for review`);
      } else {
        console.log(`[faceReverify] att=${att._id} uid=${student.uid} re-verified OK (score=${att.verificationScore})`);
      }
    }
    if (settled || stillDown) {
      console.log(`[faceReverify] cycle done: settled=${settled}, still-deferred(engine down)=${stillDown}`);
    }
    return { settled, stillDown };
  } catch (e) {
    console.error('[faceReverify] cycle error:', e.message);
    return { error: e.message };
  } finally {
    running = false;
  }
}

module.exports = { processPending, loadCapture };
