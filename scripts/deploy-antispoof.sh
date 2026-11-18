#!/usr/bin/env bash
# Deploy the anti-spoof feature (server-side PAD + super-admin "Fake Attempts" +
# Face-Report "Check Anti-Spam Faces" scan + green-ring fix) to the SAACMS prod
# VM. Selective-file scp (never clobbers the server-only .env edits), re-applies
# the check.py host/port edit, ships the anti-spam model, rebuilds the client,
# restarts PM2, and verifies. Idempotent + safe to re-run.
#
# Requires: AzureVPN connected + ~/.ssh/ecoclub_deploy present.
# Usage:    bash scripts/deploy-antispoof.sh
set -euo pipefail

VM=ankush@10.0.12.22
KEY="$HOME/.ssh/ecoclub_deploy"
SSHOPTS=(-i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=12)
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Relative to the REMOTE home (~/saacms = /home/ankush/saacms). Must NOT use a
# local '~' — that would expand to this Mac's path before ssh/rsync see it.
REMOTE=saacms

ssh_vm() { ssh "${SSHOPTS[@]}" "$VM" "$@"; }

# Single-file push. Usage: push <local-file> <VM:remote-path>
push() {
  local local_path="$1" remote_spec="$2" remote_path remote_dir
  remote_path="${remote_spec#*:}"
  remote_dir="$(dirname "$remote_path")"
  ssh_vm "mkdir -p '$remote_dir'"
  scp "${SSHOPTS[@]}" "$local_path" "$VM:$remote_path"
}

# Recursive dir push (rsync replacement). Reads via process substitution, NOT
# `find | while read` — piping into a while loop runs it in a subshell, where
# a failed scp can silently end that iteration without failing the script.
# Extra args (if any) are passed straight to `find` as exclusion predicates,
# e.g. push_dir "$src" "$dst" -name venv -o -name '.git' -prune -o
# Usage: push_dir <local_dir> <remote_dir> [find-prune-args...]
push_dir() {
  local local_dir="${1%/}" remote_dir="${2%/}" f rel remote_path
  shift 2
  while IFS= read -r -d '' f; do
    rel="${f#"$local_dir"/}"
    remote_path="$remote_dir/$rel"
    ssh_vm "mkdir -p '$(dirname "$remote_path")'"
    scp "${SSHOPTS[@]}" "$f" "$VM:$remote_path"
  done < <(find "$local_dir" "$@" -type f -print0)
}

echo "▸ 0/6  Sanity: reach the VM"
ssh_vm 'echo "connected to $(hostname)"'

echo "▸ 1/6  face-back: antispoof_service.py + check.py"
push "$ROOT/face-back/antispoof_service.py" "$VM:$REMOTE/face-back/antispoof_service.py"
push "$ROOT/face-back/check.py"             "$VM:$REMOTE/face-back/check.py"
# Re-apply the SERVER-ONLY runtime edit (local check.py is 50011/debug=True; the
# deployed one must bind 127-only port 9092 with debug off).
ssh_vm "cd $REMOTE/face-back && sed -i -E 's/port=50011/port=9092/; s/debug=True/debug=False/' check.py && echo -n '  check.py app.run -> ' && grep -m1 'app.run' check.py"

echo "▸ 2/6  anti-spam model (src + weights) -> $REMOTE/anti-spam"
# Push everything except venv/git/cache/dataset-image clutter (no local --delete
# equivalent here — additive-only, matching deploy-full.sh's safety model).
push_dir "$ROOT/anti-spam" "$REMOTE/anti-spam" \
  \( -name venv -o -name '.venv' -o -name '.git' -o -name '__pycache__' -o -name images -o -name datasets \) -prune -o \
  ! -name '*.jpg' ! -name '.DS_Store'
ssh_vm "ls -1 $REMOTE/anti-spam/resources/anti_spoof_models/ && echo '  anti-spam weights present'"

echo "▸ 3/6  server files"
push "$ROOT/server/models/SpoofAttempt.js"         "$VM:$REMOTE/server/models/SpoofAttempt.js"
push "$ROOT/server/routes/attendance.js"           "$VM:$REMOTE/server/routes/attendance.js"
push "$ROOT/server/routes/superadmin.js"           "$VM:$REMOTE/server/routes/superadmin.js"
push "$ROOT/server/services/faceVerifyService.js"  "$VM:$REMOTE/server/services/faceVerifyService.js"
push "$ROOT/server/services/faceStorageService.js" "$VM:$REMOTE/server/services/faceStorageService.js"
push "$ROOT/server/services/emailService.js"       "$VM:$REMOTE/server/services/emailService.js"
push "$ROOT/server/package.json"                   "$VM:$REMOTE/server/package.json"
# Ensure the new mail dep is present on the VM (incremental — only adds nodemailer).
ssh_vm "cd $REMOTE/server && npm install nodemailer@^6.10.1 --no-audit --no-fund >/tmp/saacms_npm.log 2>&1 && echo '  nodemailer installed' || (echo '  npm install FAILED'; tail -n 15 /tmp/saacms_npm.log)"

