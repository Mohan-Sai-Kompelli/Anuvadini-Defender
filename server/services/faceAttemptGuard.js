const FaceVerificationAttempt = require('../models/FaceVerificationAttempt');

const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 30 * 60 * 1000;
const MAX_FAILURES = 5;

async function status(studentId) {
  const activeLock = await FaceVerificationAttempt.findOne({
    student: studentId,
    lockedUntil: { $gt: new Date() },
  })
    .sort({ lockedUntil: -1 })
    .select('lockedUntil')
    .lean();
  return activeLock ? { locked: true, lockedUntil: activeLock.lockedUntil } : { locked: false };
}

async function recordFailure({ student, reason, similarity, padLabel }) {
  const studentId = student._id || student;
  const since = new Date(Date.now() - FAILURE_WINDOW_MS);
  const lastSuccess = await FaceVerificationAttempt.findOne({ student: studentId, success: true })
    .sort({ createdAt: -1 })
    .select('createdAt')
    .lean();
  const failureStart = lastSuccess?.createdAt > since ? lastSuccess.createdAt : since;
  const recentFailures = await FaceVerificationAttempt.countDocuments({
    student: studentId,
    success: false,
    createdAt: { $gte: failureStart },
  });
  const lockedUntil = recentFailures + 1 >= MAX_FAILURES
    ? new Date(Date.now() + LOCK_MS)
    : null;
  await FaceVerificationAttempt.create({
    student: studentId,
    organization: student.organization || null,
    success: false,
    reason: reason || 'verification_failed',
    similarity: typeof similarity === 'number' ? similarity : null,
    padLabel: padLabel || null,
    lockedUntil,
  });
  return {
    locked: Boolean(lockedUntil),
    lockedUntil,
    remainingAttempts: Math.max(0, MAX_FAILURES - (recentFailures + 1)),
  };
}

async function recordSuccess({ student, similarity, padLabel }) {
  await FaceVerificationAttempt.create({
    student: student._id || student,
    organization: student.organization || null,
    success: true,
    reason: 'verified',
    similarity: typeof similarity === 'number' ? similarity : null,
    padLabel: padLabel || null,
  });
}

module.exports = { status, recordFailure, recordSuccess, MAX_FAILURES, LOCK_MS };
