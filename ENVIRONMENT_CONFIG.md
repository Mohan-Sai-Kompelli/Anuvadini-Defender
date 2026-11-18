# Environment Configuration Guide

## Overview

This guide explains how to configure environment variables for development, staging, and production environments.

---

## Backend Environment (.env)

### Location
`server/.env`

### Template

```bash
# Application
NODE_ENV=development
PORT=5001
APP_NAME="Attendance Management System"
APP_VERSION=1.0.0

# Database
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/attendance_dev?retryWrites=true&w=majority
MONGODB_POOL_SIZE=10

# Authentication
JWT_SECRET=your-super-secret-key-min-32-characters-long-for-security
JWT_EXPIRY=7d
REFRESH_TOKEN_EXPIRY=30d

# CORS
CORS_ORIGIN=http://localhost:3000,http://localhost:19006

# File Upload
MAX_FILE_SIZE=5242880
UPLOAD_DIR=./uploads
ALLOWED_EXTENSIONS=jpg,jpeg,png,pdf

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-specific-password

# AWS S3 (for production file storage)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_BUCKET=attendance-bucket

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log
SENTRY_DSN=https://your-sentry-key@sentry.io/project-id

# Feature Flags
ENABLE_LIVENESS=false
ENABLE_CONSULTATION_LOGS=false
ENABLE_DUTY_MODE=false
ENABLE_APPROVAL_CHAIN=false
ENABLE_HOI_DASHBOARD=false

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Geolocation
GEOFENCE_RADIUS_METERS=100
LIVENESS_CHALLENGE_TTL=90
LIVENESS_TOKEN_TTL=300

# Miscellaneous
DEBUG=false
```

---

## Development Environment

### Setup

```bash
cd server
cp .env.example .env
```

### Sample .env for Development

```bash
NODE_ENV=development
PORT=5001
MONGODB_URI=mongodb://localhost:27017/attendance_dev
JWT_SECRET=dev-secret-key-12345678901234567890
CORS_ORIGIN=http://localhost:3000,http://localhost:19006
ENABLE_LIVENESS=true
ENABLE_CONSULTATION_LOGS=true
ENABLE_DUTY_MODE=true
ENABLE_APPROVAL_CHAIN=true
ENABLE_HOI_DASHBOARD=true
LOG_LEVEL=debug
DEBUG=true
```

### MongoDB Local Setup

```bash
# macOS
brew install mongodb-community
brew services start mongodb-community

# Ubuntu
sudo apt-get install -y mongodb
sudo systemctl start mongodb

# Windows (with MongoDB Community Edition installed)
mongod
```

**Verify**: `mongosh` → `db.adminCommand('ping')`

---

## Web Dashboard Environment (.env.local)

### Location
`client/.env.local`

### Template

```bash
# API
REACT_APP_API_URL=http://localhost:5001/api
REACT_APP_UPLOAD_URL=http://localhost:5001/uploads

# App Settings
REACT_APP_NAME=Attendance System
REACT_APP_VERSION=1.0.0
REACT_APP_ENV=development

# Feature Toggles (frontend mirrors backend)
REACT_APP_ENABLE_LIVENESS=true
REACT_APP_ENABLE_CONSULTATION=true
REACT_APP_ENABLE_DUTY_MODE=true
REACT_APP_ENABLE_APPROVAL_CHAIN=true
REACT_APP_ENABLE_HOI_DASHBOARD=true

# Analytics (optional)
REACT_APP_GOOGLE_ANALYTICS_ID=G-XXXXXXXXXX

# Maps (optional)
REACT_APP_GOOGLE_MAPS_API_KEY=your-api-key
```

### Development Setup

```bash
cd client
cp .env.example .env.local
npm start
```

Open `http://localhost:3000`

---

## Mobile App Environment

### Location
`src/.env` or hardcoded in `src/config.ts`

### Configuration File: `src/config.ts`

```typescript
export const API_URL = __DEV__ 
  ? 'http://192.168.x.x:5001/api'  // Change to your machine IP
  : 'https://api.production.com/api';

export const UPLOAD_URL = __DEV__
  ? 'http://192.168.x.x:5001/uploads'
  : 'https://api.production.com/uploads';

export const FEATURES = {
  enableLiveness: true,
  enableConsultation: true,
  enableDutyMode: true,
  enableApprovalChain: true
};

export const GEOLOCATION = {
  geofenceRadius: 100, // meters
  timeout: 10000,      // ms
  enableHighAccuracy: true
};
```

### React Native Metro Setup

```bash
cd src
npm install
npm start

# In another terminal:
npm run android
# or
npm run ios
```

---

## Staging Environment

### Backend .env

