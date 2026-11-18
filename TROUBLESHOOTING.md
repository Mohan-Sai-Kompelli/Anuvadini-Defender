# Troubleshooting Guide

## Quick Reference

| Issue | Symptom | Solution |
|-------|---------|----------|
| Backend won't start | Port in use / connection error | Kill process on port / verify MongoDB |
| App crashes on startup | Red screen / crash logs | Clear cache, check permissions, verify API URL |
| API returns 401 | "Unauthorized" / token error | Check JWT token, verify expiry, relogin |
| Geofence not working | Always "outside range" | Verify coordinates, check radius, update location |
| Database slow | Long query times | Check indexes, analyze query plans |

---

## Backend Issues

### Server Won't Start

**Error**: `Error: listen EADDRINUSE :::5001`

**Cause**: Another process using port 5001

**Solution**:
```bash
# macOS/Linux
lsof -i :5001
kill -9 <PID>

# Windows
netstat -ano | findstr :5001
taskkill /PID <PID> /F

# Change port in .env if persistent conflict
PORT=5002
```

---

### MongoDB Connection Error

**Error**: `MongooseError: connect ECONNREFUSED 127.0.0.1:27017`

**Cause**: MongoDB not running or wrong connection string

**Solution**:
```bash
# Check if MongoDB is running
mongosh

# If not running, start it:
# macOS
brew services start mongodb-community

# Linux
sudo systemctl start mongodb

# Windows
# Start MongoDB service via Services app or:
net start MongoDB

# Verify connection string in .env
MONGODB_URI=mongodb://localhost:27017/attendance_dev

# Test connection
mongosh "mongodb://localhost:27017/attendance_dev"
```

---

### Authentication Errors

**Error**: `JwtError: invalid signature` or `TokenExpiredError`

**Cause**: 
- JWT_SECRET mismatched between instances
- Token expired
- Malformed token

**Solution**:
```bash
# Verify JWT_SECRET is consistent
cat server/.env | grep JWT_SECRET

# Check token expiry
JWT_EXPIRY=7d  # Standard duration

# Generate new secret if needed
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Clear tokens and relogin
# Mobile: AsyncStorage.removeItem('token')
# Web: localStorage.clear()
```

---

### API Returns 500 Error

**Error**: `Internal Server Error` with unclear message

**Solution**:
```bash
# Check server logs
tail -f logs/app.log

# Enable debug mode temporarily
DEBUG=true
npm run dev

# Look for error stack trace

# Check Sentry if configured
# https://sentry.io/your-org
```

**Common causes**:
- Database query failed
- Missing required field in request
- File upload failed
- Unhandled exception in route

---

### Geofence Not Working

**Error**: Always returns "outside range" even when inside

**Cause**:
- GPS coordinates inaccurate
- Geofence radius too small
- Location not set properly

**Solution**:
```bash
# 1. Verify organization location in database
mongosh
> db.organizations.findOne()
> // Check location.latitude, location.longitude

# 2. Check geofence radius
// Default is 100 meters - may be too small
// Increase in database:
db.organizations.updateOne(
  { _id: ObjectId("...") },
  { $set: { "location.geofenceRadius": 200 } }
)

# 3. Verify GPS accuracy
// Mobile will show GPS coordinates on screen
// For testing: manually set coordinates in settings

# 4. Check distance calculation
// Haversine formula should return distance within radius
// Log distance being returned to verify calculation
```

---

### Rate Limiting Issues

**Error**: `429 Too Many Requests`

**Cause**: Rate limit exceeded

**Solution**:
```bash
# Adjust rate limits in .env
RATE_LIMIT_MAX_REQUESTS=1000
RATE_LIMIT_WINDOW_MS=3600000  # 1 hour

# For testing, disable temporarily:
RATE_LIMIT_ENABLED=false

# Default limits:
# Dev: 100 req/min
# Staging: 500 req/min
# Prod: 1000 req/min
```

---

## Web Dashboard Issues

### Dashboard Won't Load

**Error**: Blank white page or "Cannot GET /"

**Cause**: 
- React dev server not running
- API_URL incorrect
- Build failed

**Solution**:
```bash
cd client

# Clear cache and restart
rm -rf node_modules/.cache
npm start

# Verify API URL in .env.local
REACT_APP_API_URL=http://localhost:5001/api

# Check console for errors (F12)
# Look for:
# - CORS errors
# - 404 on API calls
# - Build errors

# If port 3000 in use:
PORT=3001 npm start
```

