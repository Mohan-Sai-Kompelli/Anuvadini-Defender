# ⚡ Quick Fix - Network Request Failed

## Problem
Mobile app shows: **"Network request failed"** when trying to login

## Root Cause
- Server was NOT accepting connections from mobile devices
- Windows Firewall blocking port 5001

## 🔧 Quick Fix (3 Steps)

### 1️⃣ Restart Backend Server
```bash
# Stop current server (Ctrl+C)
# Then:
cd server
npm start
```

**Look for this message:**
```
Server running on http://0.0.0.0:5001
Accessible from mobile devices on: http://192.168.1.33:5001
```

### 2️⃣ Open Windows Firewall for Port 5001
**Method A - GUI (Easiest)**
- Press `Windows + R` → type `wf.msc`
- Click "Inbound Rules" → "New Rule"
- Select "Port" → TCP → 5001 → Allow → Name it

**Method B - PowerShell (Run as Admin)**
```powershell
New-NetFirewallRule -DisplayName "Node.js Port 5001" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5001
```

### 3️⃣ Test from Mobile
- Click **🔧 Test Backend Connection** button in the app
- Should show ✅ **PASSED**

---

## ✅ Verify It Works

**From your PC, test this command:**
```powershell
curl.exe -X POST "http://192.168.1.33:5001/api/auth/student/lookup" `
  -H "Content-Type: application/json" `
  -d '{"uid":"8117882067"}'
```

**Should return:**
```json
{"success":true,"student":{"fullName":"subham",...}}
```

---

## 📱 From Mobile App

1. Make sure mobile is on **same WiFi** as PC
2. Open app → Click test button
3. Should see ✅ **SUCCESS**

---

## 🆘 Still Not Working?

Check:
- ✅ Server running? (see "0.0.0.0:5001" in console)
- ✅ Firewall rule added? (check `wf.msc`)
- ✅ Same network? (both on 192.168.1.x)
- ✅ Mobile WiFi enabled? (not mobile data)

If still stuck, tell me:
1. What error does test button show?
2. What's your PC IP? (ipconfig)
3. What's mobile IP?

---

## Files Changed
- ✅ `server/index.js` - Fixed server binding
- ✅ `MOBILE_NETWORK_SETUP.md` - Detailed guide
- ✅ `src/LoginScreen.tsx` - Added test button

**That's it! Restart server + add firewall rule = Fixed! 🎉**
