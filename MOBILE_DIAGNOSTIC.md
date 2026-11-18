# Mobile Connectivity Diagnostic Guide

## ✅ Backend Status
**Server is WORKING and REACHABLE on 192.168.1.33:5001**

```
curl http://192.168.1.33:5001/api/health
Response: {"status":"OK","message":"Server is running"}
```

---

## ❌ Mobile App Issue
Mobile app still gets "Network request failed"

---

## 🔍 Diagnostic Steps

### Step 1: Check Mobile Device IP Address

**Android:**
1. Open Settings
2. Go to WiFi
3. Long-press on your WiFi network
4. Tap "Manage network settings"
5. Look for "IP Address"

**iPhone:**
1. Open Settings
2. Go to Wi-Fi
3. Tap the info icon (ⓘ) next to your network
4. Look for "IPv4 Address"

**Expected:** Should start with `192.168.1.x` (like 192.168.1.100, 192.168.1.50, etc.)

### Step 2: Test Mobile Browser

Open your mobile device's web browser and test:

**Test URL 1: Health Check**
```
http://192.168.1.33:5001/api/health
```

**Expected Response:**
```json
{"status":"OK","message":"Server is running"}
```

**If it works in browser:** The issue is with the React Native app specifically

**If it DOESN'T work in browser:** Network connectivity issue

### Step 3: Check Device Settings

Mobile might have:
- ✅ Privacy settings restricting HTTP (security feature)
- ✅ Cleartext traffic disabled
- ✅ VPN enabled
- ✅ Proxy enabled
- ✅ Different WiFi network than expected

---

## 🔧 Possible Solutions

### If Browser Works But App Doesn't

**React Native Cleartext Traffic Issue**

React Native on Android might block HTTP (non-HTTPS) traffic for security reasons.

**Fix for Android:**
Create/update `android/app/src/main/AndroidManifest.xml`:

```xml
<application
    android:usesCleartextTraffic="true"
    ...>
</application>
```

Or create `android/app/src/main/res/xml/network_security_config.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="true">192.168.1.33</domain>
  </domain-config>
</network-security-config>
```

Then add to `AndroidManifest.xml`:
```xml
android:networkSecurityConfig="@xml/network_security_config"
```

### If Browser Doesn't Work Either

**Network Problem:**
1. Both devices must be on same WiFi
2. WiFi shouldn't have isolation enabled
3. Firewall shouldn't block 192.168.1.33:5001

**Check WiFi Settings:**
- Go to Windows WiFi settings
- Check network name (SSID)
- Make sure mobile is connected to SAME SSID

**Try connecting to a different WiFi:**
- Create a hotspot from your laptop
- Connect mobile to that hotspot
- This eliminates WiFi issues

---

## 📋 What to Tell Me

After running these diagnostics, tell me:

1. **Mobile IP address:** (from WiFi settings)
2. **Browser test result:** (does http://192.168.1.33:5001/api/health work in mobile browser?)
3. **WiFi network name:** (both devices on same SSID?)
4. **Error message from app:** (exact text from the alert)
5. **Console logs:** (anything in React Native console?)

---

## 🎯 Common Issues & Fixes

| Issue | Symptom | Fix |
|-------|---------|-----|
| Android Cleartext | App fails, browser works | Enable cleartext traffic config |
| Different WiFi | Both on different networks | Verify same SSID |
| WiFi Isolation | Can't reach any local IPs | Disable WiFi isolation in router |
| Firewall | App fails, browser works | Already checked - port is open |
| Wrong IP | Can't reach 192.168.1.33 | Verify PC IP with ipconfig |

---

## 🚀 Next Steps

1. **Check mobile IP address** (tell me what you see)
2. **Test in mobile browser** - does http://192.168.1.33:5001/api/health work?
3. **Share the result** - I'll help based on what you find

---

## Quick Reference

```
PC IP:              192.168.1.33
Backend Port:       5001
Test URL:           http://192.168.1.33:5001/api/health
Expected Response:  {"status":"OK","message":"Server is running"}
```

**Tell me:**
- Mobile IP?
- Browser test result?
- Any errors?
