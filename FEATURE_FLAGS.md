# Feature Flags Configuration Guide

## Overview

Feature flags control which functionalities are enabled/disabled across the system. This allows:
- A/B testing of new features
- Gradual rollout to user groups
- Emergency feature disable without redeploying
- Experiment with new biometric methods
- Multi-organization customization

---

## Location

**Backend**: `server/config/featureFlags.js`

---

## Feature Flags Reference

### Biometric Authentication

#### `enableLivenessChallenge`
- **Type**: Boolean
- **Default**: false
- **Description**: Enables 2-3 action liveness verification before face recognition
- **Actions**: blink, turn_left, turn_right, nod, smile
- **Confidence Threshold**: 0.7
- **Challenge Expiry**: 90 seconds
- **Impact**: Attendance marking requires liveness token
- **Rollout Recommendation**: Enable for 10% → 25% → 50% → 100%

**Dependencies**:
- Face detection enabled
- MediaPipe face landmarks

**Related Endpoints**:
```
POST /api/liveness/challenge
POST /api/liveness/verify
```

#### `enableFaceRecognition`
- **Type**: Boolean
- **Default**: true
- **Description**: Enable face-based attendance marking
- **Impact**: Core attendance feature
- **Note**: Cannot be disabled without affecting primary flow

---

### Attendance & Scheduling

#### `enableShiftSchedules`
- **Type**: Boolean
- **Default**: false
- **Description**: Enable shift-based scheduling
- **Features**:
  - Shift creation and management
  - Shift-specific grace periods
  - Late arrival/early departure tracking
  - Shift-based attendance validation

**Related Models**:
- ShiftSchedule
- Attendance.shiftId
- Attendance.durationMinutes

**Related Endpoints**:
```
GET /api/shifts/applicable
POST /api/shifts
PUT /api/shifts/:id
DELETE /api/shifts/:id
```

#### `enableDutyMode`
- **Type**: Boolean
- **Default**: false
- **Description**: Enable temporary duty locations (health camps, field visits)
- **Features**:
  - Create temporary geofenced locations
  - Time-based activation
  - Student/department restrictions
  - Check-in/check-out at duty sites

**Related Models**:
- DutyLocation
- Attendance.dutyLocationId
- Attendance.attendanceMode

**Related Endpoints**:
```
GET /api/duty-locations/active
POST /api/duty-locations/:id/check-in
POST /api/duty-locations/:id/check-out
```

---

### Leave & Absence Management

#### `enableApprovalChain`
- **Type**: Boolean
- **Default**: false
- **Description**: Enable multi-step leave approval workflow
- **Features**:
  - Faculty → HOD approval (configurable)
  - Multi-step approval chains
  - SLA tracking per step
  - Approval history with comments
  - Rejection with resubmission

**Related Models**:
- ApprovalChain
- LeaveRequest.approvalChainId
- LeaveRequest.approvalHistory

**Related Endpoints**:
```
GET /api/approval-chains
POST /api/approval-chains/:chainId/approve-leave/:leaveId
POST /api/approval-chains/:chainId/reject-leave/:leaveId
```

#### `enableLeaveBalance`
- **Type**: Boolean
- **Default**: true
- **Description**: Track leave balance and accrual
- **Features**:
  - Monthly accrual
  - Balance calculation
  - Leave type categorization
  - Transaction history

---

### Document & Proof Collection

#### `enableConsultationLogs`
- **Type**: Boolean
- **Default**: false
- **Description**: Enable geo-tagged consultation logging
- **Features**:
  - Geo-tagged photo capture
  - Consultation type categorization
  - Patient count tracking
  - Admin verification workflow
  - Geofence validation (3x org radius)

**Related Models**:
- ConsultationLog
- Attendance.attendanceMode = 'consultation'

**Related Endpoints**:
```
POST /api/consultation-logs
GET /api/consultation-logs/my
PUT /api/consultation-logs/:id/verify
```

---

### Reporting & Analytics

#### `enableReports`
- **Type**: Boolean
- **Default**: true
- **Description**: Enable attendance reports and PDF export
- **Features**:
  - Attendance report PDF
  - Department summary
  - Monthly summary
  - Compliance report
  - KPI dashboard

