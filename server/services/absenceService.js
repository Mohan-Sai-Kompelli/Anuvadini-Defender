const AbsenceFlag = require('../models/AbsenceFlag');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const LeaveRequest = require('../models/Model_LeaveRequest');
const audit = require('./auditService');

/**
 * AbsenceService — detects staff who are absent WITHOUT approval.
 *
 * A person is an "unapproved absence" for a day if ALL hold:
 *   - no check-in ('in') that day
 *   - no approved leave covering that day
 *   - no active WFH assignment / legacy WFH for that day
 *
 * Approved leave and WFH are EXCLUDED (they are legitimate), giving the Admin the
 * "clear distinction from unapproved absence" the proposal asks for.
 */
class AbsenceService {
  _dayBounds(date = new Date()) {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  /** Does this student have an active WFH covering [start,end)? */
  _hasWfhForDay(student, start, end) {
    if (student.WFH === 'WFH allowed' || student.WFH === 'Allowed') return true;
    if (!Array.isArray(student.wfhAssignments)) return false;
    return student.wfhAssignments.some(
      (a) =>
        a.isActive &&
        new Date(a.startDate) < end &&
        new Date(a.endDate) >= start
    );
  }

  /**
   * Detect unapproved absentees for one organization on a given day.
   * @param {String} organizationId
   * @param {Object} opts { date, source }
   * @returns {Object} { organization, date, absentCount, absentees: [{student, name, uid, department}] }
   */
  async detectForOrg(organizationId, opts = {}) {
    const date = opts.date ? new Date(opts.date) : new Date();
    const source = opts.source || 'auto';
    const { start, end } = this._dayBounds(date);

    const students = await Student.find({ organization: organizationId, isActive: true }).select(
      '_id fullName uid department WFH wfhAssignments'
    );
    if (!students.length) {
      return { organization: organizationId, date: start, absentCount: 0, absentees: [] };
    }
    const studentIds = students.map((s) => s._id);

    // Who checked in today?
    const checkedIn = new Set(
      (
        await Attendance.distinct('student', {
          organization: organizationId,
          type: 'in',
          timestamp: { $gte: start, $lt: end },
        })
      ).map(String)
    );

    // Who is on approved leave covering today?
    const onLeave = new Set(
      (
        await LeaveRequest.find({
          student: { $in: studentIds },
          status: 'approved',
          'leaveDates.start': { $lt: end },
          'leaveDates.end': { $gte: start },
        }).distinct('student')
      ).map(String)
    );

    // Remaining = absent without approval (also excluding WFH).
    const absentees = students.filter((s) => {
      const id = String(s._id);
      if (checkedIn.has(id)) return false;
      if (onLeave.has(id)) return false;
      if (this._hasWfhForDay(s, start, end)) return false;
      return true;
    });

    // Upsert one flag per (student, day); idempotent across repeated runs.
    for (const s of absentees) {
      await AbsenceFlag.updateOne(
        { student: s._id, date: start },
        {
          $setOnInsert: {
            organization: organizationId,
            student: s._id,
            date: start,
            reason: 'no_checkin_no_leave',
            source,
            notifiedHOI: true,
          },
        },
        { upsert: true }
      );
    }

    if (absentees.length) {
      audit.log({
        organization: organizationId,
        actorType: 'system',
        action: 'attendance.unapproved_absence',
        outcome: 'flagged',
        targetType: 'attendance',
        metadata: {
          date: start.toISOString().slice(0, 10),
          count: absentees.length,
          students: absentees.map((s) => String(s._id)),
        },
      });
    }

    return {
      organization: organizationId,
      date: start,
      absentCount: absentees.length,
      absentees: absentees.map((s) => ({
        _id: String(s._id),
        student: {
          _id: s._id,
          fullName: s.fullName,
          uid: s.uid,
          department: s.department || null,
        },
        name: s.fullName,
        fullName: s.fullName,
        uid: s.uid,
        department: s.department || null,
        reason: 'no_checkin_no_leave',
        notifiedHOI: true,
        createdAt: new Date(),
      })),
    };
  }

  /** Run detection for every active organization (cron). */
  async detectAll(opts = {}) {
    const Organization = require('../models/Organization');
    const orgs = await Organization.find({ isActive: true }).select('_id');
    let totalAbsent = 0;
    for (const org of orgs) {
      try {
        const r = await this.detectForOrg(org._id, { ...opts, source: 'auto' });
        totalAbsent += r.absentCount;
      } catch (e) {
        console.error('[Absence] detect failed for org', String(org._id), e.message);
      }
    }
    console.log(`[Absence] Flagged ${totalAbsent} unapproved absentees across ${orgs.length} orgs`);
    return { organizations: orgs.length, totalAbsent };
  }

  /** List the flagged absentees for an org on a given day (Admin view). */
  async getAbsences(organizationId, opts = {}) {
    const date = opts.date ? new Date(opts.date) : new Date();
    const { start, end } = this._dayBounds(date);

    // TODAY is still live — a student flagged absent by an earlier cron run
    // may since have checked in or had leave approved. AbsenceFlag documents
    // are write-once (upserted when found absent, never removed once that
    // condition resolves), so reading them directly for the CURRENT day would
    // show a stale, only-ever-growing count that doesn't match reality (e.g.
    // "Unapproved Absences" reading higher than "Today's Absent" because
    // people who resolved their absence hours ago are still counted).
    // Re-detect live for today; for past (closed, immutable) days the
    // persisted flags are the correct historical record.
    const isToday = start.getTime() === this._dayBounds(new Date()).start.getTime();
    if (isToday) {
      const result = await this.detectForOrg(organizationId, { date: start, source: 'live_view' });
      return {
        success: true,
        date: start,
        count: result.absentCount,
        absentees: result.absentees,
      };
    }

    const flags = await AbsenceFlag.find({ organization: organizationId, date: start })
      .populate('student', 'fullName uid department class')
      .sort({ createdAt: -1 })
      .lean();
    // Flatten name/uid/department onto each absentee (keeps `student` too) so
    // both the page and the HOD department filter can read them directly.
    const absentees = flags.map((f) => ({
      ...f,
      student: f.student && typeof f.student === 'object' ? f.student : {
        _id: f.student,
        fullName: f.name || 'Unknown',
        uid: f.uid || '',
        department: f.department || null,
      },
      name: f.student?.fullName || f.name || 'Unknown',
      fullName: f.student?.fullName || f.name || 'Unknown',
      uid: f.student?.uid || f.uid || '',
      department: f.student?.department || f.department || null,
      class: f.student?.class || f.class || null,
    }));
    return { success: true, date: start, count: absentees.length, absentees };
  }
}

module.exports = new AbsenceService();
