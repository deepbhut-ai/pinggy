#!/bin/bash
# ============================================================
# Create Cloudflare DNS A records for all 33 fleet subdomains
# ============================================================
#
# Prerequisites:
#   - Cloudflare API token with Zone:DNS:Edit for callingagents.in
#   - jq installed: apt install jq
#
# Usage:
#   bash /opt/pinggy/scripts/create_cf_dns_records.sh <CF_API_TOKEN>
#
# What it does:
#   1. Looks up the Cloudflare zone ID for callingagents.in
#   2. For each of the 33 subdomains, creates an A record → 13.140.131.204
#      (DNS-only / not proxied — "proxied": false)
#   3. Skips records that already exist
# ============================================================

set -euo pipefail

CF_TOKEN="${1:?Usage: $0 <CF_API_TOKEN>}"
ZONE_NAME="callingagents.in"
SERVER_IP="13.140.131.204"

SUBDOMAINS=(
  astrology socialvibe eclassify infixlms yoori1 infyhms rith acelle
  teleman magicai erpgo cloudoffice infycare maildoll stackposts jobpilot
  phprank instikit bedrive zillapage phpanalytics yoori2 activeecom whatsmark
  larabuilder xerochat unimatrix wowonder quickdate1 quickdate2 architect
  porto webifly
)

echo "=========================================="
echo "  Cloudflare DNS A Record Creation"
echo "  Zone: $ZONE_NAME"
echo "  Target: $SERVER_IP"
echo "  Subdomains: ${#SUBDOMAINS[@]}"
echo "  Proxied: NO (DNS-only)"
echo "=========================================="

# 1. Get zone ID
echo ""
echo "Looking up zone ID for $ZONE_NAME..."
ZONE_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=$ZONE_NAME" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print(r['result'][0]['id'] if r.get('result') else '')" 2>/dev/null)

if [ -z "$ZONE_ID" ]; then
  echo "❌ Could not find zone $ZONE_NAME. Check your API token has access to this zone."
  exit 1
fi
echo "✅ Zone ID: $ZONE_ID"

# 2. Create A records
created=0
exists=0
failed=0

for sub in "${SUBDOMAINS[@]}"; do
  # Check if record already exists
  existing=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=A&name=${sub}.${ZONE_NAME}" \
    -H "Authorization: Bearer $CF_TOKEN" \
    -H "Content-Type: application/json" \
    | python3 -c "import sys,json; r=json.load(sys.stdin); print(len(r.get('result',[])))" 2>/dev/null)

  if [ "$existing" != "0" ]; then
    echo "  ⏭️  ${sub}.${ZONE_NAME} — already exists"
    exists=$((exists + 1))
    continue
  fi

  # Create the A record
  result=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
    -H "Authorization: Bearer $CF_TOKEN" \
    -H "Content-Type: application/json" \
    --data "{\"type\":\"A\",\"name\":\"${sub}\",\"content\":\"${SERVER_IP}\",\"ttl\":1,\"proxied\":false}" \
    | python3 -c "import sys,json; r=json.load(sys.stdin); print('OK' if r.get('success') else 'FAIL: '+str(r.get('errors','')))" 2>/dev/null)

  if [[ "$result" == "OK" ]]; then
    echo "  ✅ ${sub}.${ZONE_NAME} — created"
    created=$((created + 1))
  else
    echo "  ❌ ${sub}.${ZONE_NAME} — $result"
    failed=$((failed + 1))
  fi

  sleep 1  # be gentle with CF API rate limits
done

echo ""
echo "=========================================="
echo "  Summary: $created created, $exists existed, $failed failed"
echo "=========================================="
echo ""
echo "Next step: bash /opt/pinggy/scripts/provision_fleet_ssl.sh"
echo "(DNS propagation may take a few minutes before certbot can verify)"