# 🔐 HTTPS Setup Guide - Secure Backend Communication

## What Changed

The backend now uses **HTTPS (TLS/SSL)** instead of HTTP. This:
- ✅ Avoids Android's cleartext traffic restrictions
- ✅ Provides secure encryption
- ✅ Works seamlessly with iOS and Android
- ✅ Uses self-signed certificates for local development

---

## How to Setup

### Step 1: Generate SSL Certificates

**One time only** - generates `server.crt` and `server.key`:

```bash
cd server
node generate-certs.js
```

**Expected output:**
```
🔐 Generating self-signed SSL certificates...
✅ Certificates generated successfully!
   Key: D:\...\server\server.key
   Cert: D:\...\server\server.crt
```

### Step 2: Start the Backend Server

```bash
cd server
npm start
```

**Expected output:**
```
Connected to MongoDB
🔐 Server running on HTTPS://0.0.0.0:5001
🔐 Accessible from mobile devices on: https://192.168.1.33:5001
📝 Note: Using self-signed certificate - app will need to trust it
```

### Step 3: Update Mobile App (if you made local changes)

Rebuild the app to get the latest HTTPS URLs:

```bash
npx react-native run-android
```

---

## Test the Connection

### From PC (PowerShell)

```powershell
# Test HTTPS endpoint
curl.exe -k -X GET "https://192.168.1.33:5001/api/health"

# -k flag ignores self-signed certificate warning
```

**Expected:**
```json
{"status":"OK","message":"Server is running"}
```

### From Mobile App

1. Click **🔧 Test Backend Connection** button
2. Should show ✅ **PASSED**
3. If fails, check console logs for details

### From Mobile Browser

Open mobile browser and visit:
```
https://192.168.1.33:5001/api/health
```

Should show:
```json
{"status":"OK","message":"Server is running"}
```

---

## How It Works

### Backend (Node.js/Express)

The server now:
1. Checks for `server.crt` and `server.key` files
2. Loads the self-signed certificate
3. Creates HTTPS server with the certificate
4. Listens on port 5001 with HTTPS
5. Falls back to HTTP if certificates not found

**Code location:** `server/index.js` (lines ~212-240)

### Frontend (React Native)

The app:
1. Uses HTTPS URLs: `https://192.168.1.33:5001/api`
2. Android network security config trusts self-signed certs
3. iOS accepts self-signed certificates in development
4. No app rebuild needed for server changes

**Code location:** `src/services/api.ts` line 4

---

## Self-Signed Certificates Explained

### What are they?

Self-signed certificates are SSL/TLS certificates that are:
- ✅ Signed by themselves (not a Certificate Authority)
- ✅ Safe for development and testing
- ✅ Provide encryption like regular certificates
- ✅ Don't verify with a trusted authority

### Why use them?

- ✅ **No cost** - free to generate
- ✅ **Easy setup** - can be generated locally
- ✅ **Secure** - still encrypts traffic
- ❌ **Untrusted** - browsers/apps show warnings (we configured to ignore)

### Security Note

Self-signed certificates are **safe for local development** because:
1. You control both sides (server + client)
2. Only used on private network (192.168.1.x)
3. Never exposed to the internet
4. Development-only configuration

**Production:** Use proper certificates from Certificate Authority (Let's Encrypt, etc.)

---

## Troubleshooting

### Issue: "Certificate verification failed"

**Solution:** Already handled by network security config

```xml
<!-- Android accepts self-signed certs for 192.168.1.33 -->
<certificates src="user" />
```

### Issue: "HTTPS request failed"

**Check:**
1. Is server running? See "Server running on HTTPS://..." in console
2. Are certificates present? `ls server/server.*`
3. Firewall allows 5001? (already configured)

**Regenerate certificates:**
```bash
cd server
rm server.crt server.key
node generate-certs.js
npm start
```

### Issue: "Still getting network error after HTTPS setup"

**Possible causes:**
1. App not rebuilt after URL change
2. Old app APK still installed
3. Different WiFi network

**Solution:**
```bash
# Full rebuild
cd android
./gradlew clean
cd ..
npx react-native run-android
```

---

## API Endpoints

All endpoints now use HTTPS:

```
Base URL: https://192.168.1.33:5001/api

Examples:
- Health Check: https://192.168.1.33:5001/api/health
- Student Lookup: https://192.168.1.33:5001/api/auth/student/lookup
- Login: https://192.168.1.33:5001/api/auth/student/login
```

---

## Files Changed

| File | Change | Purpose |
|------|--------|---------|
| `server/index.js` | Added HTTPS support | Enables SSL/TLS on backend |
| `server/generate-certs.js` | NEW script | Generates self-signed certificates |
| `server/server.crt` | Certificate file | SSL certificate (generated) |
| `server/server.key` | Key file | SSL private key (generated) |
| `src/services/api.ts` | Changed to HTTPS | Uses https://... URLs |
| `src/services/certUtils.ts` | NEW utility | Certificate handling helpers |
| `android/app/src/main/res/xml/network_security_config.xml` | Updated config | Trusts self-signed certs |
| `src/LoginScreen.tsx` | Updated test URL | Uses HTTPS for testing |

---

## Summary

✅ **Backend:** Runs on HTTPS with self-signed certificate  
✅ **Mobile App:** Configured to trust the certificate  
✅ **Connection:** Secure, encrypted local network communication  
✅ **No Code Changes:** Everything is pre-configured  

## Next Steps

1. **Start server:** `npm start` (in server directory)
2. **Open app:** Should automatically work
3. **Test:** Click test button, should show ✅ PASSED
4. **Login:** Try with UID 8117882067

---

**The app should now connect successfully via HTTPS! 🎉**

If you still see errors, check:
1. Console logs for specific error messages
2. Server is running with HTTPS message
3. Mobile on same WiFi network
