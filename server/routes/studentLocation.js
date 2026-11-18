const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Organization = require('../models/Organization');
const LiveLocation = require('../models/LiveLocation');
const LocationTrail = require('../models/LocationTrail');
const passport = require('passport');
const organizerAuth = require('../middleware/organizerAuth');

const studentJwt = passport.authenticate('jwt', { session: false });

// @route   GET /api/student/locations
// @desc    Get available locations for student's organization
// @access  Private (Student)
router.get('/locations', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const student = await Student.findById(req.user._id).populate('organization');
    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }

    const locations = student.organization.locations.filter(loc => loc.isActive);
    const currentLocationId = student.currentLocation;
    const primaryLocationId = student.organization.primaryLocation;

    const locationsWithStatus = locations.map(location => ({
      _id: location._id,
      name: location.name,
      address: location.address,
      coordinates: location.coordinates,
      geofenceRadius: location.geofenceRadius,
      workingHours: location.workingHours,
      description: location.description,
      isCurrent: currentLocationId && currentLocationId.equals(location._id),
      isPrimary: primaryLocationId && primaryLocationId.equals(location._id),
      isActive: location.isActive
    }));

    res.json({
      success: true,
      data: locationsWithStatus
    });
  } catch (error) {
    console.error('Error fetching student locations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch locations'
    });
  }
});

// @route   GET /api/student/current-location
// @desc    Get student's current location details
// @access  Private (Student)
router.get('/current-location', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const student = await Student.findById(req.user._id);
    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }

    const currentLocation = await student.getCurrentLocation();
    
    res.json({
      success: true,
      data: {
        location: currentLocation,
        geofenceRadius: currentLocation ? currentLocation.geofenceRadius : 100
      }
    });
  } catch (error) {
    console.error('Error fetching current location:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch current location'
    });
  }
});

// @route   POST /api/student/request-location-change
// @desc    Request location change
// @access  Private (Student)
router.post('/request-location-change', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const { locationId, reason } = req.body;

    if (!locationId || !reason) {
      return res.status(400).json({
        success: false,
        error: 'Location ID and reason are required'
      });
    }

    const student = await Student.findById(req.user._id).populate('organization');
    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }

    // Check if location exists in organization
    const location = student.organization.locations.id(locationId);
    if (!location || !location.isActive) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or inactive location'
      });
    }

    // Check if student already has a pending request for this location
    const existingRequest = student.locationChangeRequests.find(req => 
      req.requestedLocation.equals(locationId) && req.status === 'pending'
    );

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        error: 'You already have a pending request for this location'
      });
    }

    // Check organization settings
    if (!student.organization.settings?.allowLocationChange) {
      return res.status(403).json({
        success: false,
        error: 'Location changes are not allowed by your organization'
      });
    }

    // If approval is not required, change location immediately
    if (!student.organization.settings?.requireLocationApproval) {
      student.currentLocation = locationId;
      await student.save();

      return res.json({
        success: true,
        message: 'Location changed successfully',
        data: {
          newLocation: location,
          requiresApproval: false
        }
      });
    }

    // Create location change request
    const changeRequest = student.requestLocationChange(locationId, reason);
    await student.save();

    res.json({
      success: true,
      message: 'Location change request submitted successfully',
      data: {
        request: changeRequest,
        requiresApproval: true
      }
    });
  } catch (error) {
    console.error('Error requesting location change:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to request location change'
    });
  }
});

// @route   GET /api/student/location-requests
// @desc    Get student's location change requests
// @access  Private (Student)
router.get('/location-requests', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const student = await Student.findById(req.user._id).populate('organization');
    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }

    const requestsWithLocationDetails = student.locationChangeRequests.map(request => {
      const location = student.organization.locations.id(request.requestedLocation);
      return {
        ...request.toObject(),
        locationDetails: location ? {
          name: location.name,
          address: location.address
        } : null
      };
    });

    res.json({
      success: true,
      data: requestsWithLocationDetails
    });
  } catch (error) {
    console.error('Error fetching location requests:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch location requests'
    });
  }
});

// @route   GET /api/organizations/:orgId/location-requests
// @desc    Get all location change requests for organization (Admin)
// @access  Private (Organizer)
router.get('/organizations/:orgId/location-requests', organizerAuth, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { status = 'pending' } = req.query;

    const stuFilter = {
      organization: orgId,
      'locationChangeRequests.status': status,
    };
    // HOD: restrict to their department members.
    if (req.isHod && req.hodDepartment) stuFilter.department = req.hodDepartment;

    const students = await Student.find(stuFilter).populate('organization').select('fullName uid locationChangeRequests');

    const allRequests = [];
    students.forEach(student => {
      const filteredRequests = student.locationChangeRequests
        .filter(req => req.status === status)
        .map(request => {
          const location = student.organization.locations.id(request.requestedLocation);
          return {
            ...request.toObject(),
            studentId: student._id,
            studentName: student.fullName,
            studentUid: student.uid,
            locationDetails: location ? {
              name: location.name,
              address: location.address
            } : null
          };
        });
      allRequests.push(...filteredRequests);
    });

    // Sort by request date (newest first)
    allRequests.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));

    res.json({
      success: true,
      data: allRequests
    });
  } catch (error) {
    console.error('Error fetching organization location requests:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch location requests'
    });
  }
});

