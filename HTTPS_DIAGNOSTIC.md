# 🔍 HTTPS Diagnostic - Troubleshooting Connection Issues

## Server Status

✅ **Server is running on HTTPS**
- Port: 5001
- Protocol: HTTPS (secure)
- Test URL works: `https://192.168.1.33:5001/api/health`
- Response: `{"status":"OK","message":"Server is running"}`

✅ **Certificates exist**
- Key: `server/server.key`
- Cert: `server/server.crt`

---

## Mobile App Issue

**Error:** `TypeError: Network request failed` when testing HTTPS connection

**Why this happens:**
1. App tries to connect to HTTPS endpoint
2. Self-signed certificate is presented by server
3. Android rejects it because:
   - ❌ Certificate is not from a trusted Certificate Authority
   - ❌ Network security config not applied to new build
   - ❌ Old app APK still installed

---

## Solution

### Step 1: Verify Network Security Config is in Place

Check file exists: `android/app/src/main/res/xml/network_security_config.xml`

The file should contain:
```xml
<domain-config cleartextTrafficPermitted="false">
  <domain includeSubdomains="true">192.168.1.33</domain>
  <trust-anchors>
    <certificates src="system" />
    <certificates src="user" />
  </trust-anchors>
</domain-config>
```

This tells Android to **trust the self-signed certificate** for IP 192.168.1.33

### Step 2: Rebuild Android App

**CRITICAL:** The old APK doesn't have this config. You MUST rebuild.

```bash
# Option 1: Quick rebuild and install
npx react-native run-android

# Option 2: Full clean build
cd android
./gradlew clean
cd ..
npx react-native run-android
```

### Step 3: Uninstall Old App (Important!)

The old app doesn't trust the certificate. Uninstall it first:

```bash
adb uninstall com.NATSAttendance.myapp
# Then install new version
npx react-native run-android
```

### Step 4: Test Again

After app rebuilds:
1. Click test button
2. Should show ✅ **PASSED**

---

## Why Self-Signed Certificate Fails Without Config

```
┌─────────────────────────────────────┐
│   Mobile App Tries HTTPS Request    │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   Server Returns Self-Signed Cert   │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   Android Checks: Is it trusted?    │
└─────────────────────────────────────┘
              ↓
    ❌ NOT in trusted CA list
    ❌ NO network security config
              ↓
┌─────────────────────────────────────┐
│   REJECT - Network request failed   │
└─────────────────────────────────────┘
```

**With network security config:**

```
┌─────────────────────────────────────┐
│   Mobile App Tries HTTPS Request    │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   Server Returns Self-Signed Cert   │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ Android Checks network_security_config│
│   ✅ 192.168.1.33? YES              │
│   ✅ Trust user certs? YES          │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   ACCEPT - Connection successful    │
└─────────────────────────────────────┘
```

---

## What You Need to Do

1. **Rebuild the app:**
   ```bash
   npx react-native run-android
   ```

2. **Let it complete** - Takes 2-3 minutes

3. **Test connection** - Click test button

4. **Should work** - If not, check console logs for specific errors

---

## If Still Failing

After rebuild, if still getting error:

**Check 1: Is new APK installed?**
```bash
adb shell pm list packages | grep NATSAttendance
```

Should show: `com.NATSAttendance.myapp`

**Check 2: Does AndroidManifest have network config reference?**
```bash
grep -r "networkSecurityConfig" android/app/src/main/
```

Should show: `android:networkSecurityConfig="@xml/network_security_config"`

**Check 3: Mobile still on same WiFi?**
- Check WiFi network name on mobile
- Verify it matches your PC's WiFi

**Check 4: Server still running?**
```bash
netstat -ano | findstr ":5001"
```

Should show LISTENING

---

## Quick Checklist

- [ ] Certificates exist (`server/server.crt` and `server.key`)
- [ ] Network security config exists (`android/app/src/main/res/xml/network_security_config.xml`)
- [ ] AndroidManifest references network config (`android:networkSecurityConfig`)
- [ ] Ran `npx react-native run-android`
- [ ] App rebuilt and installed
- [ ] Mobile on same WiFi network
- [ ] Server running with HTTPS
- [ ] Clicked test button after rebuild

---

## Expected Logs

**Server console (when running):**
```
🔐 Server running on HTTPS://0.0.0.0:5001
🔐 Accessible from mobile devices on: https://192.168.1.33:5001
```

**App console (when test succeeds):**
```
🔧 [TEST] Got response!
🔧 [TEST] Response status: 200
🔧 [TEST] Response data: {"status":"OK","message":"Server is running"}
```

---

## Common Causes

| Cause | Solution |
|-------|----------|
| Old APK still installed | Uninstall and rebuild |
| Network config missing | File should exist in xml/ folder |
| Config not applied | AndroidManifest must reference it |
| Different WiFi | Both on same network? |
| Server not HTTPS | Check server console has HTTPS message |
| Certificates missing | Run `node generate-certs.js` |

---

**The key is: App must be rebuilt to use new network security config!**
