const express = require('express');
const Router = express.Router();
const FieldRequest = require('../models/FieldRequest');
const Student = require('../models/Student');
const passport = require('../config/passport');
const auth = require('../middleware/auth');
const { deptScopeIds } = require('../utils/deptScope');
const {
  markPastPendingFieldRequestsAsNoResponse,
  startOfTodayInIST,
} = require('../utils/fieldRequestNoResponse');

// ---------------------------------------------------------------------------
// Field requests
// ---------------------------------------------------------------------------
// A staff member requests to attend an on-field event. Once approved AND the
// event day arrives, they upload information about the event (photos, a written
// report and documents) from the mobile app. Admin/HOD review everything on the
// web admin.
// ---------------------------------------------------------------------------

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

// Map a stored request to the shape the clients expect.
const serialize = (r) => ({
  _id: r._id,
  eventTitle: r.eventTitle,
  startDate: r.startDate,
  endDate: r.endDate,
  reason: r.reason,
  notes: r.notes,
  location: r.location,
  accompaniedBy: r.accompaniedBy,
  evidence: r.evidence || [],
  status: r.status,
  reson: r.reson,
  days: r.days,
  report: r.report || { photos: [], documents: [] },
  hasReport: r.hasReport,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  reviewedBy: r.reviewedBy,
  reviewedAt: r.reviewedAt,
  noResponseAt: r.noResponseAt,
  noResponseReason: r.noResponseReason,
  noResponseReviewed: !!r.noResponseReviewed,
  noResponseReviewedAt: r.noResponseReviewedAt,
  noResponseReviewedBy: r.noResponseReviewedBy,
});

// --- Student endpoints -----------------------------------------------------

// Apply for a field event
Router.post(
  '/field/apply',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      const { eventTitle, startDate, endDate, reason, notes, location, accompaniedBy, evidence } = req.body;

      if (!eventTitle || !startDate || !endDate || !reason) {
        return res.status(400).json({
          success: false,
          message: 'Event title, start date, end date, and reason are required',
        });
      }

      // Normalise evidence: accept an array of base64/data-URL strings OR
      // { image, label } objects → the report-photo sub-doc shape.
      const evidenceDocs = Array.isArray(evidence)
        ? evidence
            .map((e) => (typeof e === 'string' ? { image: e } : (e && e.image ? { label: e.label, image: e.image } : null)))
            .filter((e) => e && typeof e.image === 'string' && e.image.length > 0)
            .slice(0, 6)
        : [];

      const start = new Date(startDate);
      const end = new Date(endDate);

      if (start > end) {
        return res.status(400).json({
          success: false,
          message: 'End date cannot be before start date',
        });
      }

      const student = await Student.findById(req.user._id);
      if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }

      const fieldRequest = new FieldRequest({
        student: req.user._id,
        organization: student.organization,
        eventTitle: eventTitle.trim(),
        startDate: start,
        endDate: end,
        reason: reason.trim(),
        notes: notes?.trim(),
        location: typeof location === 'string' ? location.trim() : undefined,
        accompaniedBy: typeof accompaniedBy === 'string' ? accompaniedBy.trim() : undefined,
        evidence: evidenceDocs,
        status: 'pending',
      });

      await fieldRequest.save();

      // Confirmation notification (best-effort)
      try {
        const pushNotificationService = require('../services/pushNotificationService');
        await pushNotificationService.sendNotificationToStudent(
          req.user._id,
          {
            title: '📝 Field Request Submitted',
            body: `Your field request for "${fieldRequest.eventTitle}" (${start.toDateString()} - ${end.toDateString()}) has been submitted for approval`,
          },
          {
            type: 'field_request_submitted',
            action: 'field_request_created',
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            timestamp: new Date().toISOString(),
          }
        );
      } catch (notificationError) {
        console.error('[Field Apply] Notification failed:', notificationError);
      }

      res.status(201).json({
        success: true,
        message: 'Field request submitted successfully',
        data: { request: serialize(fieldRequest) },
      });
    } catch (error) {
      console.error('[Field Apply] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to submit field request',
        error: error.message,
      });
    }
  }
);

// Get my field requests
Router.get(
  '/field/my',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      await markPastPendingFieldRequestsAsNoResponse({ studentScope: [req.user._id] });

      const { status, limit = 50, page = 1 } = req.query;
      const query = { student: req.user._id };
      if (status) query.status = status;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const requests = await FieldRequest.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('reviewedBy', 'name email');

      const total = await FieldRequest.countDocuments(query);

      res.json({
        success: true,
        data: {
          requests: requests.map(serialize),
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit)),
          },
        },
      });
    } catch (error) {
      console.error('[Field My] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch field requests',
        error: error.message,
      });
    }
  }
);

