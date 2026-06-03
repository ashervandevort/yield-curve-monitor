#!/usr/bin/env bash
# Install weekday cron jobs for yield-curve data sync (deploy252 VPS).
#
# Uses /var/www/yield-curve symlink so jobs survive release swaps.
# Logs: ~/logs/yield-curve/*.log
#
# Manual run on VPS:
#   bash /var/www/yield-curve/backend/scripts/cron/install_crontab.sh
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/var/www/yield-curve}"
BACKEND="${DEPLOY_PATH}/backend"
LOG_DIR="${HOME}/logs/yield-curve"
MARKER="yield-curve/backend/scripts/cron"

mkdir -p "$LOG_DIR"

if [ ! -x "${BACKEND}/venv/bin/python" ]; then
  echo "WARN: ${BACKEND}/venv/bin/python not found — skipping crontab install"
  exit 0
fi

cron_line() {
  local schedule="$1"
  local script="$2"
  local logfile="$3"
  printf '%s cd %s && ./venv/bin/python scripts/cron/%s >> %s/%s 2>&1\n' \
    "$schedule" "$BACKEND" "$script" "$LOG_DIR" "$logfile"
}

NEW_BLOCK=$(cat <<EOF
# ${MARKER} — weekdays after US close (UTC); staggered to avoid FRED 429 bursts
$(cron_line "0 23 * * 1-5" "fred_daily.py" "fred.log")
$(cron_line "15 23 * * 1-5" "macro_daily.py" "macro.log")
$(cron_line "30 23 * * 1-5" "futures_daily.py" "futures.log")
$(cron_line "45 23 * * 1-5" "fomc_daily.py" "fomc.log")
EOF
)

{
  crontab -l 2>/dev/null | grep -v "$MARKER" || true
  echo "$NEW_BLOCK"
} | crontab -

echo "✓ yield-curve crontab installed (logs: ${LOG_DIR})"
crontab -l | grep "$MARKER" || true