**Related Endpoints**:
```
GET /api/reports/attendance
GET /api/reports/department-summary
GET /api/reports/monthly-summary
GET /api/reports/dashboard-kpis
GET /api/reports/compliance
```

#### `enableHOIDashboard`
- **Type**: Boolean
- **Default**: false
- **Description**: Enable executive dashboard for Head of Institute
- **Features**:
  - Real-time KPIs
  - Department breakdown
  - Compliance alerts
  - One-click report downloads

**Access Control**: Role-based (hoi, admin, org_admin)

---

### Advanced Features

#### `enableHierarchyAuth`
- **Type**: Boolean
- **Default**: false
- **Description**: Enable role-based access hierarchy
- **Roles**:
  - HOI (Head of Institute)
  - Department Head (HOD)
  - Faculty
  - Student

**Related Endpoints**:
```
GET /api/teams
POST /api/teams/:id/members
```

#### `enableTaskEngine`
- **Type**: Boolean
- **Default**: false
- **Description**: Enable task management system
- **Features**:
  - Task creation and assignment
  - Deadline tracking
  - Progress monitoring
  - Task notifications

**Related Endpoints**:
```
GET /api/tasks
POST /api/tasks
PUT /api/tasks/:id
```

#### `enableProductivitySync`
- **Type**: Boolean
- **Default**: false
- **Description**: Sync attendance with external productivity platform
- **Integration**: Microsoft Teams, Slack, Google Workspace
- **Sync Frequency**: Real-time

---

## Configuration Examples

### Development Environment

```javascript
// server/config/featureFlags.js
module.exports = {
  // Biometric
  enableLivenessChallenge: false,        // Testing locally
  enableFaceRecognition: true,
  
  // Scheduling
  enableShiftSchedules: true,             // Testing shifts
  enableDutyMode: true,                   // Testing duty mode
  
  // Leave Management
  enableApprovalChain: true,              // Testing approval flow
  enableLeaveBalance: true,
  
  // Documents
  enableConsultationLogs: true,           // Testing consultation logs
  
  // Reporting
  enableReports: true,
  enableHOIDashboard: true,
  
  // Advanced
  enableHierarchyAuth: false,
  enableTaskEngine: false,
  enableProductivitySync: false
};
```

### Staging Environment

```javascript
// Wider testing before production
module.exports = {
  // Biometric - gradually rolling out
  enableLivenessChallenge: true,
  enableFaceRecognition: true,
  
  // Scheduling - full testing
  enableShiftSchedules: true,
  enableDutyMode: true,
  
  // Leave Management
  enableApprovalChain: true,
  enableLeaveBalance: true,
  
  // Documents
  enableConsultationLogs: true,
  
  // Reporting
  enableReports: true,
  enableHOIDashboard: true,
  
  // Advanced
  enableHierarchyAuth: true,              // Testing new role system
  enableTaskEngine: false,                // Not ready yet
  enableProductivitySync: false
};
```

### Production Environment

```javascript
// Stable, well-tested features
module.exports = {
  // Biometric - fully rolled out
  enableLivenessChallenge: true,
  enableFaceRecognition: true,
  
  // Scheduling - stable
  enableShiftSchedules: true,
  enableDutyMode: true,
  
  // Leave Management
  enableApprovalChain: true,
  enableLeaveBalance: true,
  
  // Documents
  enableConsultationLogs: true,
  
  // Reporting
  enableReports: true,
  enableHOIDashboard: true,
  
  // Advanced - carefully enabled
  enableHierarchyAuth: true,              // Rolled out to all users
  enableTaskEngine: false,                // Beta - disabled by default
  enableProductivitySync: false           // In development
};
```

### Conservative Rollout (Phase 1)

```javascript
// Maximum compatibility, minimal risk
module.exports = {
  // Only core features
  enableLivenessChallenge: false,         // Wait for more testing
  enableFaceRecognition: true,            // Core feature
  
  // Scheduling - basic only
  enableShiftSchedules: true,
  enableDutyMode: false,                  // Defer to Phase 2
  
  // Leave Management
  enableApprovalChain: false,             // Simple single-step for now
  enableLeaveBalance: true,
  
  // Documents
  enableConsultationLogs: false,          // Phase 2
  
  // Reporting
  enableReports: true,                    // Basic reports only
  enableHOIDashboard: false,              // Phase 2
  
  // Advanced
  enableHierarchyAuth: false,
  enableTaskEngine: false,
  enableProductivitySync: false
};
```

