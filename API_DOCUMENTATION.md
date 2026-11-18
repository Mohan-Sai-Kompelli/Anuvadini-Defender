# Attendance & Biometric System - API Documentation

## Base URL
```
http://localhost:5001/api
```

## Authentication
All endpoints (except `/auth/*`) require JWT token in Authorization header:
```
Authorization: Bearer <token>
```

---

## Authentication Endpoints

### POST /auth/login
**Student login with UID and password**

**Request:**
```json
{
  "uid": "STU001",
  "password": "password123"
}
```

**Response (201):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "student_id",
    "name": "John Doe",
    "uid": "STU001",
    "role": "student"
  },
  "student": {
    "fullName": "John Doe",
    "uid": "STU001",
    "organization": {...}
  }
}
```

---

## Attendance Endpoints

### POST /attendance/mark
**Mark attendance (check-in or check-out)**

**Request:**
```json
{
  "type": "in",
  "latitude": 28.7041,
  "longitude": 77.1025,
  "faceImage": "base64_encoded_image",
  "authMethod": "face"
}
```

**Response (201):**
```json
{
  "success": true,
  "attendance": {
    "id": "att_123",
    "type": "in",
    "timestamp": "2026-06-05T08:30:00Z",
    "distance": 45.5,
    "attendanceMode": "regular",
    "faceVerified": true,
    "durationMinutes": null,
    "shiftId": "shift_456"
  }
}
```

### GET /attendance
**Get organization attendance records (paginated)**

**Query Parameters:**
- `startDate`: Date range start (YYYY-MM-DD)
- `endDate`: Date range end (YYYY-MM-DD)
- `studentId`: Filter by student
- `limit`: Records per page (default: 50)
- `page`: Page number (default: 1)

**Response (200):**
```json
{
  "success": true,
  "attendance": [
    {
      "id": "att_123",
      "student": {"id": "stu_1", "fullName": "John Doe"},
      "type": "in",
      "timestamp": "2026-06-05T08:30:00Z",
      "distance": 45.5,
      "attendanceMode": "regular"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "pages": 3
  }
}
```

### GET /attendance/export
**Export attendance as PDF or CSV**

**Query Parameters:**
- `format`: "pdf" or "csv" (default: "csv")
- `startDate`: Range start
- `endDate`: Range end
- `studentId`: Optional filter

**Response:** File download (PDF/CSV)

---

## Shift Schedule Endpoints

### GET /shifts/applicable
**Get today's applicable shifts for student**

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "shift_1",
      "name": "Morning Shift",
      "startTime": "09:00",
      "endTime": "17:00",
      "shiftType": "regular",
      "gracePeriodMinutes": 15,
      "durationHours": 8
    }
  ]
}
```

### POST /shifts
**Create new shift (admin only)**

**Request:**
```json
{
  "name": "Morning Shift",
  "shiftType": "regular",
  "startTime": "09:00",
  "endTime": "17:00",
  "applicableDays": [1, 2, 3, 4, 5],
  "gracePeriodMinutes": 15,
  "applicableDepartments": ["Engineering", "HR"],
  "isFlexible": false
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {...}
}
```

### GET /shifts
**List all organization shifts**

**Query Parameters:**
- `department`: Filter by department
- `skip`: Pagination offset
- `limit`: Records per page

### PUT /shifts/:id
**Update shift (admin)**

### DELETE /shifts/:id
**Soft delete shift (admin)**

---

## Liveness Challenge Endpoints

### POST /liveness/challenge
**Generate liveness challenge**

**Response (200):**
```json
{
  "success": true,
  "data": {
    "challengeId": "chal_abc123",
    "sequence": ["blink", "turn_left", "nod"],
    "expiresAt": "2026-06-05T08:45:00Z"
  }
}
```

### POST /liveness/verify
**Verify liveness challenge results**

**Request:**
```json
{
  "challengeId": "chal_abc123",
  "results": [
    {"action": "blink", "passed": true, "confidence": 0.92},
    {"action": "turn_left", "passed": true, "confidence": 0.85},
    {"action": "nod", "passed": true, "confidence": 0.88}
  ]
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "verified": true,
    "token": "liveness_token_xyz"
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Liveness verification failed",
  "details": {
    "turn_left": "Confidence 0.65 below threshold 0.7"
  }
}
```

---

## Consultation Logs Endpoints

### POST /consultation-logs
**Submit consultation log with geo-tagged image**

**Request (multipart/form-data):**
```
consultationType: "opd"
patientCount: 3
notes: "General checkup"
latitude: 28.7041
longitude: 77.1025
image: <binary_image_file>
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "clog_1",
    "consultationType": "opd",
    "patientCount": 3,
    "status": "pending",
    "geoTaggedImagePath": "/uploads/consultation-logs/123.jpg",
    "latitude": 28.7041,
    "longitude": 77.1025
  }
}
```

### GET /consultation-logs/my
**Get student's consultation logs**

**Query Parameters:**
- `status`: "pending", "verified", "rejected"
- `consultationType`: Filter by type
- `skip`, `limit`: Pagination

### GET /consultation-logs
**Admin list all consultation logs**

**Query Parameters:**
- `status`: Filter by status
- `consultationType`: Filter by type
- `department`: Filter by department
- `search`: Search by student name
- `skip`, `limit`: Pagination

### PUT /consultation-logs/:id/verify
**Admin approve/reject consultation log**

**Request:**
```json
{
  "action": "approve",
  "verificationNotes": "Verified on-site visit"
}
```

OR

```json
{
  "action": "reject",
  "rejectionReason": "Missing documentation"
}
```

---

## Duty Location Endpoints

### GET /duty-locations/active
**Get active duty locations for student**

**Query Parameters:**
- `latitude`: Student latitude
- `longitude`: Student longitude

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "dl_1",
      "name": "Health Camp - Downtown",
      "dutyType": "health_camp",
      "latitude": 28.7041,
      "longitude": 77.1025,
      "geofenceRadius": 200,
      "startDateTime": "2026-06-05T08:00:00Z",
      "endDateTime": "2026-06-05T16:00:00Z",
      "distance": 0.05,
      "isWithinGeofence": true
    }
  ]
}
```

### POST /duty-locations/:id/check-in
**Check in to duty location**

**Request:**
```json
{
  "latitude": 28.7041,
  "longitude": 77.1025
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "dutyLocation": {...},
    "attendance": {
      "id": "att_1",
      "attendanceMode": "duty",
      "dutyLocationId": "dl_1"
    }
  }
}
```

### POST /duty-locations/:id/check-out
**Check out from duty location**

**Request:**
```json
{
  "latitude": 28.7041,
  "longitude": 77.1025
}
```

### POST /duty-locations
**Create duty location (admin)**

**Request:**
```json
{
  "name": "Health Camp - Downtown",
  "description": "Medical camp for annual health checkups",
  "latitude": 28.7041,
  "longitude": 77.1025,
  "geofenceRadius": 200,
  "startDateTime": "2026-06-05T08:00:00Z",
  "endDateTime": "2026-06-05T16:00:00Z",
  "dutyType": "health_camp",
  "requiresFaceVerification": true,
  "requiresLiveness": false
}
```

---

## Approval Chain Endpoints

### GET /approval-chains
**List all approval chains (admin)**

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "chain_1",
      "name": "Faculty → HOD",
      "steps": [
        {
          "stepOrder": 0,
          "approverType": "hod",
          "approverDepartment": "Medical",
          "slaHours": 24
        }
      ],
      "applicableDepartments": ["Medical", "Nursing"],
      "applicableLeaveTypes": ["casual", "earned"],
      "isDefault": true,
      "isActive": true
    }
  ]
}
```

