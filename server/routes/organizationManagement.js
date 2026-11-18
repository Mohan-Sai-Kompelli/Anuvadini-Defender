const express = require('express');
const router = express.Router();
const Organization = require('../models/Organization');
const Student = require('../models/Student');
const auth = require('../middleware/auth');
const authOrSuperAdmin = require('../middleware/authOrSuperAdmin');
const organizerAuth = require('../middleware/organizerAuth');

// @route   GET /api/organizations
// @desc    Get all organizations for super admin or current organization for org admin
// @access  Private
router.get('/', authOrSuperAdmin, async (req, res) => {
  try {
    let organizations;
    
    // If user is organization admin, return only their organization
    if (req.organization) {
      organizations = [req.organization];
    } else {
      // For super admin or other users, return all organizations
      organizations = await Organization.find({ isActive: true })
        .select('-password')
        .sort({ createdAt: -1 });
    }

    res.json({
      success: true,
      data: organizations
    });
  } catch (error) {
    console.error('Error fetching organizations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch organizations'
    });
  }
});

// @route   POST /api/organizations
// @desc    Create new organization (super admin only)
// @access  Private (requires X-Super-Admin-Key header)
router.post('/', authOrSuperAdmin, async (req, res) => {
  try {
    // Super-admin guard: require a secret key header to prevent any logged-in
    // org from creating additional organizations. Unless authenticated as superadmin.
    if (!req.superAdmin) {
      const superAdminKey = process.env.SUPER_ADMIN_KEY;
      if (!superAdminKey || req.headers['x-super-admin-key'] !== superAdminKey) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden. Super-admin key required to create organizations.'
        });
      }
    }
    
    const {
      name,
      email,
      password,
      phone,
      organizationType,
      organizationSize,
      address,
      location,
      departments,
      bureaus,
      classes,
      selectedBiometrics,
      settings
    } = req.body;

    // Check if organization with email already exists
    const existingOrg = await Organization.findOne({ email });
    if (existingOrg) {
      return res.status(400).json({
        success: false,
        error: 'Organization with this email already exists'
      });
    }

    // Create primary location
    const primaryLocation = {
      name: "Main Office",
      address: address || {},
      coordinates: {
        latitude: location?.latitude,
        longitude: location?.longitude
      },
      geofenceRadius: settings?.defaultGeofenceRadius || 100,
      isActive: true
    };

    const organization = new Organization({
      name,
      email,
      password,
      phone,
      organizationType,
      organizationSize,
      departments: departments || [],
      bureaus: bureaus || [],
      classes: classes || [],
      selectedBiometrics: selectedBiometrics || {},
      locations: [primaryLocation],
      address,
      location,
      settings: settings || {}
    });

    // Set primary location reference
    organization.primaryLocation = organization.locations[0]._id;

    await organization.save();

    // Remove password from response
    const orgResponse = organization.toObject();
    delete orgResponse.password;

    res.status(201).json({
      success: true,
      data: orgResponse,
      message: 'Organization created successfully'
    });
  } catch (error) {
    console.error('Error creating organization:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create organization'
    });
  }
});

// @route   PUT /api/organizations/:id
// @desc    Update current organization
// @access  Private
router.put('/:id', organizerAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Ensure organization can only update their own data
    if (id !== req.organization._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only update your own organization.'
      });
    }

    // Remove sensitive fields from updates
    delete updates.password;
    delete updates.email;

    const organization = await Organization.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');

    if (!organization) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    res.json({
      success: true,
      data: organization,
      message: 'Organization updated successfully'
    });
  } catch (error) {
    console.error('Error updating organization:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update organization'
    });
  }
});

// @route   POST /api/organizations/:id/locations
// @desc    Add new location to current organization
// @access  Private
router.post('/:id/locations', organizerAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const locationData = req.body;

    // Ensure organization can only add locations to their own organization
    if (id !== req.organization._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only add locations to your own organization.'
      });
    }

    const organization = await Organization.findById(id);
    if (!organization) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    // Validate required fields
    if (!locationData.name || !locationData.coordinates?.latitude || !locationData.coordinates?.longitude) {
      return res.status(400).json({
        success: false,
        error: 'Location name and coordinates are required'
      });
    }

    const newLocation = organization.addLocation(locationData);
    await organization.save();

    res.status(201).json({
      success: true,
      data: newLocation,
      message: 'Location added successfully'
    });
  } catch (error) {
    console.error('Error adding location:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to add location'
    });
  }
});

// @route   PUT /api/organizations/:id/locations/:locationId
// @desc    Update location
// @access  Private
router.put('/:id/locations/:locationId', organizerAuth, async (req, res) => {
  try {
    const { id, locationId } = req.params;
    const updates = req.body;

    const organization = await Organization.findById(id);
    if (!organization) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    const location = organization.locations.id(locationId);
    if (!location) {
      return res.status(404).json({
        success: false,
        error: 'Location not found'
      });
    }

    // Update location fields
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        location[key] = updates[key];
      }
    });

    await organization.save();

    res.json({
      success: true,
      data: location,
      message: 'Location updated successfully'
    });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update location'
    });
  }
});

// @route   DELETE /api/organizations/:id/locations/:locationId
// @desc    Delete location
// @access  Private
router.delete('/:id/locations/:locationId', organizerAuth, async (req, res) => {
  try {
    const { id, locationId } = req.params;

    const organization = await Organization.findById(id);
    if (!organization) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    // Check if this is the primary location
    if (organization.primaryLocation && organization.primaryLocation.equals(locationId)) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete primary location. Set another location as primary first.'
      });
    }

    // Check if any students are assigned to this location
    const studentsCount = await Student.countDocuments({ 
      organization: id, 
      currentLocation: locationId 
    });

    if (studentsCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete location. ${studentsCount} students are currently assigned to this location.`
      });
    }

    organization.locations.id(locationId).remove();
    await organization.save();

    res.json({
      success: true,
      message: 'Location deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting location:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete location'
    });
  }
});

// @route   PUT /api/organizations/:id/primary-location/:locationId
// @desc    Set primary location
// @access  Private
router.put('/:id/primary-location/:locationId', organizerAuth, async (req, res) => {
  try {
    const { id, locationId } = req.params;

    const organization = await Organization.findById(id);
    if (!organization) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    const location = organization.locations.id(locationId);
    if (!location) {
      return res.status(404).json({
        success: false,
        error: 'Location not found'
      });
    }

    organization.primaryLocation = locationId;
    await organization.save();

    res.json({
      success: true,
      message: 'Primary location updated successfully'
    });
  } catch (error) {
    console.error('Error setting primary location:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to set primary location'
    });
  }
});

// @route   GET /api/organizations/:id/locations
// @desc    Get all locations for an organization
// @access  Private
router.get('/:id/locations', organizerAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const organization = await Organization.findById(id).select('locations primaryLocation');
    if (!organization) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    const locationsWithPrimary = organization.locations.map(location => ({
      ...location.toObject(),
      isPrimary: organization.primaryLocation && organization.primaryLocation.equals(location._id)
    }));

    res.json({
      success: true,
      data: locationsWithPrimary
    });
  } catch (error) {
    console.error('Error fetching locations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch locations'
    });
  }
});

module.exports = router;