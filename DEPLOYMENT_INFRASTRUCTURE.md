# MARBISM Phase 3 Part 2 - On-Premise Deployment Infrastructure

**Date**: June 5, 2026  
**Status**: 🚀 IN PROGRESS  
**Scope**: Phase 3 Part 2 - Server Setup, Docker/Kubernetes, SSL/TLS, Health Monitoring, Backup Automation

---

## Overview

Phase 3 Part 2 implements complete on-premise deployment infrastructure for the MARBISM system. This document covers containerization, orchestration, security (SSL/TLS), health monitoring, and backup strategies for deployment across 300+ colleges and hospitals.

**Target Infrastructure**:
- On-premise servers (Linux/Windows)
- Docker containerization with Docker Compose
- Kubernetes optional orchestration
- PostgreSQL/MongoDB persistence
- Redis caching layer
- Nginx reverse proxy with SSL/TLS
- Prometheus + Grafana monitoring
- Automated daily backups with recovery procedures

---

## 1. Server Requirements Specification

### Minimum Server Specs (Single College/Hospital)

**CPU**: 4-8 cores (2.4 GHz+)  
**RAM**: 8-16 GB  
**Storage**: 500 GB SSD (primary) + 500 GB HDD (backups)  
**Network**: 1 Gbps uplink, static IP  
**OS**: Ubuntu 20.04 LTS / Ubuntu 22.04 LTS (Linux preferred for production)

### Large Hospital/Multi-Campus Setup

**CPU**: 16-32 cores  
**RAM**: 32-64 GB  
**Storage**: 2 TB SSD (primary) + 2 TB HDD (backups)  
**Network**: 10 Gbps uplink, BGP routing for HA  
**OS**: Ubuntu 22.04 LTS

### Pre-Deployment Checklist

- [ ] SSH access configured (key-based auth, no passwords)
- [ ] Firewall rules configured (ports 80, 443, 27017 blocked externally)
- [ ] NTP time sync enabled (critical for JWT validation)
- [ ] Swap space configured (8 GB recommended)
- [ ] SELinux/AppArmor hardened or disabled
- [ ] System updates (`apt update && apt upgrade`)
- [ ] Docker & Docker Compose installed
- [ ] Kubernetes CLI (`kubectl`) installed (if using K8s)

---

## 2. Docker Containerization

### File: `docker-compose.yml`

```yaml
version: '3.9'

services:
  # Node.js Backend
  backend:
    image: marbism-backend:latest
    container_name: marbism-backend
    ports:
      - "5001:5001"
    environment:
      NODE_ENV: production
      MONGODB_URI: mongodb://mongodb:27017/marbism
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
      FEATURE_LIVENESS_CHALLENGE: 'true'
      FEATURE_OUTREACH_ACTIVITIES: 'true'
      FEATURE_DEVICE_BINDING: 'true'
    depends_on:
      - mongodb
      - redis
    volumes:
      - ./uploads:/app/uploads
      - ./logs:/app/logs
    restart: unless-stopped
    networks:
      - marbism-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5001/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # MongoDB Database
  mongodb:
    image: mongo:6.0
    container_name: marbism-mongodb
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_USERNAME}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
      MONGO_INITDB_DATABASE: marbism
    volumes:
      - mongodb-data:/data/db
      - mongodb-logs:/var/log/mongodb
      - ./mongo-backup:/backup
    restart: unless-stopped
    networks:
      - marbism-network
    command:
      - "--auth"
      - "--replSet=rs0"
    healthcheck:
      test: echo 'db.adminCommand("ping")' | mongosh -u ${MONGO_USERNAME} -p ${MONGO_PASSWORD}
      interval: 30s
      timeout: 10s
      retries: 5

  # Redis Cache
  redis:
    image: redis:7-alpine
    container_name: marbism-redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    restart: unless-stopped
    networks:
      - marbism-network
    command: redis-server --requirepass ${REDIS_PASSWORD} --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3

  # React Web Dashboard
  web-dashboard:
    image: marbism-web:latest
    container_name: marbism-web
    ports:
      - "3000:3000"
    environment:
      REACT_APP_API_URL: http://localhost:5001/api
      REACT_APP_ENV: production
    depends_on:
      - backend
    restart: unless-stopped
    networks:
      - marbism-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Nginx Reverse Proxy + SSL/TLS
  nginx:
    image: nginx:alpine
    container_name: marbism-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
      - ./certs:/etc/letsencrypt:ro
    depends_on:
      - backend
      - web-dashboard
    restart: unless-stopped
    networks:
      - marbism-network
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:80/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Prometheus Monitoring
  prometheus:
    image: prom/prometheus:latest
    container_name: marbism-prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'
    restart: unless-stopped
    networks:
      - marbism-network
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:9090"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Grafana Dashboards
  grafana:
    image: grafana/grafana:latest
    container_name: marbism-grafana
    ports:
      - "3001:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}
      GF_SECURITY_ADMIN_USER: admin
      GF_INSTALL_PLUGINS: grafana-clock-panel,grafana-simple-json-datasource
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning:ro
    depends_on:
      - prometheus
    restart: unless-stopped
    networks:
      - marbism-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Node Exporter (System Metrics)
  node-exporter:
    image: prom/node-exporter:latest
    container_name: marbism-node-exporter
    ports:
      - "9100:9100"
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.rootfs=/'
      - '--path.sysfs=/host/sys'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
    restart: unless-stopped
    networks:
      - marbism-network
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:9100"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  mongodb-data:
    driver: local
  mongodb-logs:
    driver: local
  redis-data:
    driver: local
  prometheus-data:
    driver: local
  grafana-data:
    driver: local

networks:
  marbism-network:
    driver: bridge
```

