# MARBISM Phase 3 Part 3 - SLA & Operations

**Date**: June 6, 2026  
**Status**: 🚀 IN PROGRESS  
**Scope**: SLA Framework, Operations, Performance Optimization, Incident Management

---

## Overview

Phase 3 Part 3 establishes the operational framework for maintaining 99.5% uptime, incident response, performance optimization, and observability for the MARBISM system across 300+ colleges and hospitals.

---

## 1. Service Level Agreement (SLA)

### 1.1 Uptime Targets

**Production SLA**: 99.5% uptime per month  
**Downtime Allowance**: 3.6 hours per month (21.6 minutes per week)

| Service | Availability | Monthly Downtime |
|---------|-------------|------------------|
| API Backend | 99.5% | 3.6 hours |
| Web Dashboard | 99.5% | 3.6 hours |
| Database (MongoDB) | 99.9% | 43 minutes |
| Cache (Redis) | 99.5% | 3.6 hours |
| Backup System | 99.9% | 43 minutes |

### 1.2 Response Time SLA

| Endpoint | P50 | P95 | P99 |
|----------|-----|-----|-----|
| Authentication | <50ms | <150ms | <500ms |
| Data Retrieval | <100ms | <300ms | <1s |
| File Upload | <200ms | <500ms | <2s |
| Report Generation | <500ms | <2s | <5s |

### 1.3 Error Rate SLA

- **Acceptable**: < 0.1% of requests (1 in 1,000)
- **Unacceptable**: > 1% of requests (1 in 100)
- **Critical**: > 5% of requests (1 in 20)

### 1.4 SLA Credits

**Uptime < 99.5% but ≥ 99.0%**: 10% monthly credit  
**Uptime < 99.0% but ≥ 95.0%**: 25% monthly credit  
**Uptime < 95.0%**: 50% monthly credit  

---

## 2. Incident Response Framework

### 2.1 Severity Levels

#### **P1 - Critical** (Immediate)
- System completely unavailable
- Major data loss or corruption
- Security breach detected
- All users affected

**Response Time**: 15 minutes  
**Resolution Target**: 2 hours  
**Escalation**: VP Engineering + CTO

#### **P2 - High** (Urgent)
- Partial system outage
- Performance degradation (>50%)
- Multiple features unavailable
- 50+ users affected

**Response Time**: 30 minutes  
**Resolution Target**: 4 hours  
**Escalation**: Engineering Lead

#### **P3 - Medium** (Standard)
- Single feature unavailable
- Performance issue (<50%)
- Limited user impact (10-50 users)
- Workaround available

**Response Time**: 2 hours  
**Resolution Target**: 8 hours  
**Escalation**: On-call engineer

#### **P4 - Low** (Backlog)
- Minor bugs
- Cosmetic issues
- Enhancement requests
- 1-10 users affected

**Response Time**: 24 hours  
**Resolution Target**: 1 week  
**Escalation**: Regular backlog

### 2.2 Incident Response Workflow

```
Incident Detected
    ↓
Classify Severity (P1-P4)
    ↓
Page On-Call Engineer
    ↓
Begin Initial Investigation
    ↓
Escalate if Needed
    ↓
Implement Mitigation
    ↓
Apply Permanent Fix
    ↓
Document & Close Ticket
    ↓
Post-Mortem (P1/P2 only)
```

### 2.3 On-Call Schedule

**Weekly Rotation**: 1 primary + 1 backup

**Primary**: Responds to all incidents, owns investigation  
**Backup**: Assists with P1, takes over if primary unavailable

**Handoff Time**: 10 AM every Monday  
**Escalation Path**: Primary → Backup → Manager → CTO

### 2.4 War Room Procedures (P1 Only)

**Activation**: When incident affects >100 users or critical system  
**Location**: Slack channel #marbism-war-room  
**Attendees**: Engineering Lead, On-call, Manager, CTO (as needed)

**Protocol**:
1. War room channel created with incident ID
2. 5-minute status updates posted
3. Root cause analysis conducted live
4. Mitigation steps documented
5. Permanent fix tracked
6. Channel archived after resolution

### 2.5 Incident Communication

**To Users**: Every 15 minutes during P1  
**To Stakeholders**: Every 30 minutes during P1  
**Status Page**: Updated on change  
**Post-Incident**: Email summary within 24 hours