---

### CORS Error

**Error**: `Access to XMLHttpRequest blocked by CORS policy`

**Cause**: API not allowing frontend origin

**Solution**:
```bash
# Verify CORS_ORIGIN in backend .env
CORS_ORIGIN=http://localhost:3000,http://localhost:3001

# If developing on different IP:
CORS_ORIGIN=http://192.168.x.x:3000

# Restart backend after change
npm run dev

# For production, use exact domain:
CORS_ORIGIN=https://app.yourdomain.com
```

---

### API Calls Return 401

**Error**: `"Unauthorized"` on login or subsequent requests

**Cause**:
- Token not stored
- Token expired
- Token not sent in header

**Solution**:
```bash
# 1. Check localStorage has token
// Browser DevTools → Application → localStorage
// Look for "token" or "authToken" key

# 2. Verify token sent in requests
// Network tab → click API call
// Headers → Authorization: Bearer <token>
// If missing, check api.ts interceptor

# 3. Check token expiry
jwt.io → paste token → check exp field

# 4. Clear and relogin
localStorage.clear()
// Then login again
```

---

### Table Doesn't Load Data

**Error**: Empty table or loading spinner forever

**Cause**:
- API endpoint not responding
- Data format mismatch
- Network error

**Solution**:
```bash
# 1. Check Network tab
// F12 → Network → Click API request
// Response status should be 200
// Response data should match expected format

# 2. Check API URL
// Verify in .env.local
REACT_APP_API_URL=http://localhost:5001/api

# 3. Test API directly
curl -H "Authorization: Bearer <token>" \
  http://localhost:5001/api/attendance

# 4. Check browser console
// F12 → Console
// Look for error messages
```

---

### PDF Download Not Working

**Error**: Download starts but file is corrupt or empty

**Cause**:
- API returns error instead of PDF
- Content-Type wrong
- File generation failed

**Solution**:
```bash
# 1. Test API endpoint directly
curl -H "Authorization: Bearer <token>" \
  "http://localhost:5001/api/reports/attendance?format=pdf" \
  -o test.pdf

# 2. Check if file is valid PDF
file test.pdf
# Should return: "test.pdf: PDF document, version 1.4"

# 3. Check server logs for PDF generation errors
tail -f logs/app.log
# Look for errors in pdfExportService

# 4. Verify PDFKit is installed
cd server
npm list pdfkit
```

---

## Mobile App Issues

### App Crashes on Startup

**Error**: Red screen / app closes immediately

**Cause**:
- Metro bundler error
- Missing dependency
- Runtime error in initialization

**Solution**:
```bash
# 1. Check Metro logs
# Terminal should show error

# 2. Clear cache
npm start -- --reset-cache

# 3. Reinstall node_modules
rm -rf node_modules
npm install

# 4. Check for syntax errors
# Look at error message stack trace
# Fix the indicated file

# 5. Verify API URL
// Check src/config.ts
// API_URL should match backend PORT
export const API_URL = 'http://192.168.x.x:5001/api'
```

---

### GPS Not Working

**Error**: Location coordinates not captured / "Location permission denied"

**Cause**:
- Location permission not granted
- GPS disabled on device
- Geolocation API not supported

**Solution**:
```bash
# iOS
// Settings → Privacy → Location → App name → Allow While Using

# Android
// Settings → Apps → App name → Permissions → Location → Allow

# Emulator (Android Studio)
// Extended controls → Location → Manual input or Play a route

# If still not working:
// Check src/AttendanceScreen.tsx
// Verify Geolocation.getCurrentPosition() call
// Add error handler logging
```

---

### Camera Not Working

**Error**: Camera screen blank / "Camera permission denied"

**Cause**:
- Camera permission not granted
- Camera hardware unavailable
- Library not initialized

**Solution**:
```bash
# iOS
// Settings → Privacy → Camera → App name → Allow

# Android
// Settings → Apps → App name → Permissions → Camera → Allow

# Test on real device (emulator camera often limited)

# Check if camera library initialized
// Verify react-native-camera installation
npm list react-native-camera

# Reinstall if needed
npm install react-native-camera
```

---

### Face Detection Not Working

**Error**: Face not detected / "No face in frame"

