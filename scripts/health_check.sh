#!/usr/bin/env bash
# Health check script for systemd watchdog (v2.8.7)
# Called by systemd's WatchdogSec — pings the /health endpoint
# and notifies systemd that the service is alive.
#
# If /health returns "degraded" or doesn't respond, the script exits
# with a non-zero code. Combined with WatchdogSec + Restart=always,
# systemd will auto-restart the IRAGT service.
#
# Usage:
#   1. Install: sudo cp scripts/health_check.sh /opt/iragt/scripts/health_check.sh
#   2. chmod +x /opt/iragt/scripts/health_check.sh
#   3. Add to systemd service: WatchdogSec=30 + ExecStartPost

set -euo pipefail

HEALTH_URL="http://127.0.0.1:8000/health"
TIMEOUT=10

# Ping the health endpoint
RESPONSE=$(curl -s --max-time "$TIMEOUT" "$HEALTH_URL" 2>/dev/null || echo '{"status":"dead"}')

# Extract the status field
STATUS=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','dead'))" 2>/dev/null || echo "dead")

if [ "$STATUS" = "ok" ]; then
    # Notify systemd that we're alive
    if [ -n "${NOTIFY_SOCKET:-}" ]; then
        systemd-notify --no-block WATCHDOG=1
    fi
    exit 0
elif [ "$STATUS" = "degraded" ]; then
    # Service is responding but DB or Redis is down — still alive,
    # notify watchdog but log the degradation
    if [ -n "${NOTIFY_SOCKET:-}" ]; then
        systemd-notify --no-block WATCHDOG=1 --status="degraded: $RESPONSE"
    fi
    # Don't restart on degraded — the app can partially function
    exit 0
else
    # Service is dead — let systemd restart it
    echo "Health check FAILED: status=$STATUS response=$RESPONSE" >&2
    exit 1
fi