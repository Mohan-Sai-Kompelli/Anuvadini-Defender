# MARBISM Operational Runbooks

**Date**: June 6, 2026  
**Purpose**: Step-by-step procedures for common operational tasks  
**Audience**: Engineers, Operations team, On-call rotation

---

## Table of Contents

1. [Daily Operations](#1-daily-operations)
2. [Incident Response](#2-incident-response)
3. [Deployment Procedures](#3-deployment-procedures)
4. [Database Operations](#4-database-operations)
5. [Performance Troubleshooting](#5-performance-troubleshooting)
6. [Backup & Recovery](#6-backup--recovery)
7. [Security Operations](#7-security-operations)

---

## 1. Daily Operations

### 1.1 Morning Health Check (9 AM)

**Purpose**: Verify system health and identify overnight issues  
**Duration**: 15 minutes  
**Tools**: Grafana, Docker CLI, SSH

**Steps**:

```bash
# Step 1: SSH into production server
ssh -p 2222 ops@marbism.your-domain.com

# Step 2: Check all containers running
docker-compose ps

# Expected output: all services "Up"
# If any service is down, go to "Container Recovery" section

# Step 3: Check system resources
docker stats --no-stream

# Check thresholds:
# - CPU usage < 80%
# - Memory usage < 85%
# - Disk free > 20%

# Step 4: Verify backups completed
tail -20 /var/log/marbism-backup.log

# Look for: "MARBISM Backup Completed Successfully"

# Step 5: Check SSL certificate expiry
openssl x509 -enddate -noout -in certs/fullchain.pem

# Should show date > 30 days from today

# Step 6: Access Grafana dashboard
# Open browser: https://marbism.your-domain.com:3001
# Login: admin / <password from .env.production>
# Check dashboards:
#   - System metrics (CPU, memory, disk)
#   - API performance (response times, errors)
#   - Database metrics (connections, queries)

# Step 7: Review overnight alerts
# Grafana > Alerting > Alert instances
# Click through any firing alerts

# Step 8: Check application logs
docker logs -n 50 marbism-backend | grep ERROR

# Escalate to engineering lead if errors found
```

**Success Criteria**:
- ✅ All containers running
- ✅ No system resource warnings
- ✅ Backup completed successfully
- ✅ SSL certificate valid
- ✅ No critical alerts firing
- ✅ Error rate < 0.1%

**If Issues Found**:
→ See relevant section below (Container Recovery, Performance Troubleshooting, etc.)

---

### 1.2 Afternoon Status Check (1 PM)

**Purpose**: Mid-day verification of ongoing operations  
**Duration**: 10 minutes

```bash
# Step 1: Check API response times
curl -w "@curl-format.txt" https://marbism.your-domain.com/api/health -o /dev/null -s

# Expected: time_total < 500ms

# Step 2: Check database performance
docker exec marbism-mongodb mongosh --eval "db.serverStatus().opcounters"

# Monitor trends:
# - Inserts/updates/queries should be consistent with expected traffic

# Step 3: Check Redis status
docker exec marbism-redis redis-cli info stats

# Look for:
# - total_commands_processed increasing steadily
# - No evictions (evicted_keys should be 0)

# Step 4: Verify no alerts triggered
# Access Grafana and check "Alerting" > "Alert instances"

# Step 5: Sample some user workflows
# Test login → Check attendance → View reports
# Report any issues found
```

---

### 1.3 Evening Handoff (5 PM)

**Purpose**: Prepare backup engineer for on-call shift  
**Duration**: 10 minutes

```bash
# Step 1: Document any ongoing issues
# Create file: /tmp/handoff-notes-$(date +%Y%m%d).txt
cat > /tmp/handoff-notes-$(date +%Y%m%d).txt << EOF
Date: $(date)
On-Call: $(whoami)
Next On-Call: [name]

Ongoing Issues:
- [issue 1]
- [issue 2]

Recent Changes:
- [deployment 1]
- [config change 1]

Known Limitations:
- [limitation 1]

Escalation Contacts:
- Engineering Lead: [name] [phone]
- Manager: [name] [phone]
- CTO: [name] [phone]
EOF

# Step 2: Send handoff message to backup engineer
# Slack channel #on-call: "Handoff complete. See /tmp/handoff-notes-$(date +%Y%m%d).txt"

# Step 3: Save all recent logs
mkdir -p /var/log/marbism-archives
tar -czf /var/log/marbism-archives/logs-$(date +%Y%m%d).tar.gz /app/logs/*

# Step 4: Verify backup engineer can access systems
# Ask them to: "Verify you can SSH, access Grafana, and view Docker containers"

# Step 5: Provide context on any alerts
# Point them to specific alert rules if any are firing
```

---

## 2. Incident Response

### 2.1 P1 - Critical Incident (System Down)

**Severity**: System completely unavailable  
**Response Time**: 15 minutes  
**Resolution Target**: 2 hours

**Steps**:

```bash
# STEP 1: CONFIRM INCIDENT (1 min)
# Phone: Page on-call engineer immediately
# Slack: Post in #marbism-war-room "P1 INCIDENT: System unavailable"

# Check if it's really down:
curl -I https://marbism.your-domain.com
curl -I https://marbism.your-domain.com/api/health

# STEP 2: INITIAL TRIAGE (2 min)
# Determine which component is down:

# Test API
curl https://marbism.your-domain.com/api/health
# Expected: {"status":"OK"}

# Test Web Dashboard
curl https://marbism.your-domain.com
# Expected: HTML response

# Test Database
docker exec marbism-mongodb mongosh --eval "db.adminCommand('ping')"
# Expected: { ok: 1 }

# Check container status
docker-compose ps

# Identify which service is down

# STEP 3: IMMEDIATE MITIGATION (5 min)
case "$DOWN_SERVICE" in
  "backend")
    # Backend API is down
    docker-compose logs -n 20 backend | tail -20
    docker-compose restart backend
    sleep 30
    curl https://marbism.your-domain.com/api/health
    ;;
  "mongodb")
    # Database is down - this is critical
    # Check disk space first
    df -h
    # If disk is full, that's the issue
    # If not, check MongoDB logs
    docker-compose logs -n 50 mongodb | tail -50
    # Try restart
    docker-compose restart mongodb
    sleep 10
    # Verify recovery
    docker exec marbism-mongodb mongosh --eval "db.adminCommand('ping')"
    ;;
  "nginx")
    # Reverse proxy down
    docker-compose logs -n 20 nginx
    docker-compose restart nginx
    sleep 5
    ;;
esac

# STEP 4: VERIFY RECOVERY (2 min)
# Test critical paths:
curl -I https://marbism.your-domain.com
curl -I https://marbism.your-domain.com/api/health
# Check error rates in Grafana (should drop to <1%)

# STEP 5: ESCALATE IF NOT RESOLVED (immediately)
# If still down after 10 minutes:
# 1. Page engineering lead
# 2. Initiate war room
# 3. Declare status page: "We are investigating issues"

# STEP 6: ROOT CAUSE INVESTIGATION (ongoing)
# Once service is restored:
# 1. Gather all logs from past 30 minutes
docker logs --since 30m marbism-backend > /tmp/backend-logs.txt
docker logs --since 30m marbism-mongodb > /tmp/mongodb-logs.txt

# 2. Check system metrics
# Grafana > look at CPU/memory/disk from incident time

# 3. Check for recent deployments/changes
git log --oneline | head -5

# STEP 7: POST-INCIDENT (after recovery)
# 1. Status page: "Issue resolved"
# 2. Send incident summary email
# 3. Schedule post-mortem (next day)
# 4. Create action items to prevent recurrence
```

**Escalation Path**:
```
Minute 0-10: On-call engineer investigates
Minute 10-20: Page engineering lead
Minute 20-30: Page manager
Minute 30+: CTO involvement
```

---

### 2.2 P2 - High Priority Incident (Partial Outage)

**Severity**: Multiple features down, 50+ users affected  
**Response Time**: 30 minutes  
**Resolution Target**: 4 hours

```bash
# STEP 1: CREATE INCIDENT (2 min)
# Open incident tool and document:
# - What's broken (specific features)
# - Who's affected (number of users)
# - When it started (exact time)

# STEP 2: INVESTIGATE (10 min)
# Check specific feature:
docker logs marbism-backend | grep "consultation-logs"
# or
docker logs marbism-backend | grep "ERROR"

# Check database for errors:
docker exec marbism-mongodb mongosh --eval \
  "db.attendance.findOne({}, {createdAt: -1})"

# STEP 3: IMPLEMENT FIX (variable)
# Option A: Restart service
docker-compose restart backend

# Option B: Fix configuration
# Edit .env.production
nano .env.production
# Make change
docker-compose up -d backend

# Option C: Rollback deployment
git revert HEAD
docker-compose up -d --build backend

# STEP 4: VERIFY (5 min)
# Test the broken feature in staging/production
# Check error rate trending down

# STEP 5: COMMUNICATION (ongoing)
# Send status updates every 30 minutes
# Slack: "P2 incident: Consultation logs feature degraded. ETA 1 hour for fix."

# STEP 6: ROOT CAUSE ANALYSIS (after resolution)
# Why did this happen?
# What prevented us from catching it earlier?
```

---

### 2.3 Create War Room (P1 Only)

```bash
# Slack Command:
/channel-create marbism-p1-TIMESTAMP

# Message template:
"""
🚨 P1 INCIDENT DECLARED 🚨

Incident ID: INC-2024-0607-001
Time Started: [when]
Affected Services: [list]
Estimated Users Impact: [number]

Incident Commander: [name]
Timeline Updates: Every 5 minutes

Current Status: INVESTIGATING
ETA to resolution: [estimate]

Escalation: [contact info]
"""

# Keep channel focused - only status updates during incident
# Post full details to #incident-postmortem after resolution
```

---

## 3. Deployment Procedures

### 3.1 Canary Deployment (Safe Production Deploy)

**Purpose**: Deploy new code with minimal risk  
**Duration**: 30 minutes  
**Tools**: Docker, git

```bash
# STEP 1: PRE-DEPLOYMENT CHECKS (5 min)
cd /opt/marbism

# Verify all tests pass locally
npm run test:all

# Verify code review approved
# Check PR status in GitHub

# Check staging deployment works
# Ask: "Is staging health check passing?"

# STEP 2: BUILD DOCKER IMAGE (5 min)
# Only do this if image tag hasn't been built
docker build -f Dockerfile.backend -t marbism-backend:$(git rev-parse --short HEAD) .

# Tag for deployment
docker tag marbism-backend:$(git rev-parse --short HEAD) marbism-backend:latest

# STEP 3: ANNOUNCE DEPLOYMENT (1 min)
slack "#deployments" "Deploying: [PR title] at $(date)"

# STEP 4: CANARY ROLLOUT (10 min)
# Update docker-compose.yml to use new image
# sed -i "s/marbism-backend:.*/marbism-backend:$(git rev-parse --short HEAD)/" docker-compose.yml

# Start canary (1 replica with new version)
docker-compose up -d --scale backend=4  # if 3 were running, add 1 more

# Wait for new container to be healthy
sleep 30
docker ps | grep backend

# Check if new container is healthy
curl https://marbism.your-domain.com/api/health

# STEP 5: MONITOR ERROR RATES (10 min)
# Watch Grafana error rate metric
# Should remain < 0.1%
# If error rate spikes > 0.5%, trigger immediate rollback

# STEP 6: FULL ROLLOUT (no deployment, just verify)
# If canary is healthy, traffic will naturally distribute
# Monitor for 10 more minutes

# STEP 7: VERIFY DEPLOYMENT (2 min)
docker-compose ps | grep backend
# All replicas should be running new version

# STEP 8: POST-DEPLOYMENT (1 min)
slack "#deployments" "✅ Deployment complete at $(date)"
# Document any issues in #issues

# STEP 9: MONITOR (next 1 hour)
# Check Grafana every 5 minutes
# Watch for any alerts
# Be ready to rollback immediately if issues appear
```

**Rollback Procedure**:

```bash
# If issues detected during deployment:

slack "#deployments" "🚨 ROLLBACK INITIATED - [reason]"

# Revert docker-compose.yml
git checkout docker-compose.yml

# Restart with previous version
docker-compose up -d --force-recreate backend

# Wait for recovery
sleep 30

# Verify
curl https://marbism.your-domain.com/api/health
docker logs -n 5 marbism-backend

slack "#deployments" "✅ Rollback complete. System stable."

# Schedule post-mortem to understand what broke
```

---

### 3.2 Database Migration Deployment

```bash
# STEP 1: CREATE BACKUP (5 min)
./backup.sh

# Verify backup created
ls -lh /mnt/backups/$(date +%Y%m%d)_*/

# STEP 2: TEST MIGRATION LOCALLY (10 min)
# Never skip this step
docker exec marbism-mongodb mongosh << EOF
// Test migration script here
db.attendance.updateMany(
  { status: { \$exists: false } },
  { \$set: { status: "unknown" } }
)

// Count affected documents
db.attendance.countDocuments({ status: "unknown" })
EOF

# STEP 3: ENABLE MAINTENANCE MODE (1 min)
# Set feature flag to read-only
# Users see: "System undergoing maintenance, please try again in 5 minutes"

# In .env.production:
# FEATURE_MAINTENANCE_MODE=true
docker-compose up -d backend

# STEP 4: STOP ACCEPTING WRITES (1 min)
# Drain in-flight requests
sleep 10

# Verify no active connections
docker exec marbism-mongodb mongosh --eval "db.serverStatus().connections"

# STEP 5: PERFORM MIGRATION (variable)
docker exec marbism-mongodb mongosh << 'EOF'
// Your migration script
db.attendance.updateMany(
  { status: { $exists: false } },
  { $set: { status: "unknown" } }
)

// Verify
db.attendance.countDocuments()
EOF

# STEP 6: VERIFY DATA INTEGRITY (5 min)
# Sample check
docker exec marbism-mongodb mongosh --eval \
  "db.attendance.find({}, {_id:1, status:1}).limit(10).pretty()"

# Count verification
BEFORE=123456  # Note this before migration
AFTER=$(docker exec marbism-mongodb mongosh --eval \
  "db.attendance.countDocuments()")
echo "Before: $BEFORE, After: $AFTER"
# Should match

# STEP 7: DISABLE MAINTENANCE MODE (1 min)
# FEATURE_MAINTENANCE_MODE=false
docker-compose up -d backend

# STEP 8: SMOKE TESTS (5 min)
# Test critical features that use migrated data
curl -X GET https://marbism.your-domain.com/api/attendance
curl -X GET https://marbism.your-domain.com/api/reports

# STEP 9: MONITOR (next 1 hour)
# Watch for any errors related to migrated fields
docker logs -f marbism-backend | grep ERROR
```

---

## 4. Database Operations

### 4.1 Create Index for Slow Query

```bash
# STEP 1: IDENTIFY SLOW QUERY
# From Grafana, note slow query details
# Example: db.attendance.find({organization: X, createdAt: {$gt: Y}})

# STEP 2: TEST INDEX CREATION
# Create index in test environment first
docker exec marbism-mongodb mongosh << EOF
use marbism
db.attendance.createIndex({ organization: 1, createdAt: -1 })

// Verify index created
db.attendance.getIndexes()
EOF

# STEP 3: MONITOR INDEX CREATION (on production)
# Large collections might take time
# Monitor progress:
docker exec marbism-mongodb mongosh << EOF
db.currentOp(true)
EOF

# STEP 4: VERIFY INDEX HELPS
# Re-run slow query
# Should return results in <100ms now

# STEP 5: DOCUMENT
# Record new index in operations log
echo "Created index on attendance(organization, createdAt) on $(date)" >> /var/log/operations.log
```

---

### 4.2 Database Backup Verification

```bash
# STEP 1: CHECK BACKUP FILE
ls -lh /mnt/backups/$(date +%Y%m%d)_*/mongodb*.tar.gz

# STEP 2: VERIFY BACKUP INTEGRITY
tar -tzf /mnt/backups/$(date +%Y%m%d)_*/mongodb*.tar.gz | head -20
# Should list MongoDB dump files

# STEP 3: TEST RESTORE (in test environment only!)
# Do NOT do this on production
mkdir -p /tmp/test-restore
tar -xzf /mnt/backups/$(date +%Y%m%d)_*/mongodb*.tar.gz -C /tmp/test-restore

# STEP 4: VERIFY SIZE
du -sh /mnt/backups/$(date +%Y%m%d)_*/

# Should be reasonable size (similar to previous backups)
```

---

## 5. Performance Troubleshooting

### 5.1 API Response Time High (p99 > 2s)

```bash
# STEP 1: IDENTIFY SLOW ENDPOINTS
# Grafana > HTTP Request Duration
# Look for which endpoints are slow

# STEP 2: CHECK DATABASE PERFORMANCE
docker exec marbism-mongodb mongosh << EOF
db.setProfilingLevel(1, { slowms: 100 })
db.system.profile.find().sort({ millis: -1 }).limit(5).pretty()
EOF

# STEP 3: CHECK SYSTEM RESOURCES
docker stats --no-stream

# If CPU > 80% or memory > 85%:
# - Scale horizontally (more replicas)
# - Check for runaway processes

# STEP 4: CHECK CACHE HIT RATE
docker exec marbism-redis redis-cli info stats | grep hits

# If hit_ratio low:
# - Check cache configuration
# - Increase cache size

# STEP 5: OPTIMIZE SLOW QUERY
# Add index for frequently filtered fields
# Or optimize SELECT clause (remove unused columns)
```

---

### 5.2 Memory Usage High (>80%)

```bash
# STEP 1: CHECK WHAT'S USING MEMORY
docker stats --no-stream | sort -k3 -nr | head -10

# STEP 2: IF BACKEND USING TOO MUCH
# Check for memory leaks
docker logs marbism-backend | grep "OutOfMemory"

# Restart to reset
docker-compose restart backend

# STEP 3: IF MONGODB USING TOO MUCH
# This is usually normal (working set cache)
# Check heap size setting
docker exec marbism-mongodb mongosh --eval "db.serverStatus().mem"

# STEP 4: IF REDIS USING TOO MUCH
# Clear old keys
docker exec marbism-redis redis-cli FLUSHDB

# Or check for leaking sessions
docker exec marbism-redis redis-cli DBSIZE

# If too many keys, investigate why
```

---

### 5.3 High Disk Usage (>90%)

```bash
# STEP 1: IDENTIFY LARGE FILES/DIRECTORIES
du -sh /* | sort -rh | head -10

# STEP 2: IF LOGS ARE LARGE
# Rotate logs manually
# Or verify logrotate is working
sudo logrotate -fv /etc/logrotate.d/marbism

# Archive old logs
tar -czf /mnt/backups/logs-archive-$(date +%Y%m%d).tar.gz /var/log/marbism/*

# STEP 3: IF DATABASE IS LARGE
# Check for orphaned records
docker exec marbism-mongodb mongosh << EOF
db.attendance.countDocuments()  // Should be reasonable
db.students.countDocuments()
EOF

# Archive old data if needed
db.attendance.deleteMany({ createdAt: { $lt: new Date(Date.now() - 365*24*60*60*1000) } })

# STEP 4: IF UPLOADS ARE LARGE
# Check for stuck uploads
find /app/uploads -type f -mtime +30 -delete  # Delete >30 days old

# STEP 5: VERIFY DISK CLEANUP WORKED
df -h
```

---

## 6. Backup & Recovery

### 6.1 Manual Backup

```bash
# STEP 1: ENSURE SPACE AVAILABLE
df -h /mnt/backups
# Need at least 100GB free

# STEP 2: RUN BACKUP
/opt/marbism/backup.sh

# STEP 3: MONITOR PROGRESS
tail -f /var/log/marbism-backup.log

# Wait for: "MARBISM Backup Completed Successfully"

# STEP 4: VERIFY BACKUP SIZE
du -sh /mnt/backups/$(date +%Y%m%d)_*/
```

### 6.2 Restore from Backup

```bash
# STEP 1: IDENTIFY BACKUP TO RESTORE FROM
ls -lt /mnt/backups/ | head -10
# Pick backup timestamp (e.g., 20240606_020000)

# STEP 2: ANNOUNCE MAINTENANCE
slack "#status" "⚠️ Maintenance: Restoring from backup. Expected 30 minutes downtime."

# STEP 3: START RESTORE
/opt/marbism/restore.sh 20240606_020000

# STEP 4: MONITOR RESTORE PROGRESS
tail -f /var/log/marbism-restore.log

# STEP 5: VERIFY SERVICES ONLINE
curl https://marbism.your-domain.com/api/health
# Should return 200 OK

# STEP 6: SMOKE TESTS
# Test critical workflows:
# - Login → successful
# - Mark attendance → successful
# - View reports → successful

# STEP 7: ANNOUNCE COMPLETION
slack "#status" "✅ Restore complete. System fully operational."
```

---

## 7. Security Operations

### 7.1 Update SSL Certificate

```bash
# STEP 1: CHECK CERTIFICATE EXPIRY
openssl x509 -enddate -noout -in certs/fullchain.pem

# If expiry > 30 days away, nothing needed
# If expiry < 30 days, renew now

# STEP 2: RENEW CERTIFICATE
# Option A: Automatic (if certbot running)
certbot renew

# Option B: Manual renewal
docker-compose stop nginx
certbot certonly --standalone -d marbism.your-domain.com
docker-compose up -d nginx

# STEP 3: VERIFY NEW CERTIFICATE
openssl x509 -enddate -noout -in /etc/letsencrypt/live/marbism.your-domain.com/fullchain.pem

# Should show new expiry date (90 days out)

# STEP 4: RESTART NGINX
docker-compose restart nginx

# STEP 5: TEST HTTPS
curl https://marbism.your-domain.com
# Should return 200 OK
```

### 7.2 Rotate Secrets

```bash
# STEP 1: GENERATE NEW SECRETS
# JWT Secret
openssl rand -base64 64

# Mongo Password
openssl rand -base64 32

# STEP 2: UPDATE .env.production
nano .env.production
# Update: JWT_SECRET, MONGO_PASSWORD, REDIS_PASSWORD

# STEP 3: RESTART SERVICES
docker-compose up -d

# STEP 4: TEST SYSTEM STILL WORKS
curl https://marbism.your-domain.com/api/health
# Should return 200

# STEP 5: VERIFY OLD SESSIONS INVALIDATED
# Users will need to re-login
# Expect higher traffic on login endpoint

# STEP 6: BACKUP NEW SECRETS
tar -czf /mnt/backups/secrets-$(date +%Y%m%d).tar.gz /opt/marbism/.env.production
chmod 600 /mnt/backups/secrets-*.tar.gz
```

---

## Escalation Contact List

**Update this weekly**

```
On-Call Primary:
  Name: _______________
  Phone: _______________
  Slack: @______________

On-Call Backup:
  Name: _______________
  Phone: _______________
  Slack: @______________

Engineering Lead:
  Name: _______________
  Phone: _______________
  Email: ______________

Manager:
  Name: _______________
  Phone: _______________
  Email: ______________

CTO:
  Name: _______________
  Phone: _______________
  Email: ______________

MARBISM Support (external):
  Phone: _______________
  Email: ______________
```

---

## Quick Reference

| Task | Command | Duration |
|------|---------|----------|
| Health Check | `curl /api/health` | 1 min |
| View Logs | `docker logs marbism-backend` | 2 min |
| Restart Service | `docker-compose restart backend` | 1 min |
| Manual Backup | `/opt/marbism/backup.sh` | 30 min |
| Database Query | `docker exec marbism-mongodb mongosh` | varies |
| View Metrics | Browser → Grafana | 2 min |
| List Alerts | Grafana → Alerting | 2 min |

---

**Last Updated**: June 6, 2026  
**Next Review**: Monthly (or after each incident)