// Cancel your own pending field request — only within 1 hour of submitting it.
Router.delete(
  '/field/:id',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      const { id } = req.params;
      const fieldRequest = await FieldRequest.findOne({ _id: id, student: req.user._id });
      if (!fieldRequest) {
        return res.status(404).json({ success: false, message: 'Field request not found' });
      }
      if (fieldRequest.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Only a pending field request can be cancelled',
        });
      }
      const ONE_HOUR_MS = 60 * 60 * 1000;
      const ageMs = Date.now() - new Date(fieldRequest.createdAt).getTime();
      if (ageMs > ONE_HOUR_MS) {
        return res.status(400).json({
          success: false,
          message: 'This field request can no longer be cancelled — the 1-hour window has passed',
        });
      }
      // Mark cancelled instead of deleting — stays visible in history.
      fieldRequest.status = 'cancelled';
      await fieldRequest.save();
      res.json({ success: true, message: 'Field request cancelled', data: { request: serialize(fieldRequest) } });
    } catch (error) {
      console.error('[Field Cancel] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cancel field request',
        error: error.message,
      });
    }
  }
);

// Submit / append the event-day report (photos, notes, documents)
Router.post(
  '/field/:id/report',
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { notes, photos, documents } = req.body;

      const fieldRequest = await FieldRequest.findOne({
        _id: id,
        student: req.user._id,
      });

      if (!fieldRequest) {
        return res.status(404).json({ success: false, message: 'Field request not found' });
      }

      if (fieldRequest.status !== 'approved') {
        return res.status(400).json({
          success: false,
          message: 'You can only upload event information for an approved request',
        });
      }

      // Only allow uploads once the event day has arrived.
      if (startOfDay(new Date()) < startOfDay(fieldRequest.startDate)) {
        return res.status(400).json({
          success: false,
          message: 'You can upload event information once the event day arrives',
        });
      }

      const newPhotos = Array.isArray(photos)
        ? photos
            .filter((p) => p && p.image)
            .map((p) => ({ label: p.label, image: p.image, uploadedAt: new Date() }))
        : [];

      const newDocs = Array.isArray(documents)
        ? documents
            .filter((d) => d && d.data)
            .map((d) => ({
              name: d.name,
              mimeType: d.mimeType,
              data: d.data,
              uploadedAt: new Date(),
            }))
        : [];

      if (!notes?.trim() && newPhotos.length === 0 && newDocs.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Add a note, photo or document before submitting',
        });
      }

      const report = fieldRequest.report || {};
      report.notes = notes?.trim() || report.notes;
      report.photos = [...(report.photos || []), ...newPhotos];
      report.documents = [...(report.documents || []), ...newDocs];
      report.submittedAt = new Date();
      fieldRequest.report = report;
      fieldRequest.markModified('report');

      await fieldRequest.save();

      res.json({
        success: true,
        message: 'Event information uploaded successfully',
        data: { request: serialize(fieldRequest) },
      });
    } catch (error) {
      console.error('[Field Report] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to upload event information',
        error: error.message,
      });
    }
  }
);

// --- Organization / admin endpoints ---------------------------------------

