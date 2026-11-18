# Backend Connectivity Test Guide

## Quick Status Check

**✅ Backend API is working and responding correctly**

Tested endpoint: `POST http://192.168.1.33:5001/api/auth/student/lookup`

Test result:
```json
{
  "success": true,
  "student": {
    "fullName": "subham",
    "uid": "8117882067",
    "organization": {
      "name": "Anuvadini"
    }
  }
}
```

---

## How to Test from Your Mobile App

### Step 1: Run the App
Start your React Native app as usual.

### Step 2: On the Login Screen
Look for the **🔧 Test Backend Connection** button at the bottom of the screen.

### Step 3: Click the Test Button
- This will test if your mobile device can reach the backend server
- You'll see a popup with the result

### Possible Results

#### ✅ SUCCESS
```
✅ Connection Test PASSED
Backend is reachable and responding!
Status: 200
```
→ **Your mobile can reach the backend. The API is working!**

#### ❌ FAILURE - Connection Error
```
❌ Cannot Connect to Backend
Error: Network request failed

Please check:
1. Backend server is running on 192.168.1.33:5001
2. Device is connected to same network
3. No firewall blocking the connection
```
→ **Your mobile CANNOT reach the backend. Check network connectivity.**

#### ❌ FAILURE - HTTP Error
```
❌ Connection Test FAILED
Backend responded with error:
Status: 500
Message: [error details]
```
→ **Backend is reachable but has an error. Check server logs.**

---

## How to Test from Command Line

### Using PowerShell (Windows)
```powershell
# Navigate to project directory
cd "d:\anuvadiniatt\examples\facelandmarkdetection"

# Run the test script
.\test-api.ps1
```

### Using curl (any platform)
```bash
curl -X POST "http://192.168.1.33:5001/api/auth/student/lookup" \
  -H "Content-Type: application/json" \
  -d '{"uid":"8117882067"}'
```

Expected response:
```json
{"success":true,"student":{"id":"68c8df9a86993fb7f7408a3f",...}}
```

---

## Network Requirements

For your mobile app to reach the backend, ensure:

1. **Same Network**: Your mobile device and backend server must be on the same WiFi network
2. **IP Address**: Backend is running on `192.168.1.33:5001`
3. **Port**: Server is listening on port `5001`
4. **Firewall**: No firewall blocking port 5001

### Check IP Address

If you're not sure about your backend IP:

**On Windows (PowerShell)**:
```powershell
ipconfig
```
Look for `IPv4 Address` that matches `192.168.1.x` range.

**On Linux/Mac**:
```bash
ifconfig
```

---

## Common Issues

### Issue: "Network request failed"
**Cause**: Device cannot reach the server

**Solutions**:
1. ✅ Verify backend is running: `npm start` in the server directory
2. ✅ Check IP address is correct: Run `ipconfig` and verify it's `192.168.1.33`
3. ✅ Check both are on same WiFi network
4. ✅ Check firewall settings - port 5001 may be blocked

### Issue: "JSON parse error"
**Cause**: Request body is not properly formatted

**Solution**: This is fixed in the latest update. The server now returns proper JSON error messages.

### Issue: Status 500 - Server Error
**Cause**: Backend encountered an error processing the request

**Solution**: 
1. Check server console logs for error details
2. Ensure MongoDB is running and connected
3. Check environment variables (.env file)

---

## Next Steps

1. **Run the test button** in your mobile app
2. **Share the result** - let me know what error you see (if any)
3. **I'll help debug** based on the exact error message

---

## Test Button Location

The test button is at the bottom of the **LoginScreen**:

```
┌─────────────────────────────┐
│  Biometric Attendance       │
│  Employee Login             │
│                             │
│  [Enter UID]                │
│  [Login]                    │
│                             │
│  Secure biometric...        │
│  🔧 Test Backend Connection │  ← Click this
└─────────────────────────────┘
```

---

## API Endpoint Details

**Endpoint**: `/api/auth/student/lookup`

**Method**: POST

**URL**: `http://192.168.1.33:5001/api/auth/student/lookup`

**Request Body**:
```json
{
  "uid": "8117882067"
}
```

**Successful Response** (HTTP 200):
```json
{
  "success": true,
  "student": {
    "id": "68c8df9a86993fb7f7408a3f",
    "fullName": "subham",
    "uid": "8117882067",
    "age": 25,
    "gender": "male",
    "organization": {
      "id": "68c8a93ddb3311885cdb983f",
      "name": "Anuvadini",
      "organizationType": "government_office"
    }
  }
}
```

**Error Response** (HTTP 400/404/500):
```json
{
  "success": false,
  "error": "error message"
}
```

---

## Status Summary

| Component | Status | Details |
|-----------|--------|---------|
| Backend Server | ✅ Running | Responding on 192.168.1.33:5001 |
| API Endpoint | ✅ Working | Returns valid JSON responses |
| Error Handling | ✅ Fixed | Returns JSON errors instead of HTML |
| Test Script | ✅ Created | PowerShell script for testing |
| Mobile Test Button | ✅ Added | "Test Backend Connection" button in LoginScreen |

---

**When you click the test button and see the result, let me know what it says!**
