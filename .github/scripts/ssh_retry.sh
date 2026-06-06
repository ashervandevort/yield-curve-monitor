#!/usr/bin/env bash
# Run a command up to N times with backoff (for rsync/ssh deploy steps).
set -euo pipefail

MAX="${1:-4}"
shift
label="${1:-command}"
shift

attempt=1
while [ "$attempt" -le "$MAX" ]; do
  echo "=== ${label} attempt ${attempt}/${MAX} ==="
  if "$@"; then
    exit 0
  fi
  if [ "$attempt" -lt "$MAX" ]; then
    wait_secs=$((attempt * 30))
    echo "${label} failed — waiting ${wait_secs}s ..."
    sleep "$wait_secs"
  fi
  attempt=$((attempt + 1))
done

echo "ERROR: ${label} failed after ${MAX} attempts"
exit 1
