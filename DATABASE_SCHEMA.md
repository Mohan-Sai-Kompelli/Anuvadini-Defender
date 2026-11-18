# Database Schema Documentation

## MongoDB Collections & Models

### 1. Attendance Collection

**Purpose**: Track employee check-in and check-out records with biometric data

```javascript
{
  _id: ObjectId,
  student: ObjectId (ref: Student),
  organization: ObjectId (ref: Organization),
  type: String (enum: ['in', 'out']),
  timestamp: Date,
  latitude: Number,
  longitude: Number,
  distance: Number,
  faceVerified: Boolean,
  faceImage: String (binary or URL),
  authMethod: String (enum: ['face', 'voice', 'iris', 'thumb', 'manual']),
  status: String (enum: ['success', 'pending', 'failed']),
  isWFH: Boolean,
  wfhAssignmentId: ObjectId (ref: WFHAssignment),
  durationMinutes: Number (null for check-in),
  shiftId: ObjectId (ref: ShiftSchedule),
  earlyLeaveBy: Number (minutes before shift end),
  lateBy: Number (minutes after shift start),
  attendanceMode: String (enum: ['regular', 'duty', 'wfh']),
  dutyLocationId: ObjectId (ref: DutyLocation),
  locationId: ObjectId (ref: Organization.locations),
  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.attendances.createIndex({ "student": 1, "createdAt": -1 })
db.attendances.createIndex({ "organization": 1, "timestamp": -1 })
db.attendances.createIndex({ "type": 1, "timestamp": -1 })
db.attendances.createIndex({ "isWFH": 1, "createdAt": -1 })
```

**Typical Queries**:
- Get today's attendance: `{ timestamp: { $gte: startOfDay, $lt: endOfDay } }`
- Get student's monthly attendance: `{ student: id, timestamp: { $gte: month_start, $lt: month_end } }`
- Check if checked in today: `{ student: id, type: 'in', timestamp: { $gte: today } }`

---

### 2. Student Collection

**Purpose**: Employee/Student profile with organization and biometric preferences

```javascript
{
  _id: ObjectId,
  uid: String (unique per organization),
  fullName: String,
  email: String (unique),
  phone: String,
  department: String,
  designation: String,
  organization: ObjectId (ref: Organization),
  
  // Authentication
  password: String (hashed with bcrypt),
  fcmToken: String (Firebase Cloud Messaging),
  
  // Biometric data
  faceData: String (base64 encoded template),
  voiceData: String (audio template),
  irisData: String (iris template),
  palmData: String (palm print template),
  
  // Preferences
  selectedBiometrics: {
    face: Boolean,
    voice: Boolean,
    iris: Boolean,
    palm: Boolean
  },
  
  // Status
  isActive: Boolean,
  lastLogin: Date,
  
  // WFH & Leave
  hasActiveWFH: Boolean,
  currentWFHAssignment: {
    _id: ObjectId,
    startDate: Date,
    endDate: Date,
    reason: String,
    daysRemaining: Number
  },
  Area_radius: Number (geofence radius in meters),
  
  // Employment
  joiningDate: Date,
  leaveBalance: Number,
  
  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.students.createIndex({ "organization": 1, "department": 1 })
db.students.createIndex({ "email": 1 })
db.students.createIndex({ "uid": 1, "organization": 1 })
```

---

### 3. Organization Collection

**Purpose**: Institution/Hospital profile with multiple locations

```javascript
{
  _id: ObjectId,
  name: String,
  description: String,
  organizationType: String (enum: ['medical_college', 'hospital', 'clinic', 'health_camp']),
  
  // Legacy (deprecated but kept for backward compatibility)
  location: {
    latitude: Number,
    longitude: Number,
    address: String
  },
  
  // New: Multi-location support
  locations: [
    {
      _id: ObjectId,
      name: String,
      latitude: Number,
      longitude: Number,
      address: String,
      geofenceRadius: Number (meters),
      locationType: String (enum: ['campus', 'hospital', 'clinic', 'opd']),
      isActive: Boolean
    }
  ],
  
  // Contact & Details
  email: String,
  phone: String,
  website: String,
  registrationNumber: String,
  
  // Settings
  timezone: String,
  currency: String,
  language: String,
  
  // Departments
  departments: [String],
  
  // Configuration
  workingDays: [Number] (0-6, 0=Sunday),
  workingHours: {
    startTime: String (HH:mm),
    endTime: String (HH:mm)
  },
  
  // Feature toggles (per organization)
  enabledFeatures: {
    liveness: Boolean,
    consultation: Boolean,
    dutyMode: Boolean,
    approvalChains: Boolean
  },
  
  // Status
  isActive: Boolean,
  createdBy: ObjectId (ref: OrgUser),
  
  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.organizations.createIndex({ "name": 1 })
db.organizations.createIndex({ "organizationType": 1 })
db.organizations.createIndex({ "isActive": 1 })
```

