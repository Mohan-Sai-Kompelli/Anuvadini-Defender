# QA & Testing Checklist

## Pre-Launch Verification

### System Requirements
- [ ] Node.js v16+ installed
- [ ] MongoDB 4.4+ running
- [ ] React Native dev environment set up
- [ ] All dependencies installed (`npm install`)
- [ ] Environment variables configured
- [ ] SSL certificates configured
- [ ] Firewall rules set
- [ ] Database backups configured

---

## Backend Testing

### Server Startup
- [ ] Server starts without errors
- [ ] Database connection successful
- [ ] All routes registered
- [ ] Feature flags loaded correctly
- [ ] Logs output to file
- [ ] Port 5001 accessible
- [ ] Health check endpoint works: `GET /api/health`

### Authentication
- [ ] Student login with valid credentials works
- [ ] Login fails with invalid credentials
- [ ] JWT token generated on successful login
- [ ] Token stored in AsyncStorage (mobile)
- [ ] Token included in API requests
- [ ] Unauthorized requests rejected (401)
- [ ] Expired tokens rejected
- [ ] Logout clears token

### Attendance Marking

#### Check-in Flow
- [ ] Location permission requested and granted
- [ ] GPS coordinates captured
- [ ] Geofence validation works (within/outside)
- [ ] Face image captured
- [ ] Liveness challenge displays (if enabled)
  - [ ] Challenge sequence generated correctly
  - [ ] Actions detected (blink, turn, nod, smile)
  - [ ] Confidence scores calculated
  - [ ] Pass/fail validation works
- [ ] Face recognition succeeds
- [ ] Attendance record created
- [ ] `timestamp` and `type` recorded correctly
- [ ] `distance` from office calculated
- [ ] `attendanceMode` set to "regular" or "duty"
- [ ] Success notification sent
- [ ] UI updated immediately

#### Check-out Flow
- [ ] Check-out requires same location/face verification
- [ ] Duration calculated (check-out time - check-in time)
- [ ] `durationMinutes` stored
- [ ] Shift details attached if applicable
  - [ ] Late arrival calculated
  - [ ] Early departure calculated
- [ ] Success notification sent

#### Edge Cases
- [ ] Cannot check-in twice on same day
- [ ] Can check-out multiple times (last one is final)
- [ ] Works with WFH mode (location override)
- [ ] Works with duty mode (alternative geofence)
- [ ] Handles location mock detection
- [ ] Handles network outage gracefully

### Shift Schedules
- [ ] Shift created successfully
- [ ] `applicableDays` filters correctly
- [ ] `gracePeriodMinutes` applies to attendance
- [ ] Duration calculated correctly
- [ ] Multiple shifts per day supported
- [ ] Shift can be updated
- [ ] Shift can be soft-deleted
- [ ] Late arrival triggered when after start time + grace period
- [ ] Early departure triggered when before end time
- [ ] Flexible shifts allow variable hours

### Liveness Challenge (when enabled)
- [ ] Challenge generates 2-3 action sequence
- [ ] Sequence varied (not always same order)
- [ ] Challenge expires after 90 seconds
- [ ] Cannot reuse expired challenge
- [ ] 5 attempts max per challenge
- [ ] Blink detection works
- [ ] Head turn detection works
- [ ] Nod detection works
- [ ] Smile detection works
- [ ] Confidence threshold (0.7) enforced
- [ ] Failed action shows error and allows retry
- [ ] Completed all actions generates token
- [ ] Token valid for 5 minutes
- [ ] Token included in attendance request

### Consultation Logs (when enabled)
- [ ] Consultation log created successfully
- [ ] Image uploaded and stored
- [ ] Geolocation captured
- [ ] Geofence validation (3x org radius)
- [ ] Can update before submission
- [ ] Status tracked (pending → verified/rejected)
- [ ] Admin can view all logs
- [ ] Student can view own logs
- [ ] Admin approve/reject works
- [ ] Verification notes stored
- [ ] Rejection reason stored
- [ ] Notifications sent on status change

