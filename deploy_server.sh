#!/bin/bash
set -e

echo "=== Creating pinggy database ==="
sudo -u postgres psql -c "CREATE DATABASE pinggy;" 2>/dev/null || echo "Database may already exist"
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'root';"
echo "✅ Database ready"

echo "=== Creating directory ==="
mkdir -p /opt/pinggy
echo "✅ Directory ready"

echo "=== Installing Python venv ==="
apt-get install -y python3-venv python3-pip 2>/dev/null || true
echo "✅ Python ready"

echo "=== Setup complete ==="