---

## 3. Operational Runbooks

### 3.1 Daily Operations Checklist

**Morning (9 AM)**
```
□ Check Grafana dashboards
□ Review overnight error logs
□ Verify backup completion (tail -f /var/log/marbism-backup.log)
□ Check SSL certificate expiry (certbot certificates)
□ Review alert history
□ Check disk space (df -h)
```

**Afternoon (1 PM)**
```
□ Review API response times (p99 < 2s)
□ Check database connection pool (< 80% utilization)
□ Verify no database locks (mongostat)
□ Review new deployments (git log --oneline)
□ Check rate limiter performance
```

**Evening (5 PM)**
```
□ Review error rates (< 0.1%)
□ Check for any pending alerts
□ Verify evening traffic patterns
□ Prepare handoff notes for backup engineer
□ Document any ongoing issues
```

### 3.2 Weekly Operations

**Monday 10 AM**
```
□ On-call handoff meeting (15 min)
□ Review previous week's incidents
□ Update on-call escalation contact list
□ Check certificate renewal status
```

**Wednesday**
```
□ Test backup restoration
□ Review security logs (fail2ban)
□ Check database indexes for optimization
□ Review capacity trends
```

**Friday**
```
□ Weekly health report generation
□ Performance trend analysis
□ Plan next week's maintenance
□ Team retrospective (if incidents occurred)
```

### 3.3 Monthly Operations

**First Day of Month**
```
□ SLA compliance calculation
□ Invoice generation (if applicable)
□ Credit calculation (if needed)
□ Archive previous month's logs
```

**Mid-Month**
```
□ Security vulnerability scan
□ Dependency update review
□ Capacity planning analysis
□ Cost optimization review
```

**End of Month**
```
□ Monthly capacity report
□ Incident trend analysis
□ Performance summary
□ Team performance review
```

### 3.4 Quarterly Operations

```
□ JWT secret rotation
□ Database optimization & reindex
□ Load testing (simulated traffic)
□ Disaster recovery drill
□ Security audit
□ Architecture review
□ Capacity planning for next quarter
□ Team training & certifications
```

---

## 4. Performance Optimization

### 4.1 API Optimization

#### Response Time Targets
```javascript
// Target: <200ms p95

// Optimization strategies:
1. Query optimization (indexes, projections)
2. Caching (Redis)
3. Connection pooling
4. Async processing
5. CDN for static assets
6. Gzip compression
```

#### Database Query Optimization
```sql
-- Profile slow queries (>100ms)
db.setProfilingLevel(1, { slowms: 100 })

-- Find slow queries
db.system.profile.find().sort({ millis: -1 }).limit(10)

-- Add indexes for frequently filtered fields
db.attendances.createIndex({ organization: 1, createdAt: -1 })
db.attendances.createIndex({ student: 1, status: 1 })
```

#### Cache Strategy
```javascript
// Redis caching layers

// Layer 1: Session cache (1 hour)
cache.set(`session:${userId}`, userData, 3600)

// Layer 2: Organization config (24 hours)
cache.set(`org:${orgId}:config`, config, 86400)

// Layer 3: Holiday list (30 days)
cache.set(`holidays:${year}`, holidays, 2592000)
```

### 4.2 Database Optimization

#### Connection Pool Tuning
```javascript
// mongodb://<user>:<password>@host/db
// ?maxPoolSize=20 (default 10)
// &minPoolSize=5
// &maxIdleTimeMS=60000
```

#### Index Strategy
```javascript
// Create indexes on:
1. Foreign keys (organization, student, user)
2. Time-based queries (createdAt, updatedAt)
3. Status fields (approval status, attendance status)
4. Frequently combined fields
5. Text search fields

// Avoid indexing:
1. Low cardinality fields
2. Large binary fields
3. Fields with many null values
```

#### Aggregation Pipeline Optimization
```javascript
// Match early (reduce documents)
db.attendance.aggregate([
  { $match: { organization: orgId, date: { $gte: startDate } } },
  { $lookup: { from: "students", ... } },
  { $group: { _id: "$status", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
])
```

### 4.3 Application Optimization