### Duty Mode (when enabled)
- [ ] Duty location created with time range
- [ ] Geofence radius validated
- [ ] Student sees active duty location
- [ ] Check-in to duty location works
- [ ] Geofence check accurate (within/outside)
- [ ] Cannot check-in if outside geofence
- [ ] Check-out from duty location works
- [ ] `attendanceMode` set to "duty"
- [ ] Duty location ID attached to attendance
- [ ] Multiple duty locations supported
- [ ] Time-based activation (not active before start time)
- [ ] Time-based deactivation (not active after end time)

### Leave Management

#### Leave Requests
- [ ] Leave request created
- [ ] Leave type selected (casual, sick, etc.)
- [ ] Date range specified
- [ ] Reason/notes added
- [ ] Status tracked (pending → approved/rejected)
- [ ] Notifications sent on change
- [ ] Cannot request leave during active check-in

#### Approval Chain (when enabled)
- [ ] Approval chain assigned to new request
- [ ] Current step tracked
- [ ] HOD sees pending requests
- [ ] HOD can approve (moves to next step)
- [ ] HOD can reject (resets to step 0)
- [ ] Approval history recorded
- [ ] Comments stored with approval
- [ ] Multiple steps processed sequentially
- [ ] Final approval sets `status='approved'`
- [ ] Rejection provides reason

#### Leave Balance
- [ ] Balance calculated correctly
- [ ] Monthly accrual added
- [ ] Used leaves deducted
- [ ] Remaining balance accurate
- [ ] Multiple leave types tracked separately
- [ ] Accrual rate applied correctly

### Reports (when enabled)

#### Attendance Report
- [ ] PDF generated successfully
- [ ] Attendance records included
- [ ] Employee details shown
- [ ] Summary statistics calculated
- [ ] Attendance % accurate
- [ ] Date range filters work
- [ ] Multiple pages handled
- [ ] Export to CSV works

#### Department Summary
- [ ] Department list generated
- [ ] Per-department totals calculated
- [ ] Attendance % per department accurate
- [ ] Departments sorted correctly
- [ ] PDF generated

#### Monthly Summary
- [ ] Month/year selectable
- [ ] Top performers identified (≥90%)
- [ ] Needs attention identified (<80%)
- [ ] Overall metrics calculated
- [ ] PDF generated
- [ ] CSV export works

#### KPI Dashboard
- [ ] Today's attendance count accurate
- [ ] Pending leaves count correct
- [ ] Department breakdown current
- [ ] Refreshes on demand
- [ ] Real-time updates work

---

## Web Dashboard Testing

### Authentication
- [ ] Login page loads
- [ ] Email/password fields accept input
- [ ] Login button works
- [ ] Failed login shows error
- [ ] Successful login redirects to dashboard
- [ ] Token stored in localStorage
- [ ] Logout clears token and redirects

### Navigation
- [ ] Sidebar navigation works
- [ ] Active page highlighted
- [ ] All routes accessible
- [ ] Responsive menu on mobile
- [ ] Back button works
- [ ] Breadcrumbs show correct path

### Attendance Management
- [ ] Attendance table loads
- [ ] Filters work (date, student, type)
- [ ] Pagination works (skip, limit)
- [ ] Search by student name works
- [ ] Sort by columns works
- [ ] View attendance details modal
- [ ] Export CSV works
- [ ] Export PDF works

### Shift Management
- [ ] Shift list loads
- [ ] Create shift dialog opens
- [ ] All shift fields required
- [ ] Shift created successfully
- [ ] Can edit existing shift
- [ ] Can delete shift
- [ ] Filters work
- [ ] Pagination works

### Consultation Logs
- [ ] Logs list loads
- [ ] View log details with image
- [ ] Image displays correctly
- [ ] Filters by status work
- [ ] Approve/reject dialog opens
- [ ] Verification notes required/optional
- [ ] Rejection reason required
- [ ] Approval/rejection updates list

### Approval Chains
- [ ] Chain list loads
- [ ] Create chain dialog works
- [ ] Steps builder works (add/remove)
- [ ] Edit chain works
- [ ] Delete chain works
- [ ] Default chain indicator shows
- [ ] Department filter works
- [ ] Leave type filter works

