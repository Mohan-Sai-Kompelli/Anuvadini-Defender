# MARBISM Monitoring Dashboards

**Purpose**: Grafana dashboard configurations for production monitoring  
**Format**: Dashboard descriptions + queries + alerts

---

## Dashboard 1: System Overview

### Description
High-level view of system health for on-call engineers and managers.

### Key Panels

**1. System Status Grid**
```
Status Components:
- Backend API: ● Online/Offline
- Web Dashboard: ● Online/Offline
- Database: ● Online/Offline
- Cache: ● Online/Offline
- Backups: ● Success/Failure (last 24h)
```

**2. Current Metrics (4-cell grid)**
```
Cell 1: API Response Time (p95)
Query: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
Target: <200ms (green), >200ms (yellow), >2s (red)

Cell 2: Error Rate
Query: rate(http_requests_total{status=~"5.."}[5m])
Target: <0.1% (green), 0.1-0.5% (yellow), >0.5% (red)

Cell 3: Database Connections Active
Query: mongodb_connections_active
Target: <10 (green), 10-15 (yellow), >15 (red)

Cell 4: Disk Space Free
Query: node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} * 100
Target: >30% (green), 20-30% (yellow), <20% (red)
```

**3. Request Volume (time series)**
```
Query: rate(http_requests_total[5m])
Shows: Total requests per second, colored by status code
Baseline: Should be steady within expected business hours
```

**4. Error Timeline (area chart)**
```
Query: rate(http_requests_total{status=~"5.."}[5m])
Shows: 5xx error rate over time (last 24 hours)
Alert: Any spike > 0.5% should trigger investigation
```

**5. Top Endpoints by Traffic (bar chart)**
```
Query: topk(10, rate(http_requests_total[5m]) by (endpoint))
Shows: Which endpoints are busiest
Use: Identify bottlenecks, unexpected traffic spikes
```

**6. Recent Alerts (table)**
```
Shows: List of currently firing alerts
Columns: Severity | Alert Name | Time | Value
Auto-refresh: Every 30 seconds
Click: Links to relevant dashboard
```

---

## Dashboard 2: API Performance

### Description
Deep dive into backend API performance metrics.

### Key Panels

**1. Response Time Distribution**
```
Query: 
- histogram_quantile(0.50, rate(http_request_duration_seconds_bucket[5m])) as p50
- histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) as p95
- histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m])) as p99

Graph: Line chart with 3 series
Target: p50 <100ms, p95 <200ms, p99 <1s
```

**2. Response Time by Endpoint (heatmap)**
```
Query: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) by (endpoint)

Shows: Which endpoints are slowest (darker = slower)
Focus: Any endpoint > 500ms needs investigation
```

**3. Request Rate by Status (stacked area)**
```
Query: rate(http_requests_total[5m]) by (status)

Stacks:
- 2xx (green)
- 3xx (blue)
- 4xx (yellow)
- 5xx (red)

Baseline: 4xx should be <5%, 5xx should be <0.5%
```

**4. Endpoint Latency Comparison (bar chart)**
```
Query: topk(15, histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) by (endpoint))

Shows: Top 15 slowest endpoints
Action: Profile and optimize top 3

Example output:
/api/reports/export        450ms
/api/attendance/search     380ms
/api/organizations/:id     210ms
```

**5. Request Size Distribution (histogram)**
```
Query: http_request_size_bytes

Shows: Distribution of request payload sizes
Alert: If average >10MB, might indicate inefficient queries
```

**6. HTTP Status Code Breakdown (pie chart)**
```
Query: increase(http_requests_total[5m]) by (status)

Shows: Percentage of each status code
Target: 95%+ should be 2xx or 3xx
```

---

## Dashboard 3: Database Performance

### Description
MongoDB performance and health monitoring.

### Key Panels

**1. Database Health Status**
```
Query: up{job="mongodb"}

Shows: Online (1) / Offline (0)
Color: Green/Red
Alert: Triggers if mongodb down for >1 minute
```

**2. Connection Pool**
```
Query: 
- mongodb_connections_active
- mongodb_connections_available

Graph: Line chart
Target: Active <15, Available >5
Alert: If active/available > 0.8, trigger warning
```

**3. Query Operations (rate)**
```
Query: 
- rate(mongodb_op_duration_seconds_bucket{le="+Inf"}[5m]) as total_queries
- rate(mongodb_op_duration_seconds_bucket{operation="find"}[5m]) as finds
- rate(mongodb_op_duration_seconds_bucket{operation="insert"}[5m]) as inserts
- rate(mongodb_op_duration_seconds_bucket{operation="update"}[5m]) as updates

Graph: Stacked area
Shows: Query volume by operation type
Baseline: Analyze to find anomalies
```