**Cause**:
- Face landmarks model not loaded
- Poor lighting
- Face too far from camera
- MediaPipe version issue

**Solution**:
```bash
# 1. Verify MediaPipe installed
npm list @mediapipe/tasks-vision

# 2. Test with better lighting
// Ensure adequate brightness

# 3. Position face properly
// Face should be centered, ~20-30cm from camera

# 4. Check model cache
// First load takes longer while downloading models
// Should cache after first use

# 5. Clear cache if model corrupted
// Android: Clear app data
// iOS: Delete app and reinstall

# 6. Check console logs
// Look for MediaPipe error messages
```

---

### Attendance Not Saving

**Error**: "Check-in successful" but no record in database

**Cause**:
- Network connection lost
- Token expired mid-request
- API endpoint failed silently

**Solution**:
```bash
# 1. Check network
// Mobile should show network status
// Verify API response in Network tab

# 2. Check token
// Token may expire during long face detection
// Solution: Generate token just before marking attendance

# 3. Check server logs
tail -f logs/app.log
// Look for error when processing attendance

# 4. Verify in database
mongosh
> db.attendances.find({ student: ObjectId("...") })
// Should find today's record

# 5. Check timezone
// Timestamps may be in wrong timezone
// Verify NODE_ENV timezone setting
```

---

### Push Notifications Not Working

**Error**: No FCM notification received

**Cause**:
- FCM token not sent to backend
- FCM credentials not configured
- Device not registered for notifications

**Solution**:
```bash
# 1. Store FCM token on server
// After login, send token to backend
POST /api/students/:id/fcm-token
{ "token": "fcm_token_here" }

# 2. Check Firebase setup
// Verify google-services.json (Android)
// Verify GoogleService-Info.plist (iOS)

# 3. Test notification
// Server logs should show: "Sending FCM to token..."

# 4. Check device
// Settings → Notifications → App name → Allow notifications
// Battery saver may block notifications

# 5. Verify FCM credentials
// Firebase Console → Project Settings → Service Accounts
// Generate new key if needed
```

---

## Database Issues

### Slow Queries

**Error**: API timeout / very slow response

**Cause**:
- Missing indexes
- N+1 query problem
- Large dataset without pagination

**Solution**:
```bash
# 1. Check indexes
mongosh
> db.attendances.getIndexes()

# 2. Analyze query performance
> db.attendances.find({ student: ObjectId("...") }).explain("executionStats")
// Look for "executionStages.stage": "COLLSCAN"
// If COLLSCAN, need index on student

# 3. Create missing indexes
> db.attendances.createIndex({ "student": 1, "createdAt": -1 })

# 4. Check for N+1 queries
// Each attendance lookup gets student details separately
// Solution: Use .populate() or aggregation

# 5. Add pagination
// Limit to 100 records per request
// Use skip/limit parameters
```

---

### Data Corruption

**Error**: Invalid data in records / inconsistent state

**Cause**:
- Concurrent writes
- Failed transaction
- Data migration issue

**Solution**:
```bash
# 1. Backup database immediately
mongodump --uri="mongodb+srv://..." --out=./backup

# 2. Identify affected records
mongosh
> db.attendances.find({ 
    $or: [
      { durationMinutes: { $exists: false } },
      { timestamp: { $type: "string" } }
    ]
  }).count()

# 3. Repair records
> db.attendances.updateMany(
    { durationMinutes: { $exists: false } },
    { $set: { durationMinutes: null } }
  )

# 4. Restore from backup if critical
mongorestore ./backup --uri="mongodb+srv://..."

# 5. Prevent future corruption
// Enable transaction support (MongoDB 4.0+)
// Add validation schema
// Add unit tests for data integrity
```

---

### Backup Failures

**Error**: Backup job fails / incomplete dump

**Cause**:
- Insufficient permissions
- Out of disk space
- Database too large

**Solution**:
```bash
# 1. Check permissions
chmod 755 ./backup
whoami  # Verify user

# 2. Check disk space
df -h
# Need enough space for entire database

# 3. Increase timeout for large databases
mongodump \
  --uri="mongodb+srv://..." \
  --out=./backup \
  --numParallelCollections=4

# 4. Incremental backup for large dbs
# Use --query parameter:
mongodump \
  --uri="mongodb+srv://..." \
  --out=./backup \
  --query='{ "createdAt": { $gte: ISODate("2024-01-01") } }'

# 5. Automate daily backups
# Use cron job or AWS Backup
```

