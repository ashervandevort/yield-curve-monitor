#!/usr/bin/env bash
# Install weekday cron jobs for yield-curve data sync (deploy252 VPS).
#
# Schedule (~6:30–7:15 PM ET / 22:30–23:15 UTC during EDT):
#   FRED spot (primary) → macro → futures → FOMC/Polymarket (staggered)
#   FRED catch-up retries when spot still behind expected close (same night + morning)
#   Sunday 17:00 UTC → CTD recompute + optional overrides JSON
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
# ${MARKER} — after US cash close (22:30 UTC ≈ 6:30 PM ET in EDT)
$(cron_line "30 22 * * 1-5" "fred_daily.py" "fred.log")
$(cron_line "45 22 * * 1-5" "macro_daily.py" "macro.log")
$(cron_line "0 23 * * 1-5" "futures_daily.py" "futures.log")
$(cron_line "15 23 * * 1-5" "fomc_daily.py" "fomc.log")
# ${MARKER} — FRED catch-up if DGS not yet published (~7:30 PM, 9:30 PM, 9 AM, 11 AM ET)
$(cron_line "30 23 * * 1-5" "fred_catchup.py" "fred_catchup.log")
$(cron_line "30 1 * * 1-5" "fred_catchup.py" "fred_catchup.log")
$(cron_line "0 13 * * 1-5" "fred_catchup.py" "fred_catchup.log")
$(cron_line "0 15 * * 1-5" "fred_catchup.py" "fred_catchup.log")
# ${MARKER} — weekly CTD/conversion-factor recompute (update data/ctd_overrides.json when CME rolls)
$(cron_line "0 17 * * 0" "ctd_refresh.py --recompute" "ctd.log")
EOF
)

{
  crontab -l 2>/dev/null | grep -v "$MARKER" || true
  echo "$NEW_BLOCK"
} | crontab -

echo "✓ yield-curve crontab installed (logs: ${LOG_DIR})"
crontab -l | grep "$MARKER" || true