---

## Rollout Strategy

### Phase 1: Foundation (Week 1-2)
- Attendance + Shifts (basic)
- Leave Balance
- Core Reports

**Flag Config**:
```javascript
enableShiftSchedules: true
enableLivenessChallenge: false
enableApprovalChain: false
enableConsultationLogs: false
```

### Phase 2: Enhanced (Week 3-4)
- Add Liveness (10% users first)
- Add Consultation Logs (testing)
- Add Duty Mode

**Flag Config**:
```javascript
enableLivenessChallenge: true          // Rolled to 10%
enableConsultationLogs: true           // Testing
enableDutyMode: true
```

### Phase 3: Advanced (Week 5-6)
- Scale Liveness to 100%
- Add Approval Chain
- Enable HOI Dashboard

**Flag Config**:
```javascript
enableLivenessChallenge: true          // 100% rollout
enableApprovalChain: true
enableHOIDashboard: true
```

### Phase 4: Full Features (Week 7+)
- Enable all features
- Monitor stability
- Plan next features

**Flag Config**:
```javascript
// All flags enabled
enableHierarchyAuth: true
```

---

## Monitoring Feature Flags

### Check Enabled Features

```bash
# Via API (development)
curl http://localhost:5001/api/admin/features

# Or check config file
cat server/config/featureFlags.js
```

### Logging

```javascript
// Logs which flags are enabled on startup
console.log('Enabled Features:', {
  liveness: featureFlags.enableLivenessChallenge,
  shifts: featureFlags.enableShiftSchedules,
  duty: featureFlags.enableDutyMode,
  consultation: featureFlags.enableConsultationLogs,
  approval: featureFlags.enableApprovalChain
});
```

---

## Emergency Disable

If a feature causes issues in production:

**Option 1: Quick Disable**
```javascript
// server/config/featureFlags.js
enableLivenessChallenge: false  // Disable and deploy
```

**Option 2: Database Override (if implemented)**
```javascript
// Set feature flag via database
db.systemSettings.updateOne(
  { key: 'enableLivenessChallenge' },
  { value: false }
);
```

---

## Per-Organization Flags

For multi-tenant deployments:

```javascript
// Database collection: organization_feature_flags
{
  organization: ObjectId,
  enableLivenessChallenge: true,
  enableConsultationLogs: false,
  enableDutyMode: true,
  createdAt: Date,
  updatedAt: Date
}

// Usage in routes
const org = await Organization.findById(orgId);
const flags = await FeatureFlags.findOne({ organization: orgId });
const livenessEnabled = flags?.enableLivenessChallenge ?? globalFlags.enableLivenessChallenge;
```

---

## Testing Features

### Testing with Flags Disabled

```javascript
// Mock feature disabled
jest.mock('../config/featureFlags', () => ({
  enableLivenessChallenge: false
}));

test('Should skip liveness when disabled', async () => {
  const result = await markAttendance(data);
  expect(result.livenessToken).toBeUndefined();
});
```

### Testing with Flags Enabled

```javascript
jest.mock('../config/featureFlags', () => ({
  enableLivenessChallenge: true
}));

test('Should require liveness when enabled', async () => {
  const result = await markAttendance(data);
  expect(result.requiresLiveness).toBe(true);
});
```

---

## Best Practices

1. **Always wrap feature in flag check**:
   ```javascript
   if (featureFlags.enableLivenessChallenge) {
     // Feature code
   }
   ```

2. **Default to false for new features**:
   - Safer rollout
   - Easier to test
   - Prevents accidents

3. **Document flag dependencies**:
   - liveness depends on face recognition
   - approval chain depends on leave requests

4. **Update in all environments**:
   - Dev (for testing)
   - Staging (for validation)
   - Production (for rollout)

5. **Monitor after enabling**:
   - Error rates
   - Performance metrics
   - User feedback

---

**Last Updated**: June 5, 2026
**Maintained by**: Product Team