#### Node.js Best Practices
```javascript
// 1. Connection pooling
const pool = mongoose.connection.getClient().topology.sessionPool

// 2. Async processing
worker.queue.add(async () => {
  // Process in background
}, { delay: 5000, attempts: 3 })

// 3. Memory management
// Monitor heap usage: node --max-old-space-size=2048

// 4. Error handling
try {
  // Operation
} catch (error) {
  logger.error('Operation failed', { error, context })
}
```

#### Frontend Optimization
```javascript
// 1. Code splitting
const Dashboard = lazy(() => import('./Dashboard'))

// 2. Asset caching (service workers)
// Cache-Control: max-age=31536000, immutable

// 3. Lazy loading images
<img loading="lazy" src="..." />

// 4. Minification & bundling
npm run build  // Produces optimized bundle
```

### 4.4 Network Optimization

#### Compression
```nginx
gzip on;
gzip_min_length 1000;
gzip_comp_level 6;
gzip_types text/plain text/css application/json application/x-javascript;
```

#### HTTP/2 Push
```nginx
http2_push_preload on;
add_header Link "</static/app.js>; rel=preload; as=script" always;
```

#### CDN Strategy
- Static assets (JS, CSS, images) → CloudFront/CloudFlare
- API responses → origin (no CDN)
- HTML → origin with short TTL (5 min)

---

## 5. Observability & Monitoring

### 5.1 Metrics Collection

#### Application Metrics
```
http_requests_total
  - status code (200, 401, 500, etc.)
  - method (GET, POST, etc.)
  - endpoint (/api/attendance, etc.)

http_request_duration_seconds
  - quantiles (0.5, 0.95, 0.99)
  - per endpoint

database_queries_total
  - operation (find, insert, update)
  - collection
  - duration

cache_hits_total
cache_misses_total
authentication_failures_total
```

#### Infrastructure Metrics
```
node_cpu_seconds_total          # CPU usage
node_memory_bytes_total         # Memory utilization
node_filesystem_avail_bytes     # Disk space
node_network_transmit_bytes     # Network I/O
container_cpu_usage_seconds     # Container CPU
container_memory_usage_bytes    # Container memory
```

### 5.2 Logging Strategy

#### Log Levels
```
DEBUG   - Development only, detailed debugging info
INFO    - Application events (startup, shutdown, config)
WARN    - Recoverable errors, performance issues
ERROR   - Application errors, failures
FATAL   - System shutdown, data loss
```

#### Structured Logging
```json
{
  "timestamp": "2024-06-06T10:30:45.123Z",
  "level": "ERROR",
  "service": "marbism-backend",
  "message": "Database connection failed",
  "error": {
    "code": "ECONNREFUSED",
    "message": "Connection refused",
    "stack": "..."
  },
  "context": {
    "userId": "user123",
    "action": "fetchAttendance",
    "duration_ms": 5000
  }
}
```

#### Log Retention
```
Application logs:  30 days
Access logs:       90 days
Audit logs:        365 days
Debug logs:        7 days
```

### 5.3 Tracing Strategy

#### Distributed Tracing
```
Request Flow:
  API Gateway
    ↓ (trace_id: abc123)
  Authentication Service
    ↓ (span: auth_check)
  Database Query
    ↓ (span: db_query, duration: 45ms)
  Cache Update
    ↓ (span: cache_set, duration: 2ms)
  Response
```

#### Instrumentation
```javascript
// Add tracing to critical paths
const tracer = new Tracer()

app.use((req, res, next) => {
  const span = tracer.startSpan('http.request', {
    attributes: {
      'http.method': req.method,
      'http.url': req.url,
      'http.client_ip': req.ip
    }
  })
  
  res.on('finish', () => {
    span.setAttributes({
      'http.status_code': res.statusCode,
      'http.duration_ms': Date.now() - req._startTime
    })
    span.end()
  })
  
  next()
})
```

---

## 6. Capacity Planning

### 6.1 Current Capacity

| Resource | Allocated | Used | Headroom |
|----------|-----------|------|----------|
| CPU | 16 cores | 40% | 60% |
| Memory | 64 GB | 35% | 65% |
| Storage | 2 TB SSD | 20% | 80% |
| Database | 50 GB | 15% | 85% |
| Backup | 500 GB | 25% | 75% |

### 6.2 Growth Projections

**Monthly Active Users**: 50,000 (Phase 4) → 200,000+ (Year 2)