### Pending Approvals (HOD)
- [ ] Pending approvals auto-filter
- [ ] Only current step shows
- [ ] Approve dialog works
- [ ] Reject dialog requires reason
- [ ] Approval history timeline shows
- [ ] Employee details show
- [ ] Approval updates list

### Reports & HOI Dashboard
- [ ] KPI cards load
- [ ] Department table shows
- [ ] Attendance % accurate
- [ ] Download buttons work
- [ ] Month picker works (for monthly report)
- [ ] PDF downloads complete
- [ ] CSV downloads complete
- [ ] Statistics accurate

---

## Mobile App Testing

### Startup
- [ ] App launches without errors
- [ ] Splash screen displays
- [ ] Navigation bar visible
- [ ] All screens accessible
- [ ] Initial data loads
- [ ] No console errors

### Login
- [ ] Login screen accessible
- [ ] UID field accepts input
- [ ] Password field masked
- [ ] Login button enabled only with input
- [ ] Loading spinner shows while logging in
- [ ] Success notification shows
- [ ] Token stored in AsyncStorage
- [ ] Redirects to home screen

### Home Screen
- [ ] Hero card displays (name, date, status)
- [ ] Quick stats cards load (present, leave balance, WFH)
- [ ] Today's schedule loads
- [ ] Recent activity timeline shows
- [ ] Pull-to-refresh works
- [ ] No UI glitches

### Attendance Screen
- [ ] Location permission requested
- [ ] GPS coordinates shown
- [ ] Distance calculated correctly
- [ ] Status shows (checking/within/outside)
- [ ] Location badge displays color
- [ ] Check-in button enabled when in range
- [ ] Check-out button shows after check-in
- [ ] Liveness challenge appears (if enabled)
- [ ] Face detection works
- [ ] Success notification shows
- [ ] Attendance recorded

### Holiday Calendar
- [ ] Calendar grid displays
- [ ] Month navigation works
- [ ] Holidays color-coded (red)
- [ ] Leave color-coded (green/yellow)
- [ ] Today highlighted (blue)
- [ ] Date tap shows details
- [ ] Remaining leaves count shown
- [ ] Legend explains colors

### Leave Balance
- [ ] Circular gauge displays
- [ ] Balance accurate
- [ ] Monthly accrual chart shows
- [ ] Transaction history loads
- [ ] Leave requests list shows
- [ ] Used vs earned breakdown shown

### Reports Screen
- [ ] All report cards visible
- [ ] Download buttons work
- [ ] Month picker appears for monthly report
- [ ] Report descriptions clear
- [ ] Tips section helpful

### Settings
- [ ] User info displays
- [ ] Organization info shown
- [ ] Logout button works
- [ ] Logged out successfully
- [ ] Redirects to login

---

## Performance Testing

### Backend
- [ ] Server responds in <200ms for simple queries
- [ ] Large attendance queries (<2s for 10k records)
- [ ] PDF generation (<5s)
- [ ] Database queries optimized (indexes used)
- [ ] No N+1 queries
- [ ] Memory usage stable under load

### Frontend
- [ ] Dashboard loads in <3s
- [ ] Table pagination fast (<1s)
- [ ] Filters responsive (<500ms)
- [ ] Mobile app smooth (60fps)
- [ ] No jank or stuttering
- [ ] Scrolling smooth
- [ ] Animations fluid

### Mobile
- [ ] App starts in <3s
- [ ] Screens navigate smoothly (<500ms)
- [ ] No app crashes
- [ ] Battery usage acceptable
- [ ] Network usage reasonable
- [ ] Storage usage <500MB

---

## Security Testing

### Authentication
- [ ] Passwords hashed (bcrypt)
- [ ] JWT tokens signed
- [ ] Tokens expire (7 days default)
- [ ] Refresh token works
- [ ] Invalid tokens rejected
- [ ] Can't access without token
- [ ] Can't forge token