### POST /approval-chains
**Create approval chain (admin)**

**Request:**
```json
{
  "name": "Faculty → HOD → Director",
  "steps": [
    {
      "stepOrder": 0,
      "approverType": "hod",
      "approverDepartment": "Medical",
      "slaHours": 24
    },
    {
      "stepOrder": 1,
      "approverType": "specific_user",
      "approverUserId": "user_123",
      "slaHours": 48
    }
  ],
  "applicableDepartments": [],
  "applicableLeaveTypes": [],
  "isDefault": true
}
```

### POST /approval-chains/:chainId/approve-leave/:leaveId
**Approve leave request (HOD)**

**Request:**
```json
{
  "comment": "Approved. Employee is essential for medical camp."
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Leave request moved to next approval step",
  "data": {
    "id": "leave_1",
    "status": "pending",
    "currentStep": 1,
    "approvalHistory": [
      {
        "step": 0,
        "action": "approved",
        "comment": "Approved. Employee is essential for medical camp.",
        "at": "2026-06-05T09:00:00Z"
      }
    ]
  }
}
```

### POST /approval-chains/:chainId/reject-leave/:leaveId
**Reject leave request (HOD)**

**Request:**
```json
{
  "comment": "Cannot approve - critical period"
}
```

### GET /approval-chains/pending/my-approvals
**Get pending approvals for current user (HOD)**

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "leave_1",
      "student": {
        "fullName": "John Doe",
        "uid": "STU001",
        "department": "Medical"
      },
      "leaveDates": {
        "start": "2026-06-10",
        "end": "2026-06-15"
      },
      "leaveType": "casual",
      "reason": "Family emergency",
      "currentStep": 0,
      "approvalHistory": [],
      "submittedAt": "2026-06-05T08:00:00Z"
    }
  ]
}
```

---

## Reports Endpoints

### GET /reports/attendance
**Get attendance report (JSON or PDF)**

**Query Parameters:**
- `startDate`: Range start
- `endDate`: Range end
- `studentId`: Optional filter
- `department`: Optional filter
- `format`: "json" or "pdf" (default: "json")

**Response (200 - JSON):**
```json
{
  "success": true,
  "data": [
    {
      "id": "att_1",
      "type": "in",
      "timestamp": "2026-06-05T08:30:00Z",
      "distance": 45.5
    }
  ],
  "count": 150
}
```

**Response (200 - PDF):** File download

### GET /reports/department-summary
**Department-wise attendance summary**

**Query Parameters:**
- `startDate`, `endDate`: Date range
- `format`: "json" or "pdf"

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "name": "Medical",
      "total": 50,
      "present": 45,
      "absent": 5,
      "percentage": "90.00"
    }
  ]
}
```

