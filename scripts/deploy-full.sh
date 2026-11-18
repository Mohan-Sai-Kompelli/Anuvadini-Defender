#!/usr/bin/env bash
# Full deploy: force-syncs the ENTIRE server/ code tree (all nested subfolders)
# and the ENTIRE client/src tree to the SAACMS prod VM, then rebuilds the
# client and restarts PM2. This exists because partial/file-by-file deploys
# left the VM's code silently stale (missing files, outdated schemas) — this
# script always ships everything, so nothing can be missed.
#
# Safe by design:
#   - Never touches server/.env (server-only secrets/config)
#   - Never touches server/node_modules, client/node_modules, uploads,
#     face_storage, face_previews (runtime data / installed deps)
#   - Additive only — copies/overwrites, never deletes remote files
#   - Client build is backed up before replace; auto-restored if build fails
#   - Idempotent — safe to re-run any time
#
# Requires: AzureVPN connected + ~/.ssh/ecoclub_deploy present.
# Usage:    bash scripts/deploy-full.sh
set -euo pipefail

VM=ankush@10.0.12.22
KEY="$HOME/.ssh/ecoclub_deploy"
SSHOPTS=(-i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=12)
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE=saacms

ssh_vm() { ssh "${SSHOPTS[@]}" "$VM" "$@"; }

# Recursively push every file under a local dir to the matching remote dir,
# preserving nested subfolders (the earlier shallow-glob approach missed
# controllers/api/v1/* — this walks the full tree instead).
#
# Reads find's output via process substitution, NOT `find | while read`.
# Piping into `while read` runs the loop in a subshell — a failed scp inside
# it can silently end that iteration without failing the outer script, which
# is exactly how files went stale on the VM without any error output.
push_tree() {
  local local_dir="$1" remote_dir="$2" f rel remote_path
  while IFS= read -r -d '' f; do
    rel="${f#"$local_dir"/}"
    remote_path="$remote_dir/$rel"
    ssh_vm "mkdir -p '$(dirname "$remote_path")'"
    scp "${SSHOPTS[@]}" "$f" "$VM:$remote_path"
  done < <(find "$local_dir" -type f -print0)
}

echo "▸ 1/7  Sanity: reach the VM"
ssh_vm 'echo "connected to $(hostname)"'

echo "▸ 2/7  Pre-deploy backup (safety net, timestamped, never overwritten)"
STAMP="$(ssh_vm 'date +%Y%m%d_%H%M%S')"
ssh_vm "cd $REMOTE && tar czf ~/saacms_predeploy_${STAMP}.tgz server/routes server/controllers server/models server/services server/utils server/middleware server/config server/index.js client/src 2>/dev/null; echo '  backup: ~/saacms_predeploy_${STAMP}.tgz'"

echo "▸ 3/7  Force-sync entire server/ code tree (all nested subfolders)"
for dir in config controllers middleware models routes scripts services utils; do
  push_tree "$ROOT/server/$dir" "$REMOTE/server/$dir"
  echo "  synced: server/$dir"
done
scp "${SSHOPTS[@]}" "$ROOT/server/index.js"     "$VM:$REMOTE/server/index.js"
scp "${SSHOPTS[@]}" "$ROOT/server/package.json" "$VM:$REMOTE/server/package.json"

echo "▸ 4/7  npm install (server) — picks up any new package.json deps"
ssh_vm "cd $REMOTE/server && npm install --no-audit --no-fund > /tmp/saacms_npm.log 2>&1 && echo '  npm install OK' || (echo '  npm install FAILED'; tail -n 20 /tmp/saacms_npm.log)"

echo "▸ 5/7  Force-sync entire client/src tree"
push_tree "$ROOT/client/src" "$REMOTE/client/src"
echo "  synced: client/src"

echo "▸ 6/7  Rebuild client + restart PM2 (build backup first, auto-restore on fail)"
ssh_vm "cd $REMOTE/client && rm -rf build_bak_predeploy && cp -r build build_bak_predeploy 2>/dev/null; \
  if REACT_APP_API_URL=/api CI=false GENERATE_SOURCEMAP=false npm run build > /tmp/saacms_build.log 2>&1 && test -f build/index.html; then \
    echo '  client build OK'; \
  else \
    echo '  client build FAILED — restoring previous build'; tail -n 40 /tmp/saacms_build.log; \
    rm -rf build && mv build_bak_predeploy build; exit 1; \
  fi; \
  pm2 restart saacms-server && pm2 save"

echo "▸ 7/7  Verify"
sleep 5
echo -n "  /api/health: "; ssh_vm "curl -s -o /dev/null -w '%{http_code}\n' localhost:9090/api/health || true"
echo -n "  frontend:    "; ssh_vm "curl -s -o /dev/null -w '%{http_code}\n' localhost:9090/ || true"
echo "  pm2 status:"
ssh_vm "pm2 list"
echo "  recent errors (should be none after this restart's timestamp):"
ssh_vm "pm2 logs saacms-server --lines 30 --nostream 2>/dev/null | grep -iE 'error' | tail -10 || echo '   (none)'"

echo "  checksum spot-check (local vs remote, catches silent staleness):"
MISMATCH=0
for dir in config controllers middleware models routes scripts services utils; do
  while IFS= read -r -d '' f; do
    rel="${f#"$ROOT/server/$dir"/}"
    local_md5=$(md5sum "$f" | awk '{print $1}')
    remote_md5=$(ssh_vm "md5sum '$REMOTE/server/$dir/$rel' 2>/dev/null | awk '{print \$1}'")
    if [ "$local_md5" != "$remote_md5" ]; then
      echo "    STALE server/$dir/$rel"
      MISMATCH=1
    fi
  done < <(find "$ROOT/server/$dir" -type f -print0)
done
while IFS= read -r -d '' f; do
  rel="${f#"$ROOT/client/src"/}"
  local_md5=$(md5sum "$f" | awk '{print $1}')
  remote_md5=$(ssh_vm "md5sum '$REMOTE/client/src/$rel' 2>/dev/null | awk '{print \$1}'")
  if [ "$local_md5" != "$remote_md5" ]; then
    echo "    STALE client/src/$rel"
    MISMATCH=1
  fi
done < <(find "$ROOT/client/src" -type f -print0)
if [ "$MISMATCH" -eq 0 ]; then
  echo "    all synced files match remote ✓"
else
  echo "    ⚠ one or more files did not transfer — re-run this script to retry"
fi

echo "✅ Deploy complete."