**4. Query Performance (p95 latency)**
```
Query: histogram_quantile(0.95, rate(mongodb_op_duration_seconds_bucket[5m]))

Shows: 95th percentile query time
Target: <100ms
Alert: If >200ms for sustained period
```

**5. Replication Lag**
```
Query: mongodb_replication_set_oplog_diff_milliseconds

Shows: How far secondary replicas are behind primary
Target: <100ms (should be nearly instant)
Alert: If >1000ms, replication is falling behind
```

**6. Database Size**
```
Query: mongodb_database_size_bytes

Shows: Total database size
Trend: Should grow steadily, not spike
Alert: If growing >1GB/day, investigate
```

**7. Collection Sizes (table)**
```
Query: mongodb_collection_size_bytes

Shows: Size of each collection
Top consumers: attendance, consultationLogs, outreachActivities
Use: Identify bloated collections needing archival
```

---

## Dashboard 4: Infrastructure & System

### Description
System-level metrics (CPU, memory, disk, network).

### Key Panels

**1. System Status Grid**
```
Shows 4 metrics side-by-side:

CPU Usage:
Query: (1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m]))) * 100
Target: <80% (green), 80-90% (yellow), >90% (red)

Memory Usage:
Query: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes * 100
Target: <85% (green), 85-95% (yellow), >95% (red)

Disk Space:
Query: node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} * 100
Target: >20% (green), 10-20% (yellow), <10% (red)

Network I/O:
Query: rate(node_network_transmit_bytes_total[5m])
Shows: MB/s transmitted (baseline to compare)
```

**2. CPU Usage Timeline**
```
Query: rate(node_cpu_seconds_total[5m]) * 100 by (cpu)

Shows: CPU usage per core over 24 hours
Alert: If any core >90% for extended period
```

**3. Memory Breakdown (stacked area)**
```
Query:
- node_memory_MemTotal_bytes as Total
- node_memory_MemAvailable_bytes as Available
- node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes as Used

Shows: Memory utilization over time
Trend: Stable or gradual growth (no sudden spikes)
```

**4. Disk I/O (reads and writes)**
```
Query:
- rate(node_disk_read_bytes_total[5m]) as reads
- rate(node_disk_write_bytes_total[5m]) as writes

Shows: Disk read/write throughput in MB/s
Baseline: Compare to disk capacity
Alert: If consistently >90% capacity
```

**5. Network Traffic**
```
Query:
- rate(node_network_transmit_bytes_total[5m]) as sent
- rate(node_network_receive_bytes_total[5m]) as received

Shows: Inbound/outbound traffic in MB/s
Baseline: Should correlate with request volume
```

**6. Temperature & Sensors (if available)**
```
Query: node_hwmon_temp_celsius

Shows: CPU/system temperature
Alert: If >80°C, check cooling systems
```

---

## Dashboard 5: Business Metrics

### Description
Application-level metrics important to business operations.

### Key Panels

**1. Daily Active Users**
```
Query: count(distinct http_requests_total) by (user_id)

Shows: Number of unique users accessing system daily
Trend: Should be stable or growing
Alert: Unexpected drop > 20% from baseline
```

**2. Feature Usage (pie chart)**
```
Query: increase(feature_requests_total[1d]) by (feature_name)

Shows: Which features used most (attendance, leave, reports, etc.)
Use: Identify unused features, plan improvements
```

**3. Authentication Success Rate**
```
Query: rate(authentication_success_total[5m]) / rate(authentication_attempts_total[5m])

Shows: Percentage of login attempts that succeed
Target: >99.5%
Alert: If <95%, investigate account issues or credential problems
```

**4. Data Integrity Events**
```
Query: increase(data_integrity_errors_total[1d]) by (type)

Shows: 
- Photo tampering detected
- GPS spoofing detected
- Device binding violations
- Geofence violations

Target: Should be very low (<1% of attempts)
Trend: Watch for increases (might indicate new attack patterns)
```

**5. Approval Chain Performance**
```
Query: histogram_quantile(0.95, rate(approval_processing_duration_seconds_bucket[5m]))

Shows: Median time to approve leave requests
Target: <5 seconds to load approval interface
Alert: If >10s, check database performance
```

**6. Report Generation**
```
Query: rate(report_generation_requests_total[5m])

Shows: How many reports generated per second
Trend: Peaks on month-end/week-end
Alert: If >10/sec, might cause performance issues
```

---

## Dashboard 6: Backup & Disaster Recovery

### Description
Backup system health and recovery capabilities.