---

## Network & Deployment Issues

### SSL Certificate Errors

**Error**: `CERTIFICATE_VERIFY_FAILED` or "Not secure" warning

**Cause**:
- Certificate expired
- Certificate not installed
- Self-signed certificate in production

**Solution**:
```bash
# 1. Check certificate expiry
openssl s_client -connect yourdomain.com:443

# 2. Renew with Let's Encrypt (free)
certbot renew --force-renewal

# 3. Install certificate in app
// For self-signed (dev only):
// Android: add to network_security_config.xml
// iOS: add to Info.plist NSExceptionDomains

# 4. In production, use valid cert from:
// Let's Encrypt (free)
// AWS Certificate Manager
// DigiCert, Comodo, etc.
```

---

### High Memory Usage

**Error**: Server crashes / "out of memory"

**Cause**:
- Memory leak in code
- Large file upload
- Too many concurrent connections

**Solution**:
```bash
# 1. Monitor memory
node --max-old-space-size=4096 server/index.js
# Allocate 4GB RAM to Node

# 2. Find memory leaks
npm install -g clinic
clinic doctor -- node server/index.js

# 3. Limit file uploads
MAX_FILE_SIZE=5242880  # 5MB

# 4. Connection pooling
MONGODB_POOL_SIZE=10
// Reduce if memory constrained

# 5. Enable garbage collection logging
node --expose-gc --trace-gc server/index.js
```

---

### High CPU Usage

**Error**: Server slow / CPU at 100%

**Cause**:
- Inefficient algorithm
- Infinite loop
- Too many concurrent operations

**Solution**:
```bash
# 1. Profile CPU usage
clinic flame -- node server/index.js

# 2. Check for blocking operations
// Avoid synchronous operations
// Use async/await properly

# 3. Optimize database queries
// Add indexes
// Use aggregation pipeline

# 4. Reduce concurrent operations
// Implement queue (Bull, BullMQ)
// Limit concurrency per user
```

---

## Performance Optimization

### Slow API Response

**Target**: <200ms for simple queries

**Diagnosis**:
```bash
# Check response time
curl -w "\nTime: %{time_total}s\n" \
  http://localhost:5001/api/attendance
```

**Solutions**:
1. **Add database indexes**
2. **Enable caching** (Redis)
3. **Use pagination** (limit 100 records)
4. **Optimize queries** (select specific fields)
5. **Use CDN** (for static files)

### Slow Dashboard Load

**Target**: <3 seconds

**Diagnosis**:
```bash
# Browser DevTools → Performance tab
# Record load time
# Look for slow tasks
```

**Solutions**:
1. **Code splitting** (lazy load pages)
2. **Image optimization** (compress, WebP)
3. **API response caching**
4. **Virtual scrolling** (for long lists)

---

## Testing & Verification

### Quick Health Check

```bash
# Backend health
curl http://localhost:5001/api/health

# Database
mongosh --eval "db.adminCommand('ping')"

# Frontend health check script
npm run test:health
```

---

## Emergency Procedures

### Database Recovery (if corrupted)

```bash
# 1. Stop application
npm stop

# 2. Restore from backup
mongorestore ./backup --drop

# 3. Verify data
mongosh
> db.attendances.count()

# 4. Restart application
npm start
```

### Rollback Failed Deployment

```bash
# 1. Check previous version
git log --oneline | head -5

# 2. Revert to working version
git reset --hard <commit-hash>

# 3. Rebuild and restart
npm install
npm run build
npm start
```

### Reset User Session

```bash
# Backend
mongosh
> db.students.updateOne({ _id: ObjectId("...") }, { $unset: { fcmToken: 1 } })

# Frontend/Mobile
localStorage.clear()  // Web
AsyncStorage.clear()  // Mobile
```

---

## Getting Help

1. **Check logs first**
   ```bash
   tail -f logs/app.log
   ```

2. **Search documentation**
   - API_DOCUMENTATION.md
   - DEPLOYMENT_GUIDE.md
   - DATABASE_SCHEMA.md

3. **Check GitHub Issues**
   - Search for similar issues
   - Provide minimal reproducible example

4. **Contact Support**
   - Email: support@yourdomain.com
   - Slack: #technical-support
   - Response time: 24 hours

---

**Last Updated**: June 5, 2026  
**Version**: 1.0