---

### 4. ShiftSchedule Collection

**Purpose**: Define work shift patterns and durations

```javascript
{
  _id: ObjectId,
  organization: ObjectId (ref: Organization),
  name: String,
  description: String,
  
  // Timing
  startTime: String (HH:mm),
  endTime: String (HH:mm),
  
  // Type of shift
  shiftType: String (enum: ['regular', 'duty', 'opd', 'ipd', 'lecture', 'lab']),
  
  // Applicability
  applicableDays: [Number] (0-6, days of week),
  applicableLocations: [ObjectId] (ref: Organization.locations),
  applicableDepartments: [String] (empty = all),
  
  // Configuration
  gracePeriodMinutes: Number,
  isFlexible: Boolean,
  flexMinHours: Number (minimum hours required if flexible),
  
  // Status
  isActive: Boolean,
  createdBy: ObjectId (ref: OrgUser),
  
  createdAt: Date,
  updatedAt: Date
}

// Computed field (virtual)
durationHours = (endTime - startTime) / 60

// Indexes
db.shiftschedules.createIndex({ "organization": 1, "isActive": 1 })
db.shiftschedules.createIndex({ "applicableDays": 1, "organization": 1 })
```

---

### 5. ConsultationLog Collection

**Purpose**: Track geo-tagged consultation records (medical consultations)

```javascript
{
  _id: ObjectId,
  student: ObjectId (ref: Student),
  organization: ObjectId (ref: Organization),
  attendanceId: ObjectId (ref: Attendance, optional),
  
  // Consultation details
  consultationType: String (enum: ['opd', 'ipd', 'emergency', 'procedure', 'health_camp']),
  patientCount: Number (1-100),
  notes: String (max 500 chars),
  
  // Geo-tagging
  latitude: Number,
  longitude: Number,
  locationAccuracy: Number (meters),
  geoTaggedImagePath: String (S3 URL),
  imageUploadedAt: Date,
  consultationLocation: String (e.g., "Ward A, Clinic 3"),
  
  // Verification
  status: String (enum: ['pending', 'verified', 'rejected']),
  isVerified: Boolean,
  verifiedBy: ObjectId (ref: OrgUser),
  verifiedAt: Date,
  verificationNotes: String,
  rejectionReason: String,
  
  // Follow-up
  followUpRequired: Boolean,
  followUpDate: Date,
  duration: Number (minutes, optional),
  
  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.consultationlogs.createIndex({ "student": 1, "createdAt": -1 })
db.consultationlogs.createIndex({ "organization": 1, "status": 1 })
db.consultationlogs.createIndex({ "consultationType": 1, "createdAt": -1 })
db.consultationlogs.createIndex({ "latitude": "2dsphere", "longitude": "2dsphere" })
```

---

### 6. DutyLocation Collection

**Purpose**: Temporary duty locations for health camps, field visits

```javascript
{
  _id: ObjectId,
  organization: ObjectId (ref: Organization),
  name: String,
  description: String,
  
  // Location & Geofence
  latitude: Number,
  longitude: Number,
  geofenceRadius: Number (meters, 50-5000),
  
  // Time-based activation
  startDateTime: Date,
  endDateTime: Date,
  
  // Duty type
  dutyType: String (enum: ['health_camp', 'outreach', 'field_visit', 'community_health']),
  
  // Permissions
  allowedStudents: [ObjectId] (empty = all),
  allowedDepartments: [String] (empty = all),
  
  // Requirements
  requiresFaceVerification: Boolean,
  requiresLiveness: Boolean,
  
  // Supervisor info
  activatedBy: ObjectId (ref: OrgUser),
  activatedAt: Date,
  supervisorName: String,
  supervisorPhone: String,
  
  // Attendance tracking
  checkedInStudents: [
    {
      student: ObjectId (ref: Student),
      checkedInAt: Date,
      checkedOutAt: Date,
      attendanceId: ObjectId (ref: Attendance)
    }
  ],
  
  // Status
  isActive: Boolean,
  notes: String,
  
  createdAt: Date,
  updatedAt: Date
}

// Computed field (virtual)
isCurrentlyActive = (now >= startDateTime && now <= endDateTime && isActive)

// Indexes
db.dutylocations.createIndex({ "organization": 1, "isActive": 1, "startDateTime": 1 })
db.dutylocations.createIndex({ "latitude": "2dsphere", "longitude": "2dsphere" })
```

