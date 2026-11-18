# Deployment Guide - Attendance & Biometric System

## Prerequisites

### System Requirements
- **Node.js**: v16.0.0 or higher
- **MongoDB**: v4.4 or higher (local or Atlas)
- **React Native**: 0.68+
- **Python**: 3.8+ (for ML models)
- **RAM**: Minimum 4GB
- **Storage**: Minimum 10GB
- **Internet**: 10Mbps+

### Development Tools
- Git
- npm/yarn
- Android Studio + NDK (for React Native)
- Xcode (for iOS)
- VS Code or preferred IDE

---

## Backend Deployment

### 1. Environment Setup

**Create `.env` file:**

```bash
# Server Configuration
PORT=5001
NODE_ENV=production

# MongoDB
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/dbname?retryWrites=true&w=majority

# JWT
JWT_SECRET=your_super_secret_jwt_key_min_32_chars
JWT_EXPIRE=7d

# Email Service (optional)
SENDGRID_API_KEY=your_sendgrid_key
SENDGRID_FROM_EMAIL=noreply@yourcompany.com

# Firebase (for push notifications)
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY=your_private_key
FIREBASE_CLIENT_EMAIL=your_email

# AWS S3 (for image uploads)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_S3_BUCKET=your_bucket_name
AWS_S3_REGION=us-east-1

# Feature Flags
ENABLE_LIVENESS_CHALLENGE=true
ENABLE_CONSULTATION_LOGS=true
ENABLE_SHIFT_SCHEDULES=true
ENABLE_DUTY_MODE=true
ENABLE_APPROVAL_CHAIN=true

# Logging
LOG_LEVEL=info
```

### 2. MongoDB Setup

**Create Database:**

```bash
# Using MongoDB Atlas
1. Go to https://www.mongodb.com/cloud/atlas
2. Create a cluster
3. Create a database named "attendance_system"
4. Add IP whitelist (your server IP or 0.0.0.0)
5. Create database user
```

**Create Indexes:**

```javascript
// Run in MongoDB shell or Compass

// Attendance collection
db.attendances.createIndex({ "organization": 1, "timestamp": -1 })
db.attendances.createIndex({ "student": 1, "createdAt": -1 })

// Students collection
db.students.createIndex({ "organization": 1, "department": 1 })

// Organizations collection
db.organizations.createIndex({ "name": 1 })

// Shift schedules
db.shiftschedules.createIndex({ "organization": 1, "isActive": 1 })

// Consultation logs
db.consultationlogs.createIndex({ "student": 1, "createdAt": -1 })

// Duty locations
db.dutylocations.createIndex({ "organization": 1, "isActive": 1 })

// Leave requests
db.leaverequests.createIndex({ "student": 1, "createdAt": -1 })

// Approval chains
db.approvalchains.createIndex({ "organization": 1, "isActive": 1 })
```

### 3. Install Dependencies

```bash
cd server
npm install

# Install required packages
npm install pdfkit date-fns firebase-admin aws-sdk
```

### 4. Run Database Migrations

```bash
# Migration script example
node server/scripts/migrateOrgLocations.js

# Create initial admin user
node server/scripts/createAdminUser.js
```

### 5. Start Backend Server

```bash
# Development
npm run dev

# Production
npm start

# Output should show:
# Server running on port 5001
# Connected to MongoDB
```

### 6. Verify Backend

```bash
curl http://localhost:5001/api/health

# Expected response:
# {"status": "OK", "message": "Server is running"}
```

---

## Web Dashboard Deployment

### 1. Environment Setup

**Create `.env.production` in `client/`:**

```bash
REACT_APP_API_URL=https://your-api-domain.com/api
REACT_APP_ENV=production
REACT_APP_VERSION=1.0.0
```

### 2. Build Frontend

```bash
cd client
npm install
npm run build

# Output in `client/build/` folder
```

### 3. Deploy to Hosting

**Option A: Vercel (Recommended)**