// Get all field requests for the organization
Router.get('/field-requests/all', auth, async (req, res) => {
  try {
    const { status, studentId, startDate, endDate, limit = 100, page = 1 } = req.query;

    const query = { organization: req.organization._id };
    if (status && status !== 'all') {
      query.status = status;
    } else {
      query.status = { $ne: 'cancelled' };
    }

    // HOD department scope restriction
    const scope = await deptScopeIds(req);
    if (scope) {
      if (studentId) {
        const scopeStr = scope.map(id => id.toString());
        if (scopeStr.includes(studentId.toString())) {
          query.student = studentId;
        } else {
          query.student = { $in: [] }; // match nothing
        }
      } else {
        query.student = { $in: scope };
      }
    } else {
      if (studentId) query.student = studentId;
    }

    const noResponseOptions = { organization: req.organization._id };
    if (query.student && query.student.$in) {
      noResponseOptions.studentScope = query.student.$in;
    } else if (query.student) {
      noResponseOptions.studentScope = [query.student];
    }
    await markPastPendingFieldRequestsAsNoResponse(noResponseOptions);

    if (startDate || endDate) {
      query.$and = [];
      if (startDate) query.$and.push({ startDate: { $gte: new Date(startDate) } });
      if (endDate) query.$and.push({ endDate: { $lte: new Date(endDate) } });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const requests = await FieldRequest.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('student', 'fullName uid email class department bureau')
      .populate('reviewedBy', 'name email');

    const total = await FieldRequest.countDocuments(query);

    res.json({
      success: true,
      data: {
        requests,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('[Field All] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch field requests',
      error: error.message,
    });
  }
});

// Mark a no-response field request as reviewed without changing approval status
Router.patch('/field-requests/:id/mark-reviewed', auth, async (req, res) => {
  try {
    const scope = await deptScopeIds(req);
    const query = {
      _id: req.params.id,
      organization: req.organization._id,
      status: 'no_response',
    };
    if (scope) query.student = { $in: scope };

    const fieldRequest = await FieldRequest.findOneAndUpdate(
      query,
      {
        $set: {
          noResponseReviewed: true,
          noResponseReviewedAt: new Date(),
          noResponseReviewedBy: req.user._id,
        },
      },
      { new: true }
    )
      .populate('student', 'fullName uid email class department bureau')
      .populate('reviewedBy', 'name email')
      .populate('noResponseReviewedBy', 'name email');

    if (!fieldRequest) {
      return res.status(404).json({
        success: false,
        message: 'No-response field request not found',
      });
    }

    res.json({
      success: true,
      message: 'No-response field request marked reviewed',
      data: { request: fieldRequest },
    });
  } catch (error) {
    console.error('[Field Mark Reviewed] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark field request reviewed',
      error: error.message,
    });
  }
});

// Approve / reject a field request
Router.put('/field-requests/update-status/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reson } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either approved or rejected',
      });
    }

    const scope = await deptScopeIds(req);
    const query = {
      _id: id,
      organization: req.organization._id,
    };
    if (scope) {
      query.student = { $in: scope };
    }

    await markPastPendingFieldRequestsAsNoResponse({
      organization: req.organization._id,
      studentScope: scope || undefined,
    });

    const fieldRequest = await FieldRequest.findOne(query).populate('student', 'fullName uid email');

    if (!fieldRequest) {
      return res.status(404).json({ success: false, message: 'Field request not found' });
    }

    if (fieldRequest.status !== 'pending') {
      // Idempotent re-confirm of an already-final status
      if (fieldRequest.status === status) {
        return res.json({
          success: true,
          message: `Field request already ${status}`,
          data: { request: fieldRequest },
        });
      }
      return res.status(400).json({
        success: false,
        message: `Request is currently ${fieldRequest.status}. Only pending requests can be updated.`,
      });
    }

    if (startOfDay(fieldRequest.startDate) < startOfDay(startOfTodayInIST())) {
      fieldRequest.status = 'no_response';
      fieldRequest.noResponseAt = new Date();
      fieldRequest.noResponseReason = 'Admin did not respond before the field duty start date';
      fieldRequest.noResponseReviewed = false;
      await fieldRequest.save();
      return res.status(400).json({
        success: false,
        message: 'This field request is past its start date and has been marked No Response.',
      });
    }

    fieldRequest.status = status;
    fieldRequest.reviewedBy = req.user._id;
    fieldRequest.reviewedAt = new Date();
    if (status === 'rejected' && reson) {
      fieldRequest.reson = reson.trim();
    }

    await fieldRequest.save();

    // Status notification (best-effort)
    try {
      const pushNotificationService = require('../services/pushNotificationService');
      if (status === 'approved') {
        await pushNotificationService.sendNotificationToStudent(
          fieldRequest.student._id,
          {
            title: '🎉 Field Request Approved!',
            body: `Your field request for "${fieldRequest.eventTitle}" has been approved. You can upload event information on the event day.`,
          },
          {
            type: 'field_request_approved',
            action: 'field_request_approved',
            startDate: fieldRequest.startDate.toISOString(),
            endDate: fieldRequest.endDate.toISOString(),
            timestamp: new Date().toISOString(),
          }
        );
      } else {
        await pushNotificationService.sendNotificationToStudent(
          fieldRequest.student._id,
          {
            title: '❌ Field Request Rejected',
            body: `Your field request for "${fieldRequest.eventTitle}" has been rejected.${reson ? ` Reason: ${reson}` : ''}`,
          },
          {
            type: 'field_request_rejected',
            action: 'field_request_rejected',
            reason: reson || 'No reason provided',
            timestamp: new Date().toISOString(),
          }
        );
      }
    } catch (notificationError) {
      console.error('[Field Update Status] Notification failed:', notificationError);
    }

    res.json({
      success: true,
      message: `Field request ${status} successfully`,
      data: { request: fieldRequest },
    });
  } catch (error) {
    console.error('[Field Update Status] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update field request status',
      error: error.message,
    });
  }
});

module.exports = Router;