---

### 7. ApprovalChain Collection

**Purpose**: Multi-step leave approval configuration

```javascript
{
  _id: ObjectId,
  organization: ObjectId (ref: Organization),
  name: String,
  description: String,
  
  // Approval steps
  steps: [
    {
      stepOrder: Number (0, 1, 2...),
      approverType: String (enum: ['hod', 'admin', 'specific_user', 'department_head']),
      approverUserId: ObjectId (ref: OrgUser, if specific_user),
      approverDepartment: String (if hod type),
      slaHours: Number (24 default)
    }
  ],
  
  // Scope
  applicableDepartments: [String] (empty = all),
  applicableLeaveTypes: [String] (empty = all),
  
  // Configuration
  isDefault: Boolean (only one per org),
  isActive: Boolean,
  
  createdBy: ObjectId (ref: OrgUser),
  notes: String,
  
  createdAt: Date,
  updatedAt: Date
}

// Computed field (virtual)
totalSLAHours = sum of all steps' slaHours

// Indexes
db.approvalchains.createIndex({ "organization": 1, "isActive": 1 })
db.approvalchains.createIndex({ "organization": 1, "isDefault": 1 })
```

---

### 8. LeaveRequest Collection

**Purpose**: Track leave applications with approval workflow

```javascript
{
  _id: ObjectId,
  student: ObjectId (ref: Student),
  organization: ObjectId (ref: Organization),
  
  // Basic info
  leaveType: String (enum: ['casual', 'sick', 'earned', 'maternity', 'paternity', 'study']),
  leaveDetails: String,
  reason: String,
  notes: String,
  
  // Date range
  leaveDates: {
    start: Date,
    end: Date
  },
  
  // Approval workflow
  approvalChainId: ObjectId (ref: ApprovalChain),
  currentStep: Number (0-based index),
  approvalHistory: [
    {
      step: Number,
      action: String (enum: ['approved', 'rejected']),
      by: ObjectId (ref: OrgUser),
      byModel: String (enum: ['OrgUser', 'Student']),
      at: Date,
      comment: String
    }
  ],
  
  // Status
  status: String (enum: ['pending', 'approved', 'rejected']),
  submittedAt: Date,
  
  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.leaverequests.createIndex({ "student": 1, "createdAt": -1 })
db.leaverequests.createIndex({ "status": 1, "currentStep": 1 })
db.leaverequests.createIndex({ "organization": 1, "approvalChainId": 1 })
```

---

### 9. LeaveBalance Collection

**Purpose**: Track employee leave balance and accrual

```javascript
{
  _id: ObjectId,
  student: ObjectId (ref: Student),
  organization: ObjectId (ref: Organization),
  
  // Balances by type
  balances: {
    casual: Number,
    sick: Number,
    earned: Number,
    maternity: Number,
    paternity: Number,
    study: Number
  },
  
  // Transactions
  transactions: [
    {
      type: String (enum: ['earned', 'used', 'adjusted']),
      leaveType: String,
      amount: Number,
      month: String (YYYY-MM),
      date: Date,
      description: String,
      referenceId: ObjectId (ref: LeaveRequest)
    }
  ],
  
  // Configuration
  accrualRate: Number (leaves per month),
  accrualMethod: String (enum: ['monthly', 'yearly', 'custom']),
  
  // Status
  updatedAt: Date,
  lastAccrualDate: Date,
  
  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.leavebalances.createIndex({ "student": 1 })
db.leavebalances.createIndex({ "organization": 1, "updatedAt": -1 })
```

---

### 10. Holiday Collection

**Purpose**: Define organizational holidays

```javascript
{
  _id: ObjectId,
  organization: ObjectId (ref: Organization),
  name: String,
  date: Date,
  type: String (enum: ['national', 'regional', 'religious', 'special']),
  description: String,
  isRecurring: Boolean,
  affectsDepartments: [String] (empty = all),
  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.holidays.createIndex({ "organization": 1, "date": 1 })
db.holidays.createIndex({ "date": 1 })
```