```bash
NODE_ENV=staging
PORT=5001

# MongoDB Atlas cluster
MONGODB_URI=mongodb+srv://<user>:<password>@stage-cluster.mongodb.net/attendance_staging?retryWrites=true&w=majority

# JWT (strong secret)
JWT_SECRET=stage-secret-key-32-chars-minimum-security
JWT_EXPIRY=7d

# CORS (staging URL)
CORS_ORIGIN=https://staging.app.com,https://app-staging.vercel.app

# AWS S3
AWS_REGION=us-east-1
AWS_S3_BUCKET=attendance-staging-bucket

# Logging
LOG_LEVEL=info
SENTRY_DSN=https://staging-sentry-key@sentry.io/project

# Feature Flags (full testing)
ENABLE_LIVENESS=true
ENABLE_CONSULTATION_LOGS=true
ENABLE_DUTY_MODE=true
ENABLE_APPROVAL_CHAIN=true
ENABLE_HOI_DASHBOARD=true
```

### Web Dashboard .env.local

```bash
REACT_APP_API_URL=https://staging-api.app.com/api
REACT_APP_ENV=staging
REACT_APP_ENABLE_LIVENESS=true
```

---

## Production Environment

### Backend .env (SECURE)

```bash
NODE_ENV=production
PORT=5001

# MongoDB Atlas (production cluster)
MONGODB_URI=mongodb+srv://<user>:<password>@prod-cluster.mongodb.net/attendance_prod?retryWrites=true&w=majority&ssl=true
MONGODB_POOL_SIZE=20

# JWT (generate new strong secret)
JWT_SECRET=generate-with-: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_EXPIRY=7d

# CORS (production domain only)
CORS_ORIGIN=https://app.yourdomain.com

# AWS S3 (production bucket)
AWS_REGION=us-east-1
AWS_S3_BUCKET=attendance-prod-bucket

# Email (SendGrid, Mailgun, or custom)
SMTP_HOST=smtp.sendgrid.net
SMTP_USER=apikey
SMTP_PASS=SG.your-sendgrid-key

# Logging (production)
LOG_LEVEL=warn
SENTRY_DSN=https://prod-sentry-key@sentry.io/project

# Feature Flags (stable features only)
ENABLE_LIVENESS=true
ENABLE_CONSULTATION_LOGS=true
ENABLE_DUTY_MODE=true
ENABLE_APPROVAL_CHAIN=true
ENABLE_HOI_DASHBOARD=true

# Rate Limiting (tighter in production)
RATE_LIMIT_MAX_REQUESTS=1000
RATE_LIMIT_WINDOW_MS=3600000

# Security
DEBUG=false
HELMET_ENABLED=true
```

**IMPORTANT**: Store in secure vault (not Git)
- **Option 1**: Use environment variable management service
- **Option 2**: Use `.env.prod` (add to `.gitignore`)
- **Option 3**: Use secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)

### Web Dashboard .env.production

```bash
REACT_APP_API_URL=https://api.yourdomain.com/api
REACT_APP_ENV=production
REACT_APP_ENABLE_LIVENESS=true
```

### Build Command

```bash
cd client
REACT_APP_API_URL=https://api.yourdomain.com/api npm run build
```

---

## Environment Variable Reference

### Core Variables

| Variable | Type | Required | Example | Notes |
|----------|------|----------|---------|-------|
| `NODE_ENV` | String | Yes | development\|staging\|production | Controls behavior |
| `PORT` | Number | Yes | 5001 | Server listen port |
| `MONGODB_URI` | String | Yes | mongodb+srv://... | Full connection string |
| `JWT_SECRET` | String | Yes | 32+ chars | Must be strong/unique |

### Database

| Variable | Type | Default | Notes |
|----------|------|---------|-------|
| `MONGODB_URI` | String | - | Use MongoDB Atlas for prod |
| `MONGODB_POOL_SIZE` | Number | 10 | Increase for high traffic |

### Authentication

| Variable | Type | Default | Notes |
|----------|------|---------|-------|
| `JWT_SECRET` | String | - | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `JWT_EXPIRY` | String | 7d | Standard: 7 days |
| `REFRESH_TOKEN_EXPIRY` | String | 30d | Standard: 30 days |

### CORS

| Variable | Type | Example | Notes |
|----------|------|---------|-------|
| `CORS_ORIGIN` | String | http://localhost:3000,https://app.com | Comma-separated origins |

### File Upload

| Variable | Type | Default | Notes |
|----------|------|---------|-------|
| `MAX_FILE_SIZE` | Number | 5242880 (5MB) | In bytes |
| `UPLOAD_DIR` | String | ./uploads | Local directory path |
| `ALLOWED_EXTENSIONS` | String | jpg,jpeg,png,pdf | Comma-separated |

### AWS S3

| Variable | Type | Required (Prod) | Notes |
|----------|------|-----------------|-------|
| `AWS_REGION` | String | Yes | us-east-1, ap-south-1, etc |
| `AWS_ACCESS_KEY_ID` | String | Yes | IAM user credentials |
| `AWS_SECRET_ACCESS_KEY` | String | Yes | Keep secure |
| `AWS_S3_BUCKET` | String | Yes | S3 bucket name |

