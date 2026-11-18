# 🚀 Quick Start - HTTPS Backend

## TL;DR - 3 Commands

```bash
# 1. Generate certificates (one time)
cd server && node generate-certs.js

# 2. Start the backend
npm start

# 3. Done! App should work
```

---

## Expected Output

### When running certificates script:
```
🔐 Generating self-signed SSL certificates...
✅ Certificates generated successfully!
   Key: D:\...\server\server.key
   Cert: D:\...\server\server.crt
```

### When starting server:
```
Connected to MongoDB
🔐 Server running on HTTPS://0.0.0.0:5001
🔐 Accessible from mobile devices on: https://192.168.1.33:5001
📝 Note: Using self-signed certificate - app will need to trust it
```

---

## Test It

### From Mobile App
1. Click **🔧 Test Backend Connection**
2. Should show ✅ **PASSED**

### From Mobile Browser
Open: `https://192.168.1.33:5001/api/health`

Should show:
```json
{"status":"OK","message":"Server is running"}
```

### From PC (PowerShell)
```powershell
curl.exe -k -X GET "https://192.168.1.33:5001/api/health"
```

---

## What's Different From Before?

| Before | After |
|--------|-------|
| `http://192.168.1.33:5001` | `https://192.168.1.33:5001` |
| Android blocked it | Android accepts it ✅ |
| HTTP (insecure) | HTTPS (encrypted) ✅ |
| Setup was complex | Setup is simple ✅ |

---

## Why This Works

✅ **HTTPS** = Encrypted traffic (no cleartext restrictions)  
✅ **Self-signed cert** = Free, local development  
✅ **Android trusts it** = Via network security config  
✅ **No app rebuild** = Already configured  

---

## Done!

Your backend is now running securely on:
```
https://192.168.1.33:5001
```

Just run the app and it should connect! 🎉
