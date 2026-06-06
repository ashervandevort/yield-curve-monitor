#!/usr/bin/env bash
# Write deploy key and verify SSH with retries (nc + auth in same loop).
set -euo pipefail

: "${SSH_PRIVATE_KEY:?SSH_PRIVATE_KEY required}"
: "${HOST:?HOST required}"
: "${USER:?USER required}"

mkdir -p ~/.ssh
chmod 700 ~/.ssh
printf '%s\n' "$SSH_PRIVATE_KEY" > ~/.ssh/deploy_key
chmod 600 ~/.ssh/deploy_key
ssh-keygen -l -f ~/.ssh/deploy_key >/dev/null
ssh-keyscan -H "$HOST" >> ~/.ssh/known_hosts 2>/dev/null || true

export SSH_COMMON_OPTS=(
  -i ~/.ssh/deploy_key
  -o IdentitiesOnly=yes
  -o BatchMode=yes
  -o ConnectTimeout=45
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=6
  -o StrictHostKeyChecking=accept-new
)

RUNNER_IP="$(curl -s --max-time 10 https://api.ipify.org || echo unknown)"
echo "Runner egress IP: ${RUNNER_IP}"
echo "Target: ${USER}@${HOST}:22"

MAX_ATTEMPTS="${SSH_MAX_ATTEMPTS:-8}"
for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  echo "=== SSH preflight attempt ${attempt}/${MAX_ATTEMPTS} ==="
  if nc -zv -w 25 "$HOST" 22 2>&1 \
    && ssh "${SSH_COMMON_OPTS[@]}" "${USER}@${HOST}" 'echo SSH OK'; then
    echo "SSH authenticated on attempt ${attempt}"
    exit 0
  fi
  if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
    wait_secs=$((attempt * 25))
    echo "Preflight failed — waiting ${wait_secs}s before retry ..."
    sleep "$wait_secs"
  fi
done

echo "ERROR: Could not reach ${HOST}:22 or authenticate after ${MAX_ATTEMPTS} attempts."
echo "This is usually Hostinger/network blocking GitHub Actions egress IPs (not a bad key)."
echo "Runner IP was: ${RUNNER_IP} — check Hostinger hPanel firewall allows SSH from any IP."
exit 1
