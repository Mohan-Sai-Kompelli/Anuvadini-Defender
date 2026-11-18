# MARBISM Phase 1 - API Quick Reference

Quick lookup guide for all new endpoints added in Phase 1.

---

## 📚 Timetable Management

### Admin: Create Class Schedule
```
POST /api/timetables
Authorization: Bearer <token>

Body:
{
  "course": "BAMS",
  "subject": "Padartha Vigyanam",
  "semester": 3,
  "faculty": "60a1234567890abcdef12345",
  "classType": "lecture",
  "dayOfWeek": 1,
  "startTime": "09:00",
  "endTime": "10:30",
  "academicYear": "2024-2025",
  "classroom": {
    "name": "Lecture Hall A",
    "latitude": 28.7041,
    "longitude": 77.1025,
    "classroomCode": "LHA001",
    "geofenceRadius": 50
  }
}
```

### Admin: List All Timetables
```
GET /api/timetables?skip=0&limit=50&isActive=true&academicYear=2024-2025
Authorization: Bearer <token>
```

### Admin: Get Specific Timetable
```
GET /api/timetables/:id
Authorization: Bearer <token>
```

### Admin: Update Timetable
```
PUT /api/timetables/:id
Authorization: Bearer <token>

Body: { field: value, ... }
```

### Admin: Deactivate Timetable
```
DELETE /api/timetables/:id
Authorization: Bearer <token>
```

### Admin: Assign Substitute Faculty
```
POST /api/timetables/:id/assign-substitute
Authorization: Bearer <token>

Body:
{
  "substituteId": "60a1234567890abcdef99999",
  "startDate": "2024-06-10",
  "endDate": "2024-06-15",
  "reason": "Medical leave"
}
```

---

## 📋 Faculty Class Check-in

### Faculty: Get Today's Schedule
```
GET /api/timetables/my/today
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "subject": "Padartha Vigyanam",
      "startTime": "09:00",
      "endTime": "10:30",
      "checkinStatus": "not_started",
      "classroom": {...}
    }
  ]
}
```

### Faculty: Get This Week's Schedule
```
GET /api/timetables/my/week
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "0": { "day": "Sunday", "classes": [] },
    "1": { "day": "Monday", "classes": [...] },
    ...
  }
}
```

### Faculty: Check In for Class
```
POST /api/timetables/:id/check-in
Authorization: Bearer <token>

Body:
{
  "latitude": 28.7041,
  "longitude": 77.1025,
  "faceImage": "base64_image_data",
  "deviceId": "android_device_id",
  "deviceOS": "Android 14",
  "deviceModel": "Samsung Galaxy S24"
}

Response:
{
  "success": true,
  "data": { ... checkin record ... },
  "arrivalStatus": "on_time",
  "lateBy": 0
}
```

### Faculty: Check Out from Class
```
POST /api/timetables/:id/check-out
Authorization: Bearer <token>

Body:
{
  "latitude": 28.7041,
  "longitude": 77.1025,
  "faceImage": "base64_image_data",
  "notes": "Good class, covered all topics"
}

Response:
{
  "success": true,
  "data": { ... checkin record ... },
  "actualDuration": 90,
  "departureStatus": "on_time"
}
```

---

## 📊 Faculty Analytics

### Admin: Get Faculty Compliance Report
```
GET /api/timetables/analytics/faculty/:facultyId?month=6&year=2024
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "month": "June 2024",
    "totalClasses": 24,
    "completedClasses": 23,
    "completionRate": 95,
    "lateArrivals": 2,
    "earlyDepartures": 0,
    "avgComplianceScore": 92,
    "flaggedClasses": 2,
    "recentCheckins": [...]
  }
}
```

---

## 🏥 Clinical Duty Management

