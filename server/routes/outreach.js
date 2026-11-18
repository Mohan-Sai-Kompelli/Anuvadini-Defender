const express = require('express');
const auth = require('../middleware/auth');
const OutreachActivity = require('../models/OutreachActivity');
const resolveOrgId = require('../utils/resolveOrg');
const { deptScopeIds } = require('../utils/deptScope');
const { markPastPendingOutreachNoResponse } = require('../utils/outreachNoResponse');

const router = express.Router();

// @route   GET /api/outreach
router.get('/', auth, async (req, res) => {
  try {
    const organization = resolveOrgId(req);
    if (!organization) {
      return res.status(400).json({ success: false, error: 'Organization not resolved' });
    }
    // HOD: only activities led by their department members.
    const scope = await deptScopeIds(req);
    await markPastPendingOutreachNoResponse({ organization, leadScope: scope });
    const q = { organization };
    if (scope) q.lead = { $in: scope };
    const activities = await OutreachActivity.find(q)
      .populate('lead', 'fullName department')
      .sort({ date: -1 })
      .lean();
    return res.json({ success: true, activities });
  } catch (err) {
    console.error('[Outreach] list error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// @route   POST /api/outreach
// @desc    Faculty requests a new outreach activity (pending Admin approval)
router.post('/', auth, async (req, res) => {
  try {
    const organization = resolveOrgId(req);
    const { title, type, lead, date, location, photos, gpsPoints, participants, purpose, description } = req.body;
    const leadId = lead || (req.student ? req.student._id : null);
    if (!title || !leadId || !date || !location) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    const pics = Array.isArray(photos) ? photos : [];
    const activity = await OutreachActivity.create({
      organization,
      title,
      type,
      lead: leadId,
      date,
      location,
      purpose: purpose || '',
      description: description || '',
      photos: pics,
      photoCount: pics.length,
      gpsPoints: gpsPoints != null ? gpsPoints : 0,
      participants: participants != null ? participants : 0,
    });
    const populated = await OutreachActivity.findById(activity._id)
      .populate('lead', 'fullName department')
      .lean();
    return res.status(201).json({ success: true, activity: populated });
  } catch (err) {
    console.error('[Outreach] create error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// @route   PUT /api/outreach/:id/status
// @desc    Admin approves / rejects; app marks completion with evidence totals
router.put('/:id/status', auth, async (req, res) => {
  try {
    const organization = resolveOrgId(req);
    const { status, rejectionReason, gpsPoints, photoCount, participants, photos } = req.body;
    if (!['pending', 'in_progress', 'completed', 'rejected', 'no_response', 'no_response_reviewed'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }
    const set = { status };
    const unset = {};
    if (rejectionReason != null) set.rejectionReason = rejectionReason;
    if (status === 'pending') {
      unset.noResponseAt = '';
      unset.noResponseReason = '';
      unset.reviewedAt = '';
      unset.reviewedBy = '';
    }
    if (status === 'no_response') {
      set.noResponseAt = new Date();
      set.noResponseReason = 'HOD did not respond before scheduled activity date';
    }
    if (status === 'no_response_reviewed') {
      set.reviewedAt = new Date();
      set.reviewedBy = req.organization?._id || req.student?._id || req.user?.id;
    }
    if (gpsPoints != null) set.gpsPoints = gpsPoints;
    if (participants != null) set.participants = participants;
    if (Array.isArray(photos)) {
      set.photos = photos;
      set.photoCount = photos.length;
    } else if (photoCount != null) {
      set.photoCount = photoCount;
    }
    const update = { $set: set };
    if (Object.keys(unset).length) update.$unset = unset;
    const scope = await deptScopeIds(req);
    const query = { _id: req.params.id, organization };
    if (scope) {
      query.lead = { $in: scope };
    }

    const activity = await OutreachActivity.findOneAndUpdate(
      query,
      update,
      { new: true }
    )
      .populate('lead', 'fullName department')
      .lean();
    if (!activity) {
      return res.status(404).json({ success: false, error: 'Activity not found' });
    }
    return res.json({ success: true, activity });
  } catch (err) {
    console.error('[Outreach] status error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