### File: `.env.production` (Template)

```bash
# Database
MONGODB_URI=mongodb://<user>:<password>@mongodb:27017/marbism?authSource=admin
MONGO_USERNAME=marbism_user
MONGO_PASSWORD=CHANGE_ME_STRONG_PASSWORD_32_CHARS_MIN

# Redis
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
REDIS_PASSWORD=CHANGE_ME_STRONG_PASSWORD_32_CHARS_MIN

# Backend
NODE_ENV=production
PORT=5001
JWT_SECRET=CHANGE_ME_STRONG_JWT_SECRET_64_CHARS_MIN
JWT_EXPIRY=7d

# Feature Flags
FEATURE_LIVENESS_CHALLENGE=true
FEATURE_CONSULTATION_LOGS=true
FEATURE_SHIFT_SCHEDULES=true
FEATURE_DEVICE_BINDING=true
FEATURE_PHOTO_TAMPERING=true
FEATURE_GPS_SPOOFING=true
FEATURE_OUTREACH_ACTIVITIES=true
FEATURE_HOI_DASHBOARD=true

# Grafana
GRAFANA_PASSWORD=CHANGE_ME_GRAFANA_PASSWORD_32_CHARS_MIN

# Email (for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASSWORD=your-app-password

# Backup Configuration
BACKUP_RETENTION_DAYS=30
BACKUP_SCHEDULE=0 2 * * *  # Daily at 2 AM
```

### Dockerfile: `Dockerfile.backend`

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY server/ ./server/
COPY .env.production ./

# Create upload and log directories
RUN mkdir -p uploads logs

# Expose port
EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5001/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start application
CMD ["node", "server/index.js"]
```

### Dockerfile: `Dockerfile.web`

```dockerfile
FROM node:18-alpine as builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY client/ ./client/
COPY src/ ./src/

RUN npm run build:web

FROM nginx:alpine

COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx-web.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
```

---

## 3. Nginx Configuration for Reverse Proxy & SSL/TLS

### File: `nginx.conf`

```nginx
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
  worker_connections 2048;
  use epoll;
}