### GET /reports/monthly-summary
**Monthly attendance summary with performance metrics**

**Query Parameters:**
- `month`: Month number (1-12)
- `year`: Year
- `format`: "json" or "pdf"

**Response (200):**
```json
{
  "success": true,
  "data": {
    "totalEmployees": 200,
    "totalWorkingDays": 22,
    "avgAttendance": "87.50",
    "topPerformers": [
      {
        "name": "John Doe",
        "attendance": "98.00",
        "presentDays": 21,
        "totalDays": 22
      }
    ],
    "needsAttention": [
      {
        "name": "Jane Smith",
        "attendance": "68.00",
        "presentDays": 15,
        "totalDays": 22
      }
    ]
  }
}
```

### GET /reports/dashboard-kpis
**KPI data for executive dashboard**

**Response (200):**
```json
{
  "success": true,
  "data": {
    "today": {
      "present": 150,
      "absent": 50,
      "total": 200,
      "percentage": "75.0"
    },
    "leaves": {
      "pending": 5,
      "approved": 12,
      "total": 17
    },
    "departments": [
      {
        "department": "Medical",
        "total": 50,
        "present": 45,
        "percentage": "90.0"
      }
    ]
  }
}
```

### GET /reports/compliance
**Employees below 80% attendance**

**Query Parameters:**
- `startDate`, `endDate`: Date range
- `format`: "json" or "csv"