// @route   PUT /api/organizations/:orgId/location-requests/:studentId/:requestId
// @desc    Approve or reject location change request
// @access  Private (Organizer)
router.put('/organizations/:orgId/location-requests/:studentId/:requestId', organizerAuth, async (req, res) => {
  try {
    const { orgId, studentId, requestId } = req.params;
    const { status, rejectionReason } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Status must be either approved or rejected'
      });
    }

    const student = await Student.findOne({ 
      _id: studentId, 
      organization: orgId 
    }).populate('organization');

    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }

    const request = student.locationChangeRequests.id(requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Location change request not found'
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Request has already been processed'
      });
    }

    // Update request status
    request.status = status;
    request.approvedBy = req.user._id;
    request.approvedAt = new Date();

    if (status === 'approved') {
      // Change student's current location
      student.currentLocation = request.requestedLocation;
    } else if (status === 'rejected') {
      request.rejectionReason = rejectionReason;
    }

    await student.save();

    const location = student.organization.locations.id(request.requestedLocation);

    res.json({
      success: true,
      message: `Location change request ${status} successfully`,
      data: {
        request: request,
        locationDetails: location ? {
          name: location.name,
          address: location.address
        } : null
      }
    });
  } catch (error) {
    console.error('Error processing location request:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process location request'
    });
  }
});

// @route   PUT /api/organizations/:orgId/students/:studentId/location
// @desc    Directly assign location to student (Admin)
// @access  Private (Organizer)
router.put('/organizations/:orgId/students/:studentId/location', organizerAuth, async (req, res) => {
  try {
    const { orgId, studentId } = req.params;
    const { locationId } = req.body;

    const student = await Student.findOne({ 
      _id: studentId, 
      organization: orgId 
    }).populate('organization');

    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }

    // Validate location
    const location = student.organization.locations.id(locationId);
    if (!location || !location.isActive) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or inactive location'
      });
    }

    student.currentLocation = locationId;
    await student.save();

    res.json({
      success: true,
      message: 'Student location updated successfully',
      data: {
        studentId: student._id,
        studentName: student.fullName,
        newLocation: location
      }
    });
  } catch (error) {
    console.error('Error updating student location:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update student location'
    });
  }
});

/* ════════════════════ Live location tracking (check-in → check-out) ════════════════════
 * The mobile foreground service + headless task post a GPS fix here every ~5 min
 * (it keeps running even when the app is killed). We upsert the latest position
 * and append a breadcrumb so a day's movement can be replayed on the portal map. */

// @route POST /api/student/live-location
// @desc  Ingest one background GPS fix (called every ~5 min while checked in).
router.post('/live-location', studentJwt, async (req, res) => {
  try {
    const { latitude, longitude, accuracy, heading, speed, timestamp } = req.body || {};
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({ success: false, error: 'latitude and longitude required' });
    }
    const at = timestamp ? new Date(timestamp) : new Date();
    const orgId = req.user.organization;

    await LiveLocation.updateOne(
      { student: req.user._id },
      {
        $set: {
          organization: orgId,
          latitude, longitude,
          accuracy: accuracy ?? null,
          heading: heading ?? null,
          speed: speed ?? null,
          lastFixAt: at,
          active: true,
        },
        $setOnInsert: { startedAt: at },
        $inc: { fixCount: 1 },
      },
      { upsert: true }
    );

    await LocationTrail.create({
      student: req.user._id,
      organization: orgId,
      latitude, longitude,
      accuracy: accuracy ?? null,
      heading: heading ?? null,
      speed: speed ?? null,
      at,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('[student/live-location] ingest error:', err.message);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// @route POST /api/student/live-location/share
// @desc  Begin a tracking window (check-in, or an ad-hoc off-campus share).
router.post('/live-location/share', studentJwt, async (req, res) => {
  try {
    const { durationMinutes, destination, reason, notes } = req.body || {};
    const now = new Date();
    const trackUntil = durationMinutes ? new Date(now.getTime() + Number(durationMinutes) * 60000) : null;
    await LiveLocation.updateOne(
      { student: req.user._id },
      {
        $set: {
          organization: req.user.organization,
          active: true,
          startedAt: now,
          trackUntil,
          destination: destination || null,
          reason: reason || null,
          notes: notes || null,
        },
      },
      { upsert: true }
    );
    return res.json({ success: true, startedAt: now, trackUntil });
  } catch (err) {
    console.error('[student/live-location/share] error:', err.message);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// @route POST /api/student/live-location/stop
// @desc  End the tracking window (check-out).
router.post('/live-location/stop', studentJwt, async (req, res) => {
  try {
    await LiveLocation.updateOne(
      { student: req.user._id },
      { $set: { active: false, trackUntil: new Date() } }
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('[student/live-location/stop] error:', err.message);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// @route GET /api/student/live-location/status
// @desc  Whether this student is currently being tracked + the last fix.
router.get('/live-location/status', studentJwt, async (req, res) => {
  try {
    const ll = await LiveLocation.findOne({ student: req.user._id }).lean();
    return res.json({
      success: true,
      active: !!ll?.active,
      lastFixAt: ll?.lastFixAt || null,
      fixCount: ll?.fixCount || 0,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;