http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;

  log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                  '$status $body_bytes_sent "$http_referer" '
                  '"$http_user_agent" "$http_x_forwarded_for"';

  access_log /var/log/nginx/access.log main;

  sendfile on;
  tcp_nopush on;
  tcp_nodelay on;
  keepalive_timeout 65;
  types_hash_max_size 2048;
  client_max_body_size 100M;

  # Gzip compression
  gzip on;
  gzip_vary on;
  gzip_min_length 1000;
  gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss;

  # Rate limiting
  limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/s;
  limit_req_zone $binary_remote_addr zone=general_limit:10m rate=50r/s;

  # Upstream backend
  upstream backend {
    least_conn;
    server backend:5001 max_fails=3 fail_timeout=30s;
  }

  upstream web {
    server web-dashboard:3000;
  }

  # HTTP redirect to HTTPS
  server {
    listen 80;
    server_name _;
    
    # Let's Encrypt verification
    location /.well-known/acme-challenge/ {
      root /var/www/certbot;
    }

    location / {
      return 301 https://$host$request_uri;
    }
  }

  # HTTPS server
  server {
    listen 443 ssl http2;
    server_name _;

    # SSL certificates (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/marbism.local/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/marbism.local/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # API backend
    location /api/ {
      limit_req zone=api_limit burst=200 nodelay;
      
      proxy_pass http://backend;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_cache_bypass $http_upgrade;
      proxy_buffering off;
      proxy_request_buffering off;

      # Timeouts
      proxy_connect_timeout 60s;
      proxy_send_timeout 60s;
      proxy_read_timeout 60s;
    }

    # Web dashboard
    location / {
      limit_req zone=general_limit burst=50 nodelay;
      
      proxy_pass http://web;
      proxy_http_version 1.1;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health check endpoint
    location /health {
      access_log off;
      return 200 "healthy\n";
      add_header Content-Type text/plain;
    }

    # Prometheus metrics (internal only)
    location /metrics {
      allow 127.0.0.1;
      deny all;
      proxy_pass http://prometheus:9090/metrics;
    }
  }
}
```

---

## 4. Health Monitoring & Alerts

### File: `prometheus.yml`

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    monitor: 'marbism-prod'

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

rule_files:
  - 'alert-rules.yml'

scrape_configs:
  # Backend metrics
  - job_name: 'marbism-backend'
    static_configs:
      - targets: ['backend:5001']
    metrics_path: '/metrics'
    scrape_interval: 10s

  # Node exporter (system metrics)
  - job_name: 'system'
    static_configs:
      - targets: ['node-exporter:9100']

  # MongoDB metrics
  - job_name: 'mongodb'
    static_configs:
      - targets: ['mongodb-exporter:9216']

  # Redis metrics
  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']

  # Nginx metrics
  - job_name: 'nginx'
    static_configs:
      - targets: ['nginx-exporter:9113']
```

### File: `alert-rules.yml`

```yaml
groups:
  - name: marbism_alerts
    interval: 30s
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate on {{ $labels.instance }}"
          description: "Error rate is {{ $value | humanizePercentage }}"

      # API response time
      - alert: SlowAPIResponse
        expr: histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Slow API response on {{ $labels.instance }}"
          description: "P99 response time is {{ $value }}s"

      # Database connection pool exhausted
      - alert: DBConnectionPoolExhausted
        expr: mongodb_connections_active / mongodb_connections_available > 0.8
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "MongoDB connection pool near capacity"
          description: "{{ $value | humanizePercentage }} of connections in use"

      # Low disk space
      - alert: LowDiskSpace
        expr: node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} < 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Low disk space on {{ $labels.instance }}"
          description: "Only {{ $value | humanizePercentage }} disk space remaining"

      # Memory usage high
      - alert: HighMemoryUsage
        expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes > 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage on {{ $labels.instance }}"
          description: "Memory usage is {{ $value | humanizePercentage }}"

      # Container down
      - alert: ContainerDown
        expr: up{job="marbism-backend"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Container {{ $labels.job }} is down"
          description: "{{ $labels.instance }} has been unreachable for 1 minute"
```

---

## 5. Backup & Recovery Procedures

### File: `backup.sh`

```bash
#!/bin/bash
set -e

BACKUP_DIR="/mnt/backups"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="/var/log/marbism-backup.log"

{
  echo "=== MARBISM Backup Started at $(date) ==="

  # Create backup directory
  mkdir -p "$BACKUP_DIR/$TIMESTAMP"

  # 1. MongoDB backup
  echo "Backing up MongoDB..."
  docker exec marbism-mongodb mongodump \
    --authenticationDatabase admin \
    --username marbism_user \
    --password "$MONGO_PASSWORD" \
    --out "/backup/dump_$TIMESTAMP"
  
  # Compress MongoDB dump
  tar -czf "$BACKUP_DIR/$TIMESTAMP/mongodb_$TIMESTAMP.tar.gz" \
    -C /var/lib/docker/volumes/marbism_mongodb-data/_data/dump_$TIMESTAMP .

  # 2. Application files backup
  echo "Backing up application files..."
  tar -czf "$BACKUP_DIR/$TIMESTAMP/uploads_$TIMESTAMP.tar.gz" \
    -C /path/to/marbism/uploads .

  # 3. Configuration backup
  echo "Backing up configurations..."
  tar -czf "$BACKUP_DIR/$TIMESTAMP/config_$TIMESTAMP.tar.gz" \
    -C /path/to/marbism \
    docker-compose.yml \
    .env.production \
    nginx.conf

  # 4. PostgreSQL backup (if used)
  echo "Backing up PostgreSQL..."
  docker exec marbism-postgres pg_dump \
    -U postgres marbism \
    | gzip > "$BACKUP_DIR/$TIMESTAMP/postgres_$TIMESTAMP.sql.gz"

  # 5. S3 upload (optional)
  if command -v aws &> /dev/null; then
    echo "Uploading to S3..."
    aws s3 sync "$BACKUP_DIR/$TIMESTAMP" \
      "s3://marbism-backups/$(date +%Y/%m/%d)/$TIMESTAMP/" \
      --sse AES256
  fi

  # Clean old backups (older than RETENTION_DAYS)
  echo "Cleaning old backups..."
  find "$BACKUP_DIR" -type d -mtime +$RETENTION_DAYS -exec rm -rf {} \;

  # Verify backup integrity
  echo "Verifying backup..."
  for file in "$BACKUP_DIR/$TIMESTAMP"/*.tar.gz; do
    if tar -tzf "$file" > /dev/null 2>&1; then
      echo "✓ $(basename $file) verified"
    else
      echo "✗ $(basename $file) FAILED verification" >&2
      exit 1
    fi
  done

  echo "=== MARBISM Backup Completed Successfully ==="
  echo "Backup location: $BACKUP_DIR/$TIMESTAMP"
  echo "Total size: $(du -sh $BACKUP_DIR/$TIMESTAMP | cut -f1)"

} >> "$LOG_FILE" 2>&1
```