```bash
npm install -g vercel
vercel
# Follow prompts to deploy
```

**Option B: Netlify**

```bash
npm install -g netlify-cli
netlify deploy --prod --dir=build
```

**Option C: AWS S3 + CloudFront**

```bash
# Upload build folder to S3
aws s3 sync build/ s3://your-bucket-name --delete

# Create CloudFront distribution
# Set S3 bucket as origin
# Set default root object to index.html
```

**Option D: Docker**

```bash
# Create Dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
RUN npm install -g serve
EXPOSE 3000
CMD ["serve", "-s", "build", "-l", "3000"]

# Build and run
docker build -t attendance-dashboard .
docker run -p 3000:3000 attendance-dashboard
```

---

## Mobile App Deployment

### 1. Build Configuration

**Android:**

```bash
cd src/android
# Update build.gradle with version and signing key
gradlew assembleRelease
# Output: app/release/app-release.apk
```

**iOS:**

```bash
cd src/ios
# Open in Xcode
# Product → Archive
# Distribute App
# Choose distribution method
```

### 2. Configuration

**`.env.production`:**

```bash
API_BASE_URL=https://your-api-domain.com/api
ENABLE_CONSOLE_LOGS=false
```

### 3. App Store Deployment

**Android (Google Play):**

```bash
1. Create Google Play developer account
2. Create app in Play Console
3. Fill app details, screenshots, description
4. Upload signed APK
5. Add release notes
6. Submit for review
```

**iOS (App Store):**

```bash
1. Create Apple Developer account
2. Create app in App Store Connect
3. Fill app details, screenshots, description
4. Upload IPA via Xcode or Transporter
5. Submit for review
```

---

## Docker Deployment

### 1. Docker Compose Setup

**Create `docker-compose.yml`:**

```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:5.0
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: password
    volumes:
      - mongo_data:/data/db

  backend:
    build: .
    ports:
      - "5001:5001"
    environment:
      MONGODB_URI: mongodb://<user>:<password>@mongodb:27017/attendance_system?authSource=admin
      JWT_SECRET: your_secret_key
    depends_on:
      - mongodb
    volumes:
      - ./uploads:/app/uploads

  frontend:
    build:
      context: ./client
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      REACT_APP_API_URL: http://backend:5001/api

volumes:
  mongo_data:
```

### 2. Deploy with Docker

```bash
# Build and start
docker-compose up -d

# Check logs
docker-compose logs -f backend

# Stop
docker-compose down
```

---

## Kubernetes Deployment

### 1. Create Kubernetes Manifests

**`k8s/backend-deployment.yaml`:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: attendance-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: attendance-backend
  template:
    metadata:
      labels:
        app: attendance-backend
    spec:
      containers:
      - name: backend
        image: your-registry/attendance-backend:1.0
        ports:
        - containerPort: 5001
        env:
        - name: MONGODB_URI
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: mongodb-uri
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: jwt-secret
              key: secret
        resources:
          requests:
            cpu: 250m
            memory: 512Mi
          limits:
            cpu: 500m
            memory: 1Gi
```

**`k8s/backend-service.yaml`:**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: attendance-backend
spec:
  type: LoadBalancer
  ports:
  - port: 5001
    targetPort: 5001
  selector:
    app: attendance-backend
```

### 2. Deploy to Kubernetes

```bash
# Create secrets
kubectl create secret generic db-credentials \
  --from-literal=mongodb-uri=$MONGODB_URI
kubectl create secret generic jwt-secret \
  --from-literal=secret=$JWT_SECRET

# Deploy
kubectl apply -f k8s/

# Check status
kubectl get pods
kubectl get services
```

---

## SSL/TLS Configuration

### 1. Let's Encrypt (Free)

```bash
# Using certbot
sudo apt-get install certbot

certbot certonly --standalone -d your-domain.com

# Auto-renew
sudo systemctl enable certbot.timer
```

### 2. Nginx Reverse Proxy

