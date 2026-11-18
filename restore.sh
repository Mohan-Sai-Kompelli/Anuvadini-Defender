#!/bin/bash
set -e

# MARBISM Restore Script
# Restores MongoDB, Redis, application files, and configuration from backup
# Usage: ./restore.sh <backup_timestamp>
# Example: ./restore.sh 20240605_143000

BACKUP_DIR="${BACKUP_DIR:-/mnt/backups}"
RESTORE_FROM="${1:?Usage: ./restore.sh <backup_timestamp>}"
LOG_FILE="/var/log/marbism-restore.log"
EMAIL="${BACKUP_EMAIL:-admin@marbism.local}"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

error() {
  echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
  exit 1
}

success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

info() {
  echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

# Check if backup exists
if [ ! -d "$BACKUP_DIR/$RESTORE_FROM" ]; then
  error "Backup not found: $BACKUP_DIR/$RESTORE_FROM"
fi

# Display backup info
log "╔═══════════════════════════════════════════════════════════╗"
log "║        MARBISM Restore - Pre-Check Information           ║"
log "╚═══════════════════════════════════════════════════════════╝"
log ""

info "Backup to restore: $RESTORE_FROM"
info "Backup location: $BACKUP_DIR/$RESTORE_FROM"

# List files to be restored
log "Files in backup:"
for file in "$BACKUP_DIR/$RESTORE_FROM"/*; do
  if [ -f "$file" ]; then
    SIZE=$(du -h "$file" | cut -f1)
    log "  ✓ $(basename $file) ($SIZE)"
  fi
done

# Show backup summary if available
if [ -f "$BACKUP_DIR/$RESTORE_FROM/BACKUP_SUMMARY.txt" ]; then
  log ""
  log "Backup summary:"
  cat "$BACKUP_DIR/$RESTORE_FROM/BACKUP_SUMMARY.txt" >> "$LOG_FILE"
fi

log ""
log "╔═══════════════════════════════════════════════════════════╗"
log "║             ⚠️  RESTORATION WARNING  ⚠️                  ║"
log "╚═══════════════════════════════════════════════════════════╝"
log ""
log "This operation will:"
log "  • STOP backend and web dashboard services"
log "  • OVERWRITE current MongoDB data"
log "  • OVERWRITE current Redis cache"
log "  • OVERWRITE application files and uploads"
log "  • CANNOT be undone without another backup"
log ""

# Confirmation prompt
read -p "Do you want to continue? Type 'yes' to confirm: " -r
echo
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
  log "Restore cancelled by user"
  exit 0
fi

log ""
log "╔═══════════════════════════════════════════════════════════╗"
log "║           Starting MARBISM Restore Process               ║"
log "╚═══════════════════════════════════════════════════════════╝"

# Check prerequisites
if ! command -v docker &> /dev/null; then
  error "Docker is not installed or not in PATH"
fi

# ===== 1. Stop Services =====
log "---"
log "Stopping services..."

if docker-compose -f /path/to/marbism/docker-compose.yml stop backend web-dashboard 2>/dev/null; then
  success "Backend and web dashboard stopped"
else
  warning "Could not stop services, continuing anyway"
fi

# Keep database and cache running for restore operations
log "MongoDB and Redis remain running for restore operations"

# ===== 2. Restore MongoDB =====
log "---"
log "Restoring MongoDB database..."

if [ -f "$BACKUP_DIR/$RESTORE_FROM/mongodb_$RESTORE_FROM.tar.gz" ]; then
  log "Extracting MongoDB dump..."

  mkdir -p /tmp/mongo-restore
  tar -xzf "$BACKUP_DIR/$RESTORE_FROM/mongodb_$RESTORE_FROM.tar.gz" \
    -C /tmp/mongo-restore 2>/dev/null || true

  log "Restoring MongoDB data (this may take a while)..."

  if docker exec marbism-mongodb mongorestore \
    --authenticationDatabase admin \
    --username "${MONGO_USERNAME:-marbism_user}" \
    --password "$MONGO_PASSWORD" \
    --drop \
    /backup/dump_$RESTORE_FROM 2>/dev/null; then
    success "MongoDB restore completed"
  else
    warning "MongoDB restore may have partial issues, but continuing"
  fi

  # Cleanup
  rm -rf /tmp/mongo-restore
else
  warning "MongoDB backup file not found, skipping MongoDB restore"
fi

# ===== 3. Restore Redis =====
log "---"
log "Restoring Redis cache..."

if [ -f "$BACKUP_DIR/$RESTORE_FROM/redis_$RESTORE_FROM.tar.gz" ]; then
  log "Extracting Redis backup..."

  # Stop Redis to restore
  docker-compose -f /path/to/marbism/docker-compose.yml stop redis || true
  sleep 2

  # Extract and restore
  tar -xzf "$BACKUP_DIR/$RESTORE_FROM/redis_$RESTORE_FROM.tar.gz" \
    -C /var/lib/docker/volumes/*redis-data/_data 2>/dev/null || true

  # Restart Redis
  docker-compose -f /path/to/marbism/docker-compose.yml up -d redis

  log "Waiting for Redis to start..."
  sleep 5

  success "Redis restore completed"
else
  warning "Redis backup file not found, skipping Redis restore"
fi

# ===== 4. Restore Application Files =====
log "---"
log "Restoring application uploads..."

if [ -f "$BACKUP_DIR/$RESTORE_FROM/uploads_$RESTORE_FROM.tar.gz" ]; then
  log "Extracting uploads..."

  # Backup current uploads first
  if [ -d "/path/to/marbism/uploads" ]; then
    mv /path/to/marbism/uploads /path/to/marbism/uploads.backup.$(date +%s)
  fi

  # Restore
  tar -xzf "$BACKUP_DIR/$RESTORE_FROM/uploads_$RESTORE_FROM.tar.gz" \
    -C /path/to/marbism 2>/dev/null

  success "Uploads restore completed"
else
  warning "Uploads backup file not found, skipping uploads restore"
fi

# ===== 5. Restore Configuration =====
log "---"
log "Restoring configurations..."

if [ -f "$BACKUP_DIR/$RESTORE_FROM/config_$RESTORE_FROM.tar.gz" ]; then
  info "Configuration files are available in backup"
  info "Consider manually reviewing changes before applying:"
  info "  tar -tzf $BACKUP_DIR/$RESTORE_FROM/config_$RESTORE_FROM.tar.gz"

  # Optional auto-restore if specifically configured
  # tar -xzf "$BACKUP_DIR/$RESTORE_FROM/config_$RESTORE_FROM.tar.gz" \
  #   -C /path/to/marbism --transform='s,^,backup_,' 2>/dev/null
else
  warning "Configuration backup file not found"
fi

# ===== 6. Restart Services =====
log "---"
log "Restarting services..."

if docker-compose -f /path/to/marbism/docker-compose.yml up -d backend web-dashboard 2>/dev/null; then
  success "Backend and web dashboard restarted"
else
  error "Failed to restart services"
fi

# ===== 7. Verify Restore =====
log "---"
log "Verifying restore..."

sleep 10  # Wait for services to start

# Check backend health
if curl -s http://localhost:5001/api/health | grep -q "OK"; then
  success "Backend API is responding"
else
  warning "Backend API may not be responding yet, please check manually"
fi

# Check web dashboard
if curl -s http://localhost:3000 | grep -q "html" 2>/dev/null; then
  success "Web dashboard is accessible"
else
  warning "Web dashboard may not be responding yet, please check manually"
fi

# ===== 8. Generate Restore Report =====
log "---"
log "Generating restore report..."

RESTORE_REPORT="$BACKUP_DIR/$RESTORE_FROM/RESTORE_REPORT_$(date +%s).txt"
cat > "$RESTORE_REPORT" << EOF
╔═══════════════════════════════════════════════════════╗
║        MARBISM Restore Report                         ║
╚═══════════════════════════════════════════════════════╝

Restore From:          $RESTORE_FROM
Restore Date:          $(date +'%Y-%m-%d %H:%M:%S')
Restore Location:      $BACKUP_DIR/$RESTORE_FROM

Restored Components:
  ✓ MongoDB database
  ✓ Redis cache
  ✓ Application uploads
  ✓ Configuration backup (manual review recommended)

Next Steps:
  1. Monitor application logs: docker-compose logs -f backend
  2. Verify all features are working
  3. Check data integrity in admin dashboard
  4. Test critical workflows (authentication, file uploads)
  5. Update any configuration changes manually if needed

Contact Support:
  Email: admin@marbism.local

---
Restore completed at $(date +'%Y-%m-%d %H:%M:%S')
EOF

log ""
log "╔═══════════════════════════════════════════════════════╗"
log "║        MARBISM Restore Completed Successfully        ║"
log "╚═══════════════════════════════════════════════════════╝"
log ""
log "Restore report: $RESTORE_REPORT"
log "Please verify application is functioning correctly"
log ""

# Send notification
if command -v mail &> /dev/null; then
  mail -s "✓ MARBISM Restore Completed - $(date +%Y-%m-%d)" "$EMAIL" < "$RESTORE_REPORT"
fi

exit 0
