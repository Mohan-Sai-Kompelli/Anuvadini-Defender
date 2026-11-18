# Server Deployment Guide

## Option A — Railway (Permanent Cloud, Free Tier)

1. Go to https://railway.app → New Project → Deploy from GitHub repo
2. Select the repo, set **Root Directory** to `server/`
3. Add these Environment Variables in Railway dashboard:

```
MONGODB_URI=<your Atlas URI from .env>
JWT_SECRET=<your JWT secret>
JWT_EXPIRE=7d
NODE_ENV=production
FIREBASE_PROJECT_ID=biometric-deff2
FACE_VERIFY_MODE=enforce
FACE_VERIFY_FAIL_CLOSED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=tls
SMTP_USER=<your gmail>
SMTP_PASS=<your app password>
EMAIL_FROM_ADDRESS=<your gmail>
EMAIL_FROM_NAME=Anuvadini Attendance
```

4. Railway gives you a URL like: `https://your-app.up.railway.app`
5. In the mobile app → Settings → set host to that URL (no /api, no port)

---

## Option B — ngrok (Local Dev Tunnel, works without WiFi match)

Run this instead of `npm start`:
```
node start-tunnel.js
```

It will print:
```
✅  Tunnel URL: https://xxxx.ngrok-free.app
👉  Set this in app Settings → server host field
```

Then in the mobile app → Profile/Settings → Server Host → paste that URL.

> Note: Free ngrok URL changes on every restart. Use a paid ngrok account
> for a stable subdomain, or deploy to Railway for permanent URL.

---

## Option C — adb reverse (Android only, same machine)

```bash
adb reverse tcp:5001 tcp:5001
adb reverse tcp:50011 tcp:50011
```
Then set host in app: `http://localhost:5001`
Phone communicates through USB — no WiFi needed.