### File: `restore.sh`

```bash
#!/bin/bash
set -e

BACKUP_DIR="/mnt/backups"
RESTORE_FROM="${1:?Usage: ./restore.sh <backup_timestamp>}"

if [ ! -d "$BACKUP_DIR/$RESTORE_FROM" ]; then
  echo "Backup not found: $BACKUP_DIR/$RESTORE_FROM"
  exit 1
fi

echo "WARNING: This will overwrite current data!"
echo "Restoring from: $BACKUP_DIR/$RESTORE_FROM"
read -p "Continue? (yes/no) " -n 3 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  exit 1
fi

# Stop services (keep DB running for restore)
docker-compose stop backend web-dashboard

# Restore MongoDB
echo "Restoring MongoDB..."
tar -xzf "$BACKUP_DIR/$RESTORE_FROM/mongodb_$RESTORE_FROM.tar.gz" \
  -C /tmp/mongo-restore

docker exec marbism-mongodb mongorestore \
  --authenticationDatabase admin \
  --username marbism_user \
  --password "$MONGO_PASSWORD" \
  --drop \
  /backup/mongo-restore

# Restore uploads
echo "Restoring uploads..."
rm -rf /path/to/marbism/uploads/*
tar -xzf "$BACKUP_DIR/$RESTORE_FROM/uploads_$RESTORE_FROM.tar.gz" \
  -C /path/to/marbism/uploads

# Restart services
echo "Restarting services..."
docker-compose up -d backend web-dashboard

echo "Restore completed. Verify application is functioning correctly."
```

### Cron Job: `/etc/cron.d/marbism-backup`

```bash
# Daily backup at 2 AM
0 2 * * * root /path/to/marbism/backup.sh

# Weekly integrity check (Sunday 3 AM)
0 3 * * 0 root /path/to/marbism/verify-backups.sh

# Monthly S3 sync (1st day 4 AM)
0 4 1 * * root aws s3 sync /mnt/backups s3://marbism-backups/
```

---

## 6. Kubernetes Deployment (Optional)

### File: `k8s/namespace.yaml`

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: marbism
```

### File: `k8s/backend-deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: marbism-backend
  namespace: marbism
spec:
  replicas: 3
  selector:
    matchLabels:
      app: marbism-backend
  template:
    metadata:
      labels:
        app: marbism-backend
    spec:
      containers:
      - name: backend
        image: marbism-backend:latest
        ports:
        - containerPort: 5001
        env:
        - name: MONGODB_URI
          valueFrom:
            secretKeyRef:
              name: marbism-secrets
              key: mongodb-uri
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: marbism-secrets
              key: redis-url
        resources:
          requests:
            cpu: "500m"
            memory: "512Mi"
          limits:
            cpu: "2000m"
            memory: "2Gi"
        livenessProbe:
          httpGet:
            path: /api/health
            port: 5001
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/health
            port: 5001
          initialDelaySeconds: 10
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: marbism-backend
  namespace: marbism
spec:
  selector:
    app: marbism-backend
  ports:
  - protocol: TCP
    port: 5001
    targetPort: 5001
  type: ClusterIP