### Key Panels

**1. Backup Status**
```
Shows:
- Last backup: timestamp
- Status: Success / Failed / Running
- Size: MB
- Duration: minutes
- Next scheduled: time

Color: Green (success), Red (failed), Yellow (running)
```

**2. Backup History (bar chart)**
```
Query: backup_duration_seconds by (date)

Shows: How long each daily backup takes
Target: <2 hours
Alert: If >3 hours, might not complete before next day's backup
```

**3. Backup Size Trend (line chart)**
```
Query: backup_size_bytes by (date)

Shows: Size of each backup over time
Trend: Should grow gradually (slowly)
Alert: Sudden spike might indicate data corruption or misconfig
```

**4. Backup Retention (table)**
```
Shows:
- Backup Date | Size | Status | Verified
- [date 1]   | 45GB | ✓      | ✓
- [date 2]   | 47GB | ✓      | ✓
- ...

Retention: 30 days local, 90 days S3
Action: Manually verify oldest backups can restore
```

**5. Recovery Test Results**
```
Shows results of monthly recovery drills:
- Last Test: 2024-06-01
- Result: Success
- RTO Achieved: 28 minutes
- Data Integrity: ✓
- Notes: All systems recovered correctly
```

**6. Backup Copy to S3 (if used)**
```
Query: s3_backup_upload_duration_seconds

Shows: How long backup upload takes
Baseline: <30 minutes for 50GB
Alert: If >1 hour, investigate S3 connectivity
```

---

## Alert Configuration

### Critical Alerts (Immediate Page)

```yaml
# 1. API Down
expr: up{job="marbism-backend"} == 0
for: 1m
severity: critical

# 2. Database Down
expr: up{job="mongodb"} == 0
for: 1m
severity: critical

# 3. High Error Rate
expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.01  # 1%
for: 5m
severity: critical

# 4. Disk Critical
expr: node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} < 0.05
for: 5m
severity: critical

# 5. Memory Critical
expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes > 0.95
for: 5m
severity: critical

# 6. Backup Failed
expr: time() - backup_last_success_timestamp > 86400  # 24 hours
for: 1m
severity: critical
```

### Warning Alerts (Email Notification)

```yaml
# 1. Slow API (p99 > 2s)
expr: histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m])) > 2
for: 10m
severity: warning

# 2. High Memory (>85%)
expr: node_memory_usage / node_memory_total > 0.85
for: 15m
severity: warning

# 3. High CPU (>80%)
expr: rate(node_cpu_seconds_total{mode="user"}[5m]) > 0.8
for: 10m
severity: warning

# 4. Database Replication Lag
expr: mongodb_replication_lag_ms > 1000
for: 5m
severity: warning

# 5. Connection Pool Nearly Exhausted
expr: mongodb_connections_active / mongodb_connections_available > 0.8
for: 2m
severity: warning
```

---

## Dashboard Refresh Rates

| Dashboard | Refresh | Use Case |
|-----------|---------|----------|
| System Overview | 30 seconds | On-call monitoring |
| API Performance | 10 seconds | During incident |
| Database | 30 seconds | Operations monitoring |
| Infrastructure | 1 minute | Long-term trend |
| Business Metrics | 5 minutes | Management reports |
| Backup | 1 hour | Verification |

---

## Grafana Folder Structure

```
MARBISM Production
├── 01-System-Overview
├── 02-API-Performance
├── 03-Database-Performance
├── 04-Infrastructure
├── 05-Business-Metrics
├── 06-Backup-DR
├── 07-Alerts (no visualizations, just alert status)
└── 08-Custom (team-specific dashboards)
```

---

## Creating Custom Alerts

### Example: High Consultation Log Latency

```yaml
- alert: HighConsultationLogLatency
  expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{endpoint=~"/api/consultation.*"}[5m])) > 2
  for: 5m
  labels:
    severity: warning
    component: api
  annotations:
    summary: "High consultation log endpoint latency"
    description: "Consultation log endpoint p95 latency is {{ $value }}s (threshold: 2s)"
    dashboard: "http://grafana:3000/d/api-performance"
    runbook: "https://wiki.internal/runbooks/high-latency"
```

---

## Notification Channels

**Configure in Grafana**:

1. **Slack**: #marbism-alerts
   - All critical alerts
   - Post resolution confirmation

2. **Email**: ops@marbism.local
   - All warning + critical alerts
   - Daily summary

3. **PagerDuty**: ops on-call rotation
   - Critical alerts only
   - Phone call escalation

4. **SMS**: On-call phone
   - Database down only
   - System completely unreachable

---

**Last Updated**: June 6, 2026