### Authorization
- [ ] Students see only own data
- [ ] Admins see org data
- [ ] HOD sees dept data
- [ ] Unauthorized access blocked (403)
- [ ] Role-based endpoints protected

### Data Protection
- [ ] Images encrypted at rest
- [ ] GPS coordinates not exposed
- [ ] Passwords never logged
- [ ] API doesn't leak error details
- [ ] CORS configured properly
- [ ] HTTPS enforced
- [ ] SQL injection prevented (Mongoose)
- [ ] XSS protection headers set

### Input Validation
- [ ] Empty inputs rejected
- [ ] Long inputs truncated
- [ ] Invalid dates rejected
- [ ] Coordinates validated
- [ ] Biometric data validated
- [ ] File uploads validated

---

## Browser Compatibility

### Desktop
- [ ] Chrome 90+ works
- [ ] Firefox 88+ works
- [ ] Safari 14+ works
- [ ] Edge 90+ works
- [ ] Mobile browser works

### Mobile
- [ ] iOS 14+ works
- [ ] Android 6+ works
- [ ] Portrait orientation works
- [ ] Landscape orientation works
- [ ] Responsive layout works

---

## Network Conditions

- [ ] Works on 4G
- [ ] Works on WiFi
- [ ] Handles slow network (2G/3G)
- [ ] Handles network switching
- [ ] Offline caching works
- [ ] Retry on network error
- [ ] Shows offline indicator

---

## Database

- [ ] MongoDB running
- [ ] Indexes created
- [ ] Backups working
- [ ] Data integrity maintained
- [ ] No orphaned records
- [ ] Soft deletes work
- [ ] Data grows cleanly

---

## Deployment

- [ ] Build succeeds
- [ ] No build warnings
- [ ] All dependencies installed
- [ ] Environment variables set
- [ ] Database migrations run
- [ ] Logs configured
- [ ] Backups verified
- [ ] Monitoring enabled
- [ ] SSL certificate valid
- [ ] Health checks pass

---

## Smoke Tests (Quick Verification)

Run these after deployment:

```bash
# Backend health
curl https://your-domain.com/api/health

# Login
curl -X POST https://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"uid":"test","password":"test"}'

# Get attendance
curl -H "Authorization: Bearer TOKEN" \
  https://your-domain.com/api/attendance

# Generate report
curl -H "Authorization: Bearer TOKEN" \
  "https://your-domain.com/api/reports/attendance?format=pdf" \
  -o test.pdf
```

---

## User Acceptance Testing (UAT)

### Faculty Users
- [ ] Can mark attendance
- [ ] Can apply for leave
- [ ] Can view leave balance
- [ ] Can see holiday calendar
- [ ] Can submit consultation logs (if enabled)
- [ ] Can view approval status

### HOD Users
- [ ] Can see department attendance
- [ ] Can approve/reject leaves
- [ ] Can view pending approvals
- [ ] Can access reports
- [ ] Can manage shifts
- [ ] Can manage duty locations

### Admin Users
- [ ] Can create users
- [ ] Can manage shifts
- [ ] Can manage duty locations
- [ ] Can verify consultation logs
- [ ] Can manage approval chains
- [ ] Can download reports
- [ ] Can access dashboard

### HOI Users
- [ ] Can access HOI dashboard
- [ ] Can view KPIs
- [ ] Can download reports
- [ ] Can see compliance alerts
- [ ] Can view department stats

---

## Regression Testing

Before each release, verify:

- [ ] All existing attendance features work
- [ ] All existing leave features work
- [ ] All existing reports work
- [ ] No performance degradation
- [ ] No security regressions
- [ ] No UI regressions
- [ ] Mobile app still works
- [ ] Web dashboard still works

---

## Sign-Off Checklist

Before going live:

- [ ] All tests passed
- [ ] Security review complete
- [ ] Performance acceptable
- [ ] UAT approved
- [ ] Database backed up
- [ ] Monitoring configured
- [ ] Support team trained
- [ ] Documentation complete
- [ ] Rollback plan ready
- [ ] Deployment window scheduled

---

**Last Updated**: June 5, 2026
**Maintained by**: QA Team