**`/etc/nginx/sites-available/attendance`:**

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location /api {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
```

---

## Monitoring & Logging

### 1. PM2 Process Manager

```bash
# Install PM2
npm install -g pm2

# Create ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'attendance-backend',
      script: './server/index.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
}

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 2. Logging with Winston

**Already configured in backend** - Logs go to:
- Console (development)
- File (production)
- Path: `./logs/`

### 3. Error Tracking (Sentry)

```bash
npm install @sentry/node

# In server/index.js:
const Sentry = require("@sentry/node");
Sentry.init({ dsn: process.env.SENTRY_DSN });
app.use(Sentry.Handlers.errorHandler());
```

---

## Backup & Recovery

### 1. MongoDB Backup

```bash
# Daily backup script
#!/bin/bash
BACKUP_DIR="/backups/mongodb"
DATE=$(date +%Y%m%d_%H%M%S)

mongodump --uri="$MONGODB_URI" \
  --out="$BACKUP_DIR/$DATE"

# Keep only last 7 days
find $BACKUP_DIR -type d -mtime +7 -exec rm -rf {} \;
```

### 2. S3 Backup

```bash
# Backup uploads to S3
aws s3 sync ./uploads s3://your-backup-bucket/uploads
```

---

## Health Checks

### 1. Backend Health

```bash
curl https://your-domain.com/api/health

# Response:
# {"status": "OK", "message": "Server is running"}
```

### 2. Database Health

```bash
# Check MongoDB connection
db.adminCommand("ping")
```

### 3. External Services

```bash
# Firebase
firebase projects list

# AWS S3
aws s3 ls
```

---

## Performance Optimization

### 1. Caching

```javascript
// Redis caching (optional)
npm install redis

// Cache attendance queries
const redis = require('redis');
const client = redis.createClient();
```

### 2. CDN Configuration

```bash
# CloudFront for static assets
# Configure origin: attendance-dashboard.s3.amazonaws.com
# Add behaviors for API requests → ELB
```

### 3. Database Optimization

```javascript
// Ensure indexes are created
db.attendance.createIndex({ "timestamp": -1 })
db.students.createIndex({ "organization": 1, "department": 1 })
```

---

## Security Checklist

- [ ] Change all default passwords
- [ ] Enable HTTPS/SSL
- [ ] Set CORS properly
- [ ] Enable JWT expiration
- [ ] Rate limiting enabled
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention (using Mongoose)
- [ ] XSS protection headers set
- [ ] CSRF tokens for forms
- [ ] Secure password hashing (bcrypt)
- [ ] Sensitive data encrypted
- [ ] Regular security updates
- [ ] Firewall configured
- [ ] VPN for admin access

---

## Troubleshooting

### Backend Won't Start

```bash
# Check Node version
node --version

# Check MongoDB connection
mongosh ""

# Check port availability
lsof -i :5001

# View logs
tail -f logs/error.log
```

### High Memory Usage

```bash
# Monitor memory
pm2 monit

# Increase Node heap
NODE_OPTIONS=--max-old-space-size=4096 npm start
```

### Database Connection Issues

```bash
# Verify MongoDB URI
echo $MONGODB_URI

# Test connection
node -e "const mongoose = require('mongoose'); mongoose.connect(process.env.MONGODB_URI).then(() => console.log('Connected')).catch(e => console.log('Error:', e.message))"
```

---

## Upgrade Process

### 1. Backup

```bash
# Backup database
mongodump --uri="$MONGODB_URI" --out=./backup_v1_0

# Backup uploads
cp -r uploads uploads_backup
```

### 2. Update Code

```bash
git pull origin main
npm install
npm run build
```

### 3. Database Migration

```bash
# Run migrations if any
node scripts/migrate.js
```

### 4. Restart Services

```bash
pm2 restart attendance-backend
pm2 restart attendance-frontend
```

### 5. Verify

```bash
curl https://your-domain.com/api/health
```

---

**Last Updated**: June 5, 2026
**Maintained by**: DevOps Team
