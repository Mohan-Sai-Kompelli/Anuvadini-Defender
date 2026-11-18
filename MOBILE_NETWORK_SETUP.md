# Mobile Network Setup Guide

## Problem
Your mobile app is getting **"Network request failed"** when trying to reach `192.168.1.33:5001`

## Root Cause
The backend server was NOT accepting connections from other devices on the network.

## Solution
I've fixed the server binding. Now follow these steps:

---

## ✅ Step 1: Restart the Backend Server

### On Windows
1. **Stop the current server** (press `Ctrl+C` in the Node.js terminal)
2. **Restart it**:
   ```bash
   cd server
   npm start
   ```

You should see:
```
Connected to MongoDB
Server running on http://0.0.0.0:5001
Accessible from mobile devices on: http://192.168.1.33:5001
```

### Verify Server is Running
```powershell
netstat -ano | findstr ":5001"
```

Should show:
```
TCP    0.0.0.0:5001    0.0.0.0:0    LISTENING    [PID]
```

---

## ✅ Step 2: Configure Windows Firewall (IMPORTANT!)

The firewall might be blocking port 5001. You need to add a rule.

### Option A: Using Windows GUI (Easiest)
1. Press `Windows + R` and type `wf.msc`
2. Click "Inbound Rules" (left panel)
3. Click "New Rule" (right panel)
4. Select "Port" → Next
5. Select "TCP" → Enter Port: `5001` → Next
6. Select "Allow the connection" → Next
7. Keep all checkboxes checked (Domain, Private, Public) → Next
8. Name: "Node.js Backend 5001" → Finish

### Option B: Using PowerShell (Admin Required)
Open PowerShell as Administrator and run:

```powershell
New-NetFirewallRule -DisplayName "Node.js Backend Port 5001" `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort 5001
```

### Verify Firewall Rule
```powershell
Get-NetFirewallRule -DisplayName "*5001*"
```

---

## ✅ Step 3: Verify Network Connectivity

### From Your PC (should work)
```powershell
curl.exe -X POST "http://192.168.1.33:5001/api/auth/student/lookup" `
  -H "Content-Type: application/json" `
  -d '{"uid":"8117882067"}'
```

Should return:
```json
{"success":true,"student":{...}}
```

### From Mobile App
1. Make sure your mobile is on the **same WiFi** as your PC
2. Open the app
3. Click **🔧 Test Backend Connection** button
4. Result should now be ✅ **PASSED**

---

## ✅ Step 4: Verify Mobile is on Same Network

### Check Your PC's IP
```powershell
ipconfig
```
Look for `IPv4 Address` in the WiFi section. Should be `192.168.1.x`

### Check Mobile's IP
- **Android**: Settings → WiFi → (Long-press network) → IP address
- **iPhone**: Settings → WiFi → (Click 'i' icon) → IPv4 Address

**Both should start with `192.168.1`**

---

## 🔍 Troubleshooting

### Issue: Still getting "Network request failed"

**Check 1: Is server running?**
```powershell
netstat -ano | findstr ":5001"
```
Should show LISTENING

**Check 2: Is mobile on same network?**
```bash
# From mobile, run this in browser:
http://192.168.1.33:5001/api/health
```
Should show JSON response

**Check 3: Is firewall blocking?**
- Try disabling firewall temporarily (for testing only)
- Or check Windows Event Viewer for blocked connections
- Or add the firewall rule from Step 2 above

**Check 4: Is there a VPN?**
- Some VPNs prevent local network access
- Try disconnecting VPN temporarily

---

## 📋 Network Checklist

- [ ] Backend server restarted (`npm start`)
- [ ] Server shows "Accessible from mobile devices on: http://192.168.1.33:5001"
- [ ] Windows Firewall rule added for port 5001
- [ ] Mobile is on same WiFi network as PC
- [ ] Mobile IP starts with 192.168.1.x
- [ ] PC IP starts with 192.168.1.x
- [ ] Test button shows ✅ PASSED

---

## 🎯 Expected Results

### Before Fix
```
❌ Network request failed
Cannot connect to http://192.168.1.33:5001
```

### After Fix & Firewall Config
```
✅ Connection Test PASSED
Backend is reachable and responding!
Status: 200
```

---

## 📞 If Still Not Working

Tell me:
1. What does the test button show now? (exact error message)
2. What IP address does your PC show? (`ipconfig`)
3. What IP address does your mobile show?
4. Are both on the same WiFi network?
5. Server console - does it show "0.0.0.0:5001"?

---

## Server Configuration

**Old (broken):**
```javascript
server.listen(PORT); // Only localhost
```

**New (fixed):**
```javascript
server.listen(PORT, '0.0.0.0'); // All interfaces
```

This change has been committed to the code. Just restart the server!

---

## Quick Reference

| Component | Value | Status |
|-----------|-------|--------|
| Backend IP | 192.168.1.33 | ✅ Correct |
| Backend Port | 5001 | ✅ Open |
| Server Binding | 0.0.0.0:5001 | ✅ Fixed |
| Firewall Rule | Port 5001 Allow | ⏳ Need to add |
| Mobile WiFi | Same as PC | ⏳ Verify |

---

**After completing all steps above, your mobile app should connect successfully!**

If not, share the exact error message and I'll help further.