### Admin: Create Duty Roster
```
POST /api/duty-rosters
Authorization: Bearer <token>

Body:
{
  "dutyType": "opd",
  "department": "Kayachikitsa",
  "doctor": "60a1234567890abcdef12345",
  "date": "2024-06-05",
  "shiftType": "morning",
  "startTime": "09:00",
  "endTime": "13:00",
  "facility": {
    "name": "OPD Block A",
    "location": {
      "latitude": 28.7041,
      "longitude": 77.1025
    }
  },
  "expectedPatientCount": 20,
  "patientCountTarget": 15
}
```

### Admin: List All Duty Rosters
```
GET /api/duty-rosters?skip=0&limit=50&dutyType=opd&status=scheduled&date=2024-06-05
Authorization: Bearer <token>
```

### Admin: Get Specific Roster
```
GET /api/duty-rosters/:id
Authorization: Bearer <token>
```

### Admin: Update Duty Roster
```
PUT /api/duty-rosters/:id
Authorization: Bearer <token>

Body: { field: value, ... }
```

### Admin: Assign Substitute Doctor
```
POST /api/duty-rosters/:id/assign-substitute
Authorization: Bearer <token>

Body:
{
  "substituteId": "60a1234567890abcdef99999",
  "startDate": "2024-06-10",
  "endDate": "2024-06-15",
  "reason": "Doctor on sick leave"
}
```

---

## 👨‍⚕️ Doctor Duty Check-in

### Doctor: Get Today's Duties
```
GET /api/duty-rosters/my/today
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "dutyType": "opd",
      "department": "Kayachikitsa",
      "startTime": "09:00",
      "endTime": "13:00",
      "facility": {...},
      "status": "scheduled"
    }
  ]
}
```

### Doctor: Check In for Duty
```
POST /api/duty-rosters/:id/check-in
Authorization: Bearer <token>

Body:
{
  "latitude": 28.7041,
  "longitude": 77.1025,
  "faceImage": "base64_image_data",
  "deviceId": "android_device_id",
  "deviceOS": "Android 14",
  "deviceModel": "Samsung Galaxy S24"
}

Response:
{
  "success": true,
  "data": { ... roster record ... },
  "arrivalStatus": { "isLate": false, "minutes": 0 },
  "withinGeofence": true
}
```

### Doctor: Check Out from Duty
```
POST /api/duty-rosters/:id/check-out
Authorization: Bearer <token>

Body:
{
  "latitude": 28.7041,
  "longitude": 77.1025,
  "faceImage": "base64_image_data",
  "clinicalData": {
    "actuaPatientsConsulted": 18,
    "newPatients": 8,
    "followUpPatients": 10,
    "procedures": 2,
    "referrals": 1
  },
  "notes": "High patient load today"
}

Response:
{
  "success": true,
  "data": { ... roster record ... },
  "actualDuration": 3.75,
  "complianceScore": 92
}
```

---

## 📈 Clinical Duty Analytics

### Admin: Get Doctor Clinical Report
```
GET /api/duty-rosters/analytics/doctor/:doctorId?month=6&year=2024
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "month": "June 2024",
    "totalDuties": 20,
    "completedDuties": 19,
    "completionRate": 95,
    "lateArrivals": 1,
    "earlyDepartures": 0,
    "totalPatientsConsulted": 285,
    "avgPatientsPerDuty": 15,
    "avgComplianceScore": 91,
    "flaggedDuties": 1
  }
}
```

---

## 🎓 MARBISM Multi-Org Dashboard

### MARBISM Admin: Get Compliance Dashboard
```
GET /api/marbism/dashboard?month=6&year=2024&ratingFilter=A
Authorization: Bearer <token>

Response:
{
  "success": true,
  "period": "June 2024",
  "statistics": {
    "totalOrganizations": 300,
    "avgRating": 78.5,
    "excellentCount": 25,
    "goodCount": 50,
    "satisfactoryCount": 100,
    "needsImprovementCount": 75,
    "criticalCount": 50,
    "criticalAlerts": 12
  },
  "organizations": [
    {
      "orgName": "SHUATS Medical College",
      "marbismRating": 92.5,
      "ratingCategory": "A",
      "metrics": {...},
      "flags": {...}
    },
    ...
  ]
}
```