| Month | Users | Data (GB) | QPS |
|-------|-------|-----------|-----|
| Month 0 | 50k | 10 | 100 |
| Month 6 | 100k | 20 | 200 |
| Month 12 | 200k | 40 | 400 |

### 6.3 Scaling Strategy

**Phase 1 (Current)**: Single instance + replicas  
**Phase 2 (Month 6)**: Multi-zone with load balancer  
**Phase 3 (Month 12)**: Geographic distribution (3 regions)  
**Phase 4 (Year 2)**: Edge computing + CDN

### 6.4 Capacity Alerts

```yaml
CPU Usage > 80%:
  Action: Scale horizontally or optimize code

Memory > 85%:
  Action: Increase pod memory limit or scale

Disk < 20% free:
  Action: Archive old logs, expand storage

Database > 80% size:
  Action: Partition old data, increase storage

Queue depth > 10,000:
  Action: Increase workers or optimize processing
```

---

## 7. Performance Tuning Guide

### 7.1 Database Performance

#### Monitor Query Performance
```bash
# MongoDB profiler
docker exec marbism-mongodb mongosh --eval "db.setProfilingLevel(1, { slowms: 100 })"

# Check profile
docker exec marbism-mongodb mongosh --eval "db.system.profile.find().pretty()"
```

#### Optimize Indexes
```bash
# Current indexes
docker exec marbism-mongodb mongosh --eval "db.collection_name.getIndexes()"

# Remove unused indexes
db.collection_name.dropIndex("index_name")

# Rebuild indexes
docker exec marbism-mongodb mongosh --eval "db.collection_name.reIndex()"
```

### 7.2 API Performance

#### Enable Caching Headers
```javascript
// Cache static assets
res.set('Cache-Control', 'public, max-age=31536000, immutable')

// Cache dynamic data with short TTL
res.set('Cache-Control', 'private, max-age=300')

// No cache for auth-required endpoints
res.set('Cache-Control', 'no-cache, no-store, must-revalidate')
```

#### Implement Request Batching
```javascript
// Instead of N requests:
// POST /api/attendance?ids=1,2,3

// Payload:
{
  "operations": [
    { "id": 1, "status": "present" },
    { "id": 2, "status": "absent" },
    { "id": 3, "status": "late" }
  ]
}
```

### 7.3 Frontend Performance

#### Lighthouse Audit
```bash
# Run audit
lighthouse https://marbism.your-domain.com --output-path=report.html

# Targets:
# Performance:     > 90
# Accessibility:   > 95
# Best Practices:  > 95
# SEO:             > 95
```

#### Bundle Size Analysis
```bash
# Analyze bundle
npm run analyze

# Targets:
# JS Bundle:  < 500KB (gzipped)
# CSS Bundle: < 100KB (gzipped)
# Images:     < 1MB (optimized)
```

---

## 8. Disaster Recovery Plan

### 8.1 Recovery Time Objectives (RTO)

| Component | RTO | Details |
|-----------|-----|---------|
| Full System | 1 hour | Restore from latest backup |
| API Only | 15 min | Restart services |
| Database | 30 min | Restore from backup |
| Configuration | 5 min | Rollback to previous version |

### 8.2 Recovery Point Objectives (RPO)

| Component | RPO | Details |
|-----------|-----|---------|
| Database | 1 hour | Daily + incremental backups |
| Application | 1 hour | Hourly snapshots |
| Configuration | 5 min | Version control |
| User Data | 24 hours | Full daily backups |

### 8.3 Backup Verification

**Weekly**: Restore to test environment  
**Monthly**: Full restore + smoke tests  
**Quarterly**: Complete disaster recovery drill

```bash
# Test restore
./restore.sh 20240606_020000

# Verify data integrity
docker exec marbism-mongodb mongosh --eval "db.listCollections()"

# Test critical workflows
curl -X POST https://localhost/api/health
```

### 8.4 Failover Procedure

**Automatic**:
- Liveness probe failure → Container restart (30s)
- Service unavailable → Horizontal pod autoscaler (60s)
- Database down → Automatic failover to replica (2s)

**Manual**:
1. Identify failed component (logs + metrics)
2. Isolate from traffic (remove from load balancer)
3. Restore from backup (30 min)
4. Verify functionality (smoke tests)
5. Re-add to traffic (gradual, 5% → 100%)