echo "▸ 4/6  client source"
# Sync the WHOLE super-admin pages dir — the VM client is behind and is missing
# pages my App.js imports (NetworkPulse, RegistrationImages); a partial sync left
# dangling imports and broke the build. This keeps App.js's imports all resolvable.
push_dir "$ROOT/client/src/pages/superadmin" "$REMOTE/client/src/pages/superadmin"
push "$ROOT/client/src/App.js"                       "$VM:$REMOTE/client/src/App.js"
push "$ROOT/client/src/components/SuperAdminLayout.js" "$VM:$REMOTE/client/src/components/SuperAdminLayout.js"
push "$ROOT/client/src/services/api.js"              "$VM:$REMOTE/client/src/services/api.js"

echo "▸ 5/6  rebuild client + restart PM2 (build backup first, auto-restore on fail)"
ssh_vm "cd $REMOTE/client && rm -rf build_bak_predeploy && cp -r build build_bak_predeploy 2>/dev/null; \
  if REACT_APP_API_URL=/api CI=false GENERATE_SOURCEMAP=false npm run build > /tmp/saacms_build.log 2>&1 && test -f build/index.html; then \
    echo '  client build OK'; \
  else \
    echo '  client build FAILED — restoring previous build'; tail -n 25 /tmp/saacms_build.log; \
    rm -rf build && mv build_bak_predeploy build; exit 1; \
  fi; \
  pm2 restart saacms-faceback saacms-server && pm2 save"

echo "▸ 6/6  verify"
sleep 3
echo -n "  /api/health: "; ssh_vm "curl -s -o /dev/null -w '%{http_code}\n' localhost:9090/api/health || true"
echo "  faceback PAD log:"; ssh_vm "pm2 logs saacms-faceback --lines 40 --nostream 2>/dev/null | grep -iE 'antispoof|PAD' | tail -3 || echo '   (no antispoof log yet — loads on first verify/scan)'"

echo "  checksum spot-check (local vs remote, catches silent staleness):"
MISMATCH=0
check_one() {
  local local_path="$1" remote_path="$2" local_md5 remote_md5
  local_md5=$(md5sum "$local_path" | awk '{print $1}')
  remote_md5=$(ssh_vm "md5sum '$remote_path' 2>/dev/null | awk '{print \$1}'")
  if [ "$local_md5" != "$remote_md5" ]; then
    echo "    STALE ${remote_path#$REMOTE/}"
    MISMATCH=1
  fi
}
check_one "$ROOT/face-back/antispoof_service.py" "$REMOTE/face-back/antispoof_service.py"
check_one "$ROOT/server/models/SpoofAttempt.js"         "$REMOTE/server/models/SpoofAttempt.js"
check_one "$ROOT/server/routes/attendance.js"           "$REMOTE/server/routes/attendance.js"
check_one "$ROOT/server/routes/superadmin.js"           "$REMOTE/server/routes/superadmin.js"
check_one "$ROOT/server/services/faceVerifyService.js"  "$REMOTE/server/services/faceVerifyService.js"
check_one "$ROOT/server/services/faceStorageService.js" "$REMOTE/server/services/faceStorageService.js"
check_one "$ROOT/server/services/emailService.js"       "$REMOTE/server/services/emailService.js"
check_one "$ROOT/client/src/App.js"                       "$REMOTE/client/src/App.js"
check_one "$ROOT/client/src/components/SuperAdminLayout.js" "$REMOTE/client/src/components/SuperAdminLayout.js"
check_one "$ROOT/client/src/services/api.js"              "$REMOTE/client/src/services/api.js"
if [ "$MISMATCH" -eq 0 ]; then
  echo "    all synced files match remote ✓"
else
  echo "    ⚠ one or more files did not transfer — re-run this script to retry"
fi

echo "✅ Deploy complete. Open https://ecoclubs.aicte-india.org/superadmin/face-captures → an employee → 'Check Anti-Spam Faces'."
