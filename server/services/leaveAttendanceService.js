const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const audit = require('./auditService');

/**
 * LeaveAttendanceService
 * ----------------------
 * On leave approval, auto-mark each covered day "On Approved Leave" as an
 * Attendance record of type 'leave' (SAACMS Module 4). These records are NOT
 * physical check-ins — existing dashboards filter type:'in'/'out', so leave
 * days never inflate presence counts; they just let the Admin see leave vs.
 * unapproved absence explicitly.
 *
 * Idempotent: one 'leave' record per (student, day, leaveRequest).
 */
class LeaveAttendanceService {
  _eachDay(start, end) {
    const days = [];
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    let guard = 0;
    while (d <= last && guard < 400) {
      days.push(new Date(d));
      d.setDate(d.getDate() + 1);
      guard += 1;
    }
    return days;
  }

  /**
   * Create 'leave' attendance records for every day an approved leave covers.
   * @param {Object} leaveRequest a Model_LeaveRequest doc (needs student + leaveDates)
   * @returns {Object} { marked, skipped, days }
   */
  async markApprovedLeave(leaveRequest) {
    if (!leaveRequest || !leaveRequest.leaveDates) {
      return { marked: 0, skipped: 0, days: 0, reason: 'no_dates' };
    }
    const { start, end } = leaveRequest.leaveDates;
    if (!start || !end) return { marked: 0, skipped: 0, days: 0, reason: 'no_dates' };

    const student = await Student.findById(leaveRequest.student).select('_id organization');
    if (!student) return { marked: 0, skipped: 0, days: 0, reason: 'student_not_found' };

    const days = this._eachDay(new Date(start), new Date(end));
    let marked = 0;
    let skipped = 0;

    for (const day of days) {
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      // Skip if a real check-in OR an existing leave mark already exists that day.
      const existing = await Attendance.findOne({
        student: student._id,
        timestamp: { $gte: dayStart, $lt: dayEnd },
        $or: [{ type: 'in' }, { type: 'leave' }],
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      await Attendance.create({
        student: student._id,
        organization: student.organization,
        type: 'leave',
        timestamp: dayStart,
        status: 'on_leave',
        authMethod: 'manual',
        leaveRequestId: leaveRequest._id,
      });
      marked += 1;
    }

    audit.log({
      organization: student.organization,
      actorType: 'system',
      action: 'leave.auto_marked',
      outcome: 'success',
      targetType: 'leave',
      target: leaveRequest._id,
      metadata: { student: String(student._id), days: days.length, marked, skipped },
    });

    return { marked, skipped, days: days.length };
  }

  /**
   * Remove auto-marked leave days for a request (e.g. if it is later rejected
   * or cancelled). Only deletes the type:'leave' records this service created.
   */
  async clearLeaveMarks(leaveRequestId) {
    const result = await Attendance.deleteMany({ leaveRequestId, type: 'leave' });
    return { removed: result.deletedCount || 0 };
  }
}

module.exports = new LeaveAttendanceService();
