# Work From Home Assignment Feature

## Overview
This feature allows administrators to assign work-from-home periods to students with specific date ranges, replacing the previous simple on/off WFH system.

## Features Implemented

### Backend (Server)
1. **Enhanced Student Model** (`server/models/Student.js`)
   - Added `wfhAssignments` array with date ranges, reasons, and assignment tracking
   - Added helper methods: `hasActiveWFH()` and `getCurrentWFHAssignment()`
   - Maintains backward compatibility with legacy `WFH` field

2. **WFH Assignment API** (`server/routes/wfhAssignments.js`)
   - `GET /api/wfh/students` - Get students for assignment with current WFH status
   - `POST /api/wfh/assign` - Assign WFH to multiple students with date range
   - `POST /api/wfh/remove` - Remove WFH assignments from students
   - `GET /api/wfh/summary` - Get WFH statistics and assignments ending soon
   - `GET /api/wfh/status/:studentId?` - Get WFH status for specific student

### Web Client (Admin Dashboard)
1. **New WFH Assignments Page** (`client/src/pages/WFHAssignments.js`)
   - Student list with search and filtering
   - Multi-select students for bulk assignment
   - Date range picker for WFH periods
   - Real-time WFH status display
   - Assignment management (assign/remove)

2. **Updated Navigation** (`client/src/components/Layout.js`)
   - Added "WFH Assignments" menu item in sidebar

3. **Enhanced Dashboard** (`client/src/pages/Dashboard.js`)
   - WFH statistics in summary cards
   - Active WFH count and assignments ending soon

### Mobile App (React Native)
1. **Enhanced Attendance Screen** (`src/AttendanceScreen.tsx`)
   - Updated to check server-side WFH assignments
   - Shows WFH assignment details and expiration
   - Maintains backward compatibility with legacy WFH field

2. **Updated API Service** (`src/services/api.ts`)
   - Added `getWFHStatus()` method to check current WFH assignments

## Usage

### For Administrators
1. Navigate to "WFH Assignments" in the sidebar
2. Search and select students
3. Set start and end dates for WFH period
4. Add optional reason/notes
5. Click "Assign WFH" to apply to selected students

### For Students
1. Open the mobile app
2. Go to Attendance screen
3. If WFH is assigned, location check is bypassed
4. WFH status shows assignment details and expiration

## API Endpoints

### WFH Management
- `GET /api/wfh/students` - List students with WFH status
- `POST /api/wfh/assign` - Assign WFH to students
- `POST /api/wfh/remove` - Remove WFH assignments
- `GET /api/wfh/summary` - Get WFH statistics
- `GET /api/wfh/status/:studentId?` - Check WFH status

### Request/Response Examples

#### Assign WFH
```json
POST /api/wfh/assign
{
  "studentIds": ["60d5ecb74b24a1234567890a", "60d5ecb74b24a1234567890b"],
  "startDate": "2024-01-15",
  "endDate": "2024-01-20",
  "reason": "Remote work week"
}
```

#### WFH Status Response
```json
{
  "success": true,
  "data": {
    "hasActiveWFH": true,
    "currentAssignment": {
      "startDate": "2024-01-15T00:00:00.000Z",
      "endDate": "2024-01-20T23:59:59.000Z",
      "reason": "Remote work week",
      "assignedBy": "60d5ecb74b24a1234567890c",
      "assignedAt": "2024-01-14T10:30:00.000Z"
    }
  }
}
```

## Database Schema Changes

### Student Model Updates
```javascript
wfhAssignments: [{
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  reason: { type: String, default: 'Work from home assignment' },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true }
}]
```

## Key Features

### Date-Based Assignments
- Specific start and end dates for WFH periods
- Automatic expiration when end date is reached
- Support for multiple overlapping assignments

### Bulk Operations
- Select multiple students for assignment
- Bulk remove WFH assignments
- Efficient batch processing

### Real-Time Status
- Live WFH status checking
- Assignment expiration warnings
- Dashboard statistics

### Backward Compatibility
- Legacy `WFH` field still supported
- Graceful fallback for existing data
- Smooth migration path

## Security & Permissions
- Admin authentication required for all WFH management
- Organization-scoped operations (admins can only manage their students)
- JWT token validation on all endpoints
- Input validation and sanitization

## Future Enhancements
- Email notifications for WFH assignments
- Calendar integration
- Approval workflow for WFH requests
- Reporting and analytics
- Mobile admin interface