---

## 9. Security Operations

### 9.1 Vulnerability Management

#### Scanning Schedule
```
Daily:   Container image scan (Trivy)
Weekly:  Dependency audit (npm audit)
Monthly: Code SAST scan (SonarQube)
Monthly: Infrastructure scan (nessus)
Quarter: Penetration testing
```

#### Severity Response
```
Critical: Fix within 24 hours
High:     Fix within 7 days
Medium:   Fix within 30 days
Low:      Fix in next release
```

### 9.2 Access Control

#### Role-Based Access

**Admin**: Full system access, password rotation, audit logs  
**Engineering**: Deploy, debug, access logs (no delete)  
**Operations**: View dashboards, restart services  
**Read-Only**: View dashboards only  

#### Audit Logging
```
All administrative actions logged:
- User logins (success/failure)
- Deployments
- Configuration changes
- Database migrations
- Access to sensitive data
```

### 9.3 Security Hardening

#### SSL/TLS Certificate Management
```bash
# Check certificate expiry
openssl x509 -enddate -noout -in certs/fullchain.pem

# Auto-renewal
certbot renew --quiet  # Runs daily via cron

# Pin certificate
# Set HPKP header (optional, use with caution)
```

#### Secrets Management
```
Development:  .env.local (gitignored)
Staging:      Environment variables (CI/CD)
Production:   HashiCorp Vault (encrypted)
```

---

## 10. Operational Procedures

### 10.1 Deployment Procedure

**Pre-Deployment**
```bash
□ Run automated tests (unit + integration)
□ Code review approval
□ Staging deployment + smoke tests
□ Performance baseline check
□ Security scan (SAST)
```

**Deployment**
```bash
□ Announce in #deployments channel
□ Blue-green deployment (0 downtime)
□ Canary rollout (5% traffic)
□ Monitor error rates (watch for spikes)
□ Gradual rollout (10% → 25% → 50% → 100%)
□ Run post-deployment smoke tests
```

**Post-Deployment**
```bash
□ Monitor error rates for 1 hour
□ Check performance metrics
□ Verify no database corruption
□ Document deployment details
□ Post deployment summary to team
```

### 10.2 Database Migration Procedure

**Planning**
```
□ Write migration script
□ Test on replica of production data
□ Estimate duration
□ Plan rollback procedure
□ Schedule during low-traffic window
```

**Execution**
```
□ Enable read-only mode (warning banner)
□ Backup current state
□ Run migration script
□ Verify data integrity
□ Run sanity checks
□ Disable read-only mode
```

**Verification**
```
□ Query count matches (before/after)
□ Sampling of data looks correct
□ No orphaned records
□ Indexes rebuilt
□ Performance acceptable
```

### 10.3 Configuration Change Procedure

**Review & Approval**
```
□ Document reason for change
□ Identify affected components
□ Test in staging first
□ Get approval from 2 engineers
□ Plan rollback (revert config)
```

**Implementation**
```
□ Announce planned maintenance window
□ Create backup of current config
□ Apply configuration change
□ Monitor for errors (15 min)
□ Verify functionality
```

**Rollback (if needed)**
```
□ Revert to previous version (git)
□ Restart affected services
□ Verify system stability
□ Document incident
```

---

## 11. Team Responsibilities

### 11.1 On-Call Engineer

**Responsibilities**:
- Respond to incidents within SLA
- Investigate and diagnose issues
- Implement immediate mitigation
- Communicate status to stakeholders
- Document incident details
- Follow escalation path if needed

**Tools Access**:
- SSH to all production servers
- Database admin access
- Log aggregation platform
- Monitoring dashboards
- Incident management tool

### 11.2 Engineering Lead

**Responsibilities**:
- Review incident severity classification
- Approve temporary mitigations
- Oversee root cause analysis
- Schedule post-mortems
- Approve permanent fixes
- Update runbooks

### 11.3 Manager

**Responsibilities**:
- Track incident trends
- Identify systemic issues
- Coordinate with stakeholders
- Plan preventive improvements
- Review SLA compliance
- Team capacity planning

### 11.4 CTO

**Responsibilities**:
- Architecture decisions for critical issues
- Cross-team coordination
- Strategic improvements
- Customer escalations
- Industry best practices adoption