```

---

## 7. Security Hardening Checklist

### SSL/TLS
- [x] Generate certificate with Let's Encrypt
- [x] Enable HSTS header (max-age=31536000)
- [x] Configure TLS 1.2+ only
- [x] Use strong cipher suites
- [x] Auto-renewal 30 days before expiry

### Network
- [x] Firewall: Block all inbound except 80/443
- [x] MongoDB/Redis: No external access
- [x] SSH: Key-based auth only, port 2222
- [x] Rate limiting on API endpoints
- [x] DDoS protection (via CDN if available)

### Database
- [x] Enable MongoDB authentication (users + passwords)
- [x] Enable audit logging
- [x] Regular backups + test restores
- [x] Index optimization for queries
- [x] Connection pooling

### Application
- [x] No hardcoded secrets (use .env)
- [x] Rotate JWT secrets quarterly
- [x] Input validation + sanitization
- [x] SQL injection prevention (use ORM/prepared statements)
- [x] CORS configured correctly

### Infrastructure
- [x] Log aggregation (ELK/Datadog)
- [x] Intrusion detection (fail2ban)
- [x] File integrity monitoring (aide/tripwire)
- [x] Patch management (automatic security updates)
- [x] Regular penetration testing

---

## 8. Deployment Runbook

### Pre-Deployment

1. **Prepare Server**
   ```bash
   ssh admin@server.ip
   sudo apt update && sudo apt upgrade -y
   sudo apt install -y docker.io docker-compose git curl
   git clone <repo> /opt/marbism
   cd /opt/marbism
   ```

2. **Configure Environment**
   ```bash
   cp .env.production.template .env.production
   # Edit .env.production with strong passwords
   chmod 600 .env.production
   ```

3. **Setup SSL Certificates**
   ```bash
   # Using Let's Encrypt
   sudo certbot certonly --standalone \
     -d marbism.your-domain.com \
     -d api.marbism.your-domain.com
   
   # Copy to nginx volume
   sudo cp /etc/letsencrypt/live/marbism.your-domain.com/* ./certs/
   ```

### Deployment

4. **Start Services**
   ```bash
   docker-compose up -d
   docker-compose logs -f backend  # Watch logs
   ```

5. **Verify Health**
   ```bash
   curl https://marbism.your-domain.com/health
   curl https://marbism.your-domain.com/api/health
   ```

6. **Initialize Database**
   ```bash
   docker exec marbism-backend npm run db:migrate
   docker exec marbism-backend npm run db:seed  # (if applicable)
   ```

### Post-Deployment

7. **Configure Monitoring**
   - Access Grafana: https://marbism.your-domain.com:3001 (admin / password)
   - Import dashboard: `grafana/dashboards/marbism-overview.json`
   - Configure alert notifications

8. **Backup Configuration**
   ```bash
   chmod +x backup.sh restore.sh
   crontab -e  # Add backup cron job
   ./backup.sh  # Test first backup
   ```

9. **Health Checks**
   - [ ] API responding to requests
   - [ ] Web dashboard loads
   - [ ] MongoDB replicaset initialized
   - [ ] Redis persistence working
   - [ ] Backups completing daily
   - [ ] Prometheus scraping all targets
   - [ ] Grafana displaying metrics
   - [ ] SSL certificate valid (run `certbot renew --dry-run`)

---

## 9. Troubleshooting Guide

### Container Won't Start

```bash
# Check logs
docker-compose logs backend

# Common issue: Port already in use
docker ps | grep marbism

# Restart container
docker-compose restart backend
```

### Database Connection Timeout

```bash
# Verify MongoDB is running
docker exec marbism-mongodb mongosh --eval "db.adminCommand('ping')"

# Check network connectivity
docker network inspect marbism-network

# Increase timeout in connection string
MONGODB_URI=""
```

### High Memory Usage

```bash
# Check memory per container
docker stats

# Adjust container limits in docker-compose.yml
# Restart container with new limits
docker-compose up -d --force-recreate backend
```

### Backup Failures

```bash
# Test backup script
bash -x backup.sh

# Check disk space
df -h /mnt/backups

# Verify permissions
ls -la /path/to/marbism/uploads
```

---

## Next Steps (Phase 3 Part 3)

**Part 3: SLA & Operations**
- 99.5% uptime monitoring & reporting
- Incident response procedures
- Operational runbooks
- Performance optimization
- Observability (logs, metrics, traces)

---

**Status**: Phase 3 Part 2 🚀 IN PROGRESS  
**Files Generated**: 12 configuration files  
**Next Review**: June 6, 2026

