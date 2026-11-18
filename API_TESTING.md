# API Testing Guide

## Student Lookup Endpoint

### Working ✅

The student lookup API is working correctly and returning valid JSON responses.

### Test Details

- **Endpoint:** `POST /api/auth/student/lookup`
- **Base URL:** `http://192.168.1.33:5001`
- **Request Body:** 
  ```json
  {
    "uid": "8117882067"
  }
  ```

### Test Student

- **UID:** `8117882067`
- **Name:** subham
- **Organization:** Anuvadini

### How to Test

#### Option 1: Using PowerShell (Windows)
```powershell
.\test-api.ps1
```

#### Option 2: Using curl (PowerShell)
```powershell
$body = @{ uid = "8117882067" } | ConvertTo-Json
curl.exe -X POST "http://192.168.1.33:5001/api/auth/student/lookup" `
  -H "Content-Type: application/json" `
  -d $body
```

#### Option 3: From React Native App
The frontend should work automatically. When you:
1. Enter the UID: `8117882067`
2. Click the "Login" button
3. You should see the employee info displayed

If you don't see it, check the console logs for errors.

### Expected Response

```json
{
  "success": true,
  "student": {
    "id": "68c8df9a86993fb7f7408a3f",
    "fullName": "subham",
    "uid": "8117882067",
    "age": 25,
    "gender": "male",
    "selectedBiometrics": {
      "face": true,
      "fingerprint": false,
      "iris": false,
      "palm": false,
      "voice": false
    },
    "hasActiveWFH": false,
    "currentWFHAssignment": null,
    "organization": {
      "id": "68c8a93ddb3311885cdb983f",
      "name": "Anuvadini",
      "organizationType": "government_office",
      "selectedBiometrics": {
        "face": true,
        "fingerprint": true,
        "iris": true,
        "palm": true,
        "voice": true
      },
      "location": {
        "latitude": 28.535175796017295,
        "longitude": 77.15519405371178
      },
      "address": {
        "street": "",
        "city": "",
        "state": "",
        "zipCode": "",
        "country": ""
      }
    }
  }
}
```

## Common Issues

### Issue: "[Preview unavailable]" in curl/REST client

**Cause:** The REST client (Postman/Insomnia) is showing a placeholder body instead of actual JSON.

**Fix:** Use proper JSON body format:
```json
{"uid": "8117882067"}
```

Not this:
```
[Preview unavailable]
```

### Issue: "Invalid JSON" error from server

**Cause:** The request body is not valid JSON.

**Fix:** Ensure:
1. The body is wrapped in curly braces `{}`
2. Property names are in quotes `"uid"`
3. String values are in quotes `"8117882067"`
4. Content-Type header is `application/json`

## Server Improvements Made

✅ Added JSON parsing error handler
✅ Added proper error middleware for API routes  
✅ Increased payload size limits (10MB)
✅ Improved logging in API service
✅ Better error messages in frontend

---

**Status:** API is working correctly. Frontend integration ready for testing.