### Feature Flags

| Variable | Type | Default | Notes |
|----------|------|---------|-------|
| `ENABLE_LIVENESS` | Boolean | false | Requires MediaPipe |
| `ENABLE_CONSULTATION_LOGS` | Boolean | false | New feature, test first |
| `ENABLE_DUTY_MODE` | Boolean | false | Health camps feature |
| `ENABLE_APPROVAL_CHAIN` | Boolean | false | Multi-step approvals |
| `ENABLE_HOI_DASHBOARD` | Boolean | false | Executive dashboard |

### Logging & Monitoring

| Variable | Type | Default | Notes |
|----------|------|---------|-------|
| `LOG_LEVEL` | String | info | debug, info, warn, error |
| `LOG_FILE` | String | ./logs/app.log | File path for logs |
| `SENTRY_DSN` | String | - | Error tracking service |

### Geolocation

| Variable | Type | Default | Notes |
|----------|------|---------|-------|
| `GEOFENCE_RADIUS_METERS` | Number | 100 | Org location radius |
| `LIVENESS_CHALLENGE_TTL` | Number | 90 | Seconds |
| `LIVENESS_TOKEN_TTL` | Number | 300 | Seconds (5 minutes) |

### Rate Limiting

| Variable | Type | Default | Notes |
|----------|------|---------|-------|
| `RATE_LIMIT_WINDOW_MS` | Number | 900000 (15 min) | Time window |
| `RATE_LIMIT_MAX_REQUESTS` | Number | 100 | Requests per window |

---

## Validation Checklist

Before deploying, verify all required variables:

```bash
# Backend validation
node -e "
const required = ['NODE_ENV', 'MONGODB_URI', 'JWT_SECRET', 'PORT'];
const missing = required.filter(v => !process.env[v]);
if (missing.length) {
  console.error('Missing variables:', missing);
  process.exit(1);
}
console.log('✓ All required variables set');
"
```

---

## Security Best Practices

1. **Never commit `.env` files to Git**:
   ```bash
   echo ".env" >> .gitignore
   echo ".env.local" >> .gitignore
   echo ".env.prod" >> .gitignore
   ```

2. **Use strong JWT secrets**:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. **Rotate secrets periodically** (every 90 days recommended)

4. **Use environment-specific values**:
   - Dev: localhost URLs, test database
   - Staging: staging domain, staging database
   - Prod: production domain, production database

5. **Secure credential storage**:
   - AWS: Use AWS Secrets Manager or Systems Manager Parameter Store
   - Azure: Use Azure Key Vault
   - On-premises: Use HashiCorp Vault
   - Docker: Use Docker Secrets

6. **Audit access** to environment variables

7. **Enable HTTPS in production** (redirect HTTP to HTTPS)

---

## Troubleshooting

### "Cannot connect to MongoDB"

```bash
# Check connection string format
# mongodb+srv:// requires DNS SRV records (MongoDB Atlas)
# mongodb:// is for local/self-hosted

# Test connection
mongosh "your_connection_string"
```

### "CORS error" when calling API

```bash
# Verify CORS_ORIGIN matches frontend URL
# Include protocol: https://, http://
# Wildcard (*) only for development
CORS_ORIGIN=http://localhost:3000,https://app.com
```

### "JWT token invalid"

```bash
# Verify JWT_SECRET is same across instances
# Check token expiry (JWT_EXPIRY=7d)
# Token must be Bearer token in header: Authorization: Bearer <token>
```

### "File upload fails"

```bash
# Check MAX_FILE_SIZE (default 5MB)
# Verify UPLOAD_DIR exists and has write permissions
# For S3: verify AWS credentials and bucket policy
```

---

## Performance Tuning

### For High Traffic

```bash
# Increase database pool
MONGODB_POOL_SIZE=30

# Increase rate limit
RATE_LIMIT_MAX_REQUESTS=5000
RATE_LIMIT_WINDOW_MS=3600000

# Enable compression
COMPRESSION_ENABLED=true

# Cache settings
CACHE_TTL=600
CACHE_MAX_SIZE=1000
```

### For Memory-Constrained Environments

```bash
# Reduce pool size
MONGODB_POOL_SIZE=5

# Limit rate
RATE_LIMIT_MAX_REQUESTS=100

# Disable debug mode
DEBUG=false
LOG_LEVEL=error
```

---

## Multi-Organization Setup

If supporting multiple organizations with different configs:

```bash
# Option 1: Per-org database
ORG_1_MONGODB_URI=mongodb+srv://...
ORG_2_MONGODB_URI=mongodb+srv://...

# Option 2: Separate deployments
# Deploy separate instances with different .env files

# Option 3: Runtime configuration (from database)
# Store org config in database, load at runtime
```

---

**Last Updated**: June 5, 2026  
**Version**: 1.0