---

### 11. WFHAssignment Collection

**Purpose**: Assign work-from-home periods

```javascript
{
  _id: ObjectId,
  student: ObjectId (ref: Student),
  organization: ObjectId (ref: Organization),
  startDate: Date,
  endDate: Date,
  reason: String,
  assignedBy: ObjectId (ref: OrgUser),
  assignedAt: Date,
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.wfhassignments.createIndex({ "student": 1, "startDate": 1, "endDate": 1 })
db.wfhassignments.createIndex({ "student": 1, "isActive": 1 })
```

---

### 12. WFHRequest Collection

**Purpose**: Track WFH requests (older system, kept for compatibility)

```javascript
{
  _id: ObjectId,
  student: ObjectId,
  WFH: String (enum: ['WFH allowed', 'Not allowed']),
  fromDate: Date,
  toDate: Date,
  reason: String,
  createdAt: Date,
  updatedAt: Date
}
```

---

### 13. OrgUser Collection

**Purpose**: Administrators and staff with role-based permissions

```javascript
{
  _id: ObjectId,
  organization: ObjectId (ref: Organization),
  email: String (unique),
  password: String (hashed),
  name: String,
  department: String,
  role: String (enum: ['admin', 'org_admin', 'hod', 'faculty', 'hoi']),
  
  // Permissions
  permissions: [String],
  
  // Status
  isActive: Boolean,
  lastLogin: Date,
  
  createdAt: Date,
  updatedAt: Date
}

// Indexes
db.orgusers.createIndex({ "organization": 1, "role": 1 })
db.orgusers.createIndex({ "email": 1 })
```

---

## Data Relationships

```
Organization
  ├─ Student (1:many)
  ├─ OrgUser (1:many)
  ├─ ShiftSchedule (1:many)
  ├─ ConsultationLog (1:many)
  ├─ DutyLocation (1:many)
  ├─ ApprovalChain (1:many)
  ├─ LeaveRequest (1:many)
  ├─ LeaveBalance (1:many)
  └─ Holiday (1:many)

Student
  ├─ Attendance (1:many)
  ├─ LeaveRequest (1:many)
  ├─ LeaveBalance (1:1)
  ├─ ConsultationLog (1:many)
  ├─ WFHAssignment (1:many)
  └─ WFHRequest (1:many)

LeaveRequest
  ├─ ApprovalChain (1:many requests)
  └─ LeaveBalance (reference via transaction)

ApprovalChain
  └─ LeaveRequest (1:many)
```

---

## Migration Path

**From Legacy to New Schema**:

1. **Multi-location migration**:
   - Copy `organization.location` to first item in `organization.locations[]`
   - Add `locationId` to existing attendance records
   - Script: `server/scripts/migrateOrgLocations.js`

2. **LeaveRequest enhancement**:
   - Add `approvalChainId`, `currentStep`, `approvalHistory` to existing records
   - Set `approvalChainId` to org's default chain
   - Set `currentStep` to 0
   - Initialize `approvalHistory` as empty array

3. **WFH consolidation**:
   - Migrate active `WFHRequest` records to `WFHAssignment`
   - Keep `WFHRequest` table for historical reference

---

## Backup Strategy

### Critical Collections (Daily)
- Attendance
- LeaveRequest
- LeaveBalance
- Student

### Important Collections (Weekly)
- Organization
- ShiftSchedule
- ApprovalChain
- ConsultationLog

### Reference Collections (Monthly)
- OrgUser
- Holiday
- DutyLocation

---

## Index Performance Tips

1. **Always verify** indexes are created on production
2. **Monitor slow queries** using MongoDB's slowlog
3. **Rebuild indexes** if performance degrades
4. **Use explain()** to verify query plans

```javascript
// Check index performance
db.attendance.aggregate([
  { $indexStats: {} }
])

// Analyze query plan
db.attendance.find({student: id, timestamp: {...}}).explain("executionStats")
```

---

## Storage Estimates (per 100k students)

| Collection | Avg Doc Size | Docs/Year | Storage |
|-----------|--------------|-----------|---------|
| Attendance | 1KB | 36.5M | 36.5GB |
| LeaveRequest | 2KB | 100K | 200MB |
| ConsultationLog | 5KB | 500K | 2.5GB |
| Student | 3KB | 100K | 300MB |
| **Total** | - | - | **~40GB/year** |

---

**Last Updated**: June 5, 2026  
**Version**: 1.0