### MARBISM Admin: Get Specific Org Compliance
```
GET /api/marbism/org/:orgId/compliance?month=6&year=2024
Authorization: Bearer <token>

Response:
{
  "success": true,
  "organization": {
    "id": "...",
    "name": "SHUATS Medical College",
    "type": "medical_college"
  },
  "metrics": {
    "marbismRating": 92.5,
    "ratingCategory": "A",
    "metrics": {...}
  }
}
```

### MARBISM Admin: Get Compliance Trends
```
GET /api/marbism/trends?months=6&orgId=:orgId (optional)
Authorization: Bearer <token>

Response:
{
  "success": true,
  "monthsShown": 6,
  "data": [
    {
      "month": "Jan 24",
      "rating": 75.2,
      "metrics": {
        "avgAttendance": 82,
        "avgClassCompletion": 88,
        "avgClinicCompletion": 85
      }
    },
    ...
  ]
}
```

### MARBISM Admin: Get All Alerts
```
GET /api/marbism/alerts?severity=critical&resolved=false
Authorization: Bearer <token>

Response:
{
  "success": true,
  "alerts": [
    {
      "title": "Critical Attendance Issue",
      "severity": "critical",
      "organization": "XYZ Medical College",
      "affectedArea": "Attendance Management",
      "createdAt": "2024-06-05...",
      "action": "Review attendance policies"
    }
  ]
}
```

### MARBISM Admin: Add Alert
```
POST /api/marbism/org/:orgId/alert
Authorization: Bearer <token>

Body:
{
  "severity": "critical",
  "title": "Low Class Completion Rate",
  "description": "Classes completion rate below 80%",
  "affectedArea": "Academic Activity",
  "action": "Review faculty schedule and conduct"
}
```

### MARBISM Admin: Perform Compliance Review
```
POST /api/marbism/org/:orgId/compliance-review
Authorization: Bearer <token>

Body:
{
  "notes": "Audit completed, minor issues found",
  "dataProtectionOk": true,
  "auditTrailOk": true,
  "encryptionOk": true,
  "backupStatus": "current"
}

Response:
{
  "success": true,
  "message": "Compliance review completed",
  "data": {
    "lastComplianceReview": "2024-06-05...",
    "anuvadiniCompliance": {...}
  }
}
```

### MARBISM Admin: Export Compliance Report
```
GET /api/marbism/export/compliance-report?month=6&year=2024&format=csv
Authorization: Bearer <token>

Response: CSV file download
OR if format=json:
{
  "success": true,
  "report": [
    {
      "organization": "SHUATS Medical College",
      "rating": 92.5,
      "category": "A",
      "attendance": 88,
      "classCompletion": 95,
      "clinicalCompletion": 92,
      "flags": ""
    }
  ]
}
```

---

## 🔐 Authentication

All endpoints require JWT token in Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

## 🎯 Role-Based Access

| Endpoint | Admin | Faculty | Doctor | MARBISM |
|----------|-------|---------|--------|---------|
| POST /api/timetables | ✅ | ❌ | ❌ | ❌ |
| GET /api/timetables/my/today | ❌ | ✅ | ❌ | ❌ |
| POST /api/timetables/:id/check-in | ❌ | ✅ | ❌ | ❌ |
| POST /api/duty-rosters | ✅ | ❌ | ❌ | ❌ |
| GET /api/duty-rosters/my/today | ❌ | ❌ | ✅ | ❌ |
| GET /api/marbism/dashboard | ❌ | ❌ | ❌ | ✅ |

---

## 📋 Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 500 | Server Error |

---

## 🔗 Related Documentation

- [Full Phase 1 Implementation](MARBISM_PHASE1_IMPLEMENTATION.md)
- [Database Schema](DATABASE_SCHEMA.md)
- [API Documentation](API_DOCUMENTATION.md)
- [Troubleshooting](TROUBLESHOOTING.md)

---

**Last Updated**: June 5, 2026  
**Version**: 1.0