**Response (200 - JSON):**
```json
{
  "success": true,
  "data": [
    {
      "name": "Jane Smith",
      "uid": "STU005",
      "email": "jane@example.com",
      "department": "Nursing",
      "attendance": "68.00",
      "presentDays": 15,
      "totalDays": 22
    }
  ],
  "count": 5
}
```

---

## Leave Balance Endpoints

### GET /leaveBalance/student/remaining
**Get remaining leave balance for student**

**Response (200):**
```json
{
  "success": true,
  "data": {
    "totalLeaves": 30,
    "usedLeaves": 5,
    "remainingLeaves": 25,
    "leaveType": "casual",
    "accrualRate": 2.5,
    "monthlyAccrual": 2.5
  }
}
```

### GET /leave-balance/my
**Get complete leave balance with transactions**

**Response (200):**
```json
{
  "success": true,
  "data": {
    "student": "stu_1",
    "balances": {
      "casual": {
        "total": 12,
        "used": 3,
        "available": 9
      },
      "sick": {
        "total": 6,
        "used": 1,
        "available": 5
      }
    },
    "transactions": [
      {
        "type": "earned",
        "amount": 2.5,
        "month": "May 2026",
        "date": "2026-05-01T00:00:00Z"
      }
    ]
  }
}
```

---

## Holiday Endpoints

### GET /employee-holidays
**Get holidays for employee**

**Query Parameters:**
- `month`: Month number
- `year`: Year

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "hol_1",
      "name": "Independence Day",
      "date": "2026-08-15",
      "type": "national",
      "description": "National holiday"
    }
  ]
}
```

---

## Error Response Format

All errors follow this format:

```json
{
  "success": false,
  "error": "Error message",
  "message": "Optional detailed message"
}
```

**Common HTTP Status Codes:**
- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `500`: Server Error

---

## Rate Limiting

API endpoints are rate-limited:
- **Public endpoints**: 100 requests/minute
- **Authenticated endpoints**: 500 requests/minute
- **Admin endpoints**: 1000 requests/minute

Headers returned:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1623036000
```

---

## Pagination

List endpoints support pagination:

**Query Parameters:**
- `skip`: Number of records to skip (default: 0)
- `limit`: Records per page (default: 50, max: 500)

**Response includes:**
```json
{
  "pagination": {
    "total": 500,
    "skip": 0,
    "limit": 50,
    "pages": 10
  }
}
```

---

## Webhook Events (Future)

The following events will trigger webhooks when implemented:

- `attendance.checked_in` - Student checked in
- `attendance.checked_out` - Student checked out
- `leave.requested` - Leave request submitted
- `leave.approved` - Leave approved
- `leave.rejected` - Leave rejected
- `consultation.submitted` - Consultation log submitted
- `consultation.verified` - Consultation verified

---

## Testing

### cURL Examples

**Get Attendance:**
```bash
curl -H "Authorization: Bearer token" \
  "http://localhost:5001/api/attendance?limit=10"
```

**Mark Attendance:**
```bash
curl -X POST \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{"type":"in","latitude":28.7041,"longitude":77.1025}' \
  "http://localhost:5001/api/attendance/mark"
```

**Download Attendance PDF:**
```bash
curl -H "Authorization: Bearer token" \
  "http://localhost:5001/api/reports/attendance?format=pdf" \
  -o attendance_report.pdf
```

---

## Version History

- **v1.0** (2026-06-05): Initial release with core features
  - Attendance marking
  - Shift schedules
  - Liveness verification
  - Consultation logs
  - Duty mode
  - Leave approval workflow
  - PDF reports
  - HOI dashboard

---

**Last Updated**: June 5, 2026
**Maintained by**: Development Team