---

## 12. Documentation Requirements

### 12.1 Runbooks

Every operational procedure must have:
```
□ Title & purpose
□ Preconditions (what state system must be in)
□ Step-by-step instructions
□ Expected outputs/results
□ Troubleshooting section
□ Rollback procedure
□ Escalation contact
```

### 12.2 Post-Mortem Template

For all P1 and P2 incidents:
```
□ Timeline (when did each event occur)
□ Root cause (why did it happen)
□ Impact (affected users, duration, revenue)
□ What went well (quick detection, clear communication)
□ What went wrong (detection latency, unclear documentation)
□ Action items (prevent recurrence)
□ Responsible person (owner)
□ Target date (for fix)
```

### 12.3 Runbook Updates

```
□ After every incident (update related runbooks)
□ Quarterly review & refresh
□ When processes change
□ When new tools are added
□ Keep version history
```

---

## 13. Training & Certifications

### 13.1 Onboarding Checklist (New Engineer)

```
Week 1:
□ System architecture overview
□ Read deployment guide
□ Set up local environment
□ Understand incident procedures

Week 2:
□ Database architecture & queries
□ Monitoring dashboards walkthrough
□ Backup & recovery procedures
□ Shadow on-call engineer

Week 3:
□ Read all runbooks
□ Practice disaster recovery drill
□ Deploy to staging
□ First on-call rotation (with backup)
```

### 13.2 Certifications

- **Kubernetes Administration**: For K8s deployments
- **MongoDB Administration**: For database operations
- **Linux System Administration**: For infrastructure
- **Incident Command System (ICS)**: For incident management

---

## 14. SLA Compliance Tracking

### 14.1 Monthly Report

**Template**:
```
MARBISM Production SLA Report - June 2024

System Uptime:        99.87% (Target: 99.5%)
Downtime:             3.3 hours (Allowance: 3.6 hours)
Availability Credits: 0 (No credits due)

Response Times (p95):
  API:               156ms (Target: <200ms)
  Dashboard:         187ms (Target: <200ms)
  Database:          89ms (Target: <100ms)

Error Rates:
  Total Requests:    4.2M
  Errors:            2,100 (0.05%)
  Target:            <0.1%

Top Issues:
  1. MongoDB replica lag (resolved, 2 incidents)
  2. Cache miss spike (identified, added logging)
  3. API timeout on large exports (optimized query)

Credits Issued: $0
Credits Remaining: $0
```

### 14.2 Tracking Tools

- **Uptime Monitor**: Pingdom/Datadog for external monitoring
- **Incident Tracking**: Jira/Linear for issue management
- **Metrics**: Prometheus + custom dashboard
- **Logs**: ELK Stack or Datadog

---

## 15. Continuous Improvement

### 15.1 Monthly Retrospectives

**For teams with incidents**:
```
□ Review previous month's incidents
□ Identify patterns
□ Discuss preventive measures
□ Update documentation
□ Schedule training sessions
□ Celebrate improvements
```

### 15.2 Quarterly Reviews

```
□ SLA compliance summary
□ Performance trend analysis
□ Capacity utilization review
□ Technology stack updates
□ Team capability assessment
□ Plan improvements for next quarter
```

### 15.3 Annual Planning

```
□ Strategic architecture improvements
□ Technology migrations
□ Team growth & hiring
□ Customer feedback integration
□ Competitive analysis
□ Industry best practices adoption
```

---

## Summary

This SLA & Operations framework ensures:

✅ **99.5% uptime** commitment with clear measurement  
✅ **Rapid incident response** with defined severity levels  
✅ **Operational runbooks** for all critical procedures  
✅ **Performance optimization** strategies  
✅ **Comprehensive observability** (metrics, logs, traces)  
✅ **Disaster recovery** with defined RTO/RPO  
✅ **Clear team responsibilities** and escalation paths  
✅ **Continuous improvement** through retrospectives  

**Next Phase**: Phase 4 - Testing & Hardening (security audit, load testing, MARBISM UAT)

---

**Status**: Phase 3 Part 3 ✅ COMPLETE  
**Overall Progress**: 72% (8,696 of 12,000 target lines)  
**Production Readiness**: 100% (SLA Defined)  
**Next Review**: June 12, 2026
