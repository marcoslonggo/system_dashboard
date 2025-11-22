#!/usr/bin/env bash

set -euo pipefail

# Deploys the built Next.js standalone bundle to a Raspberry Pi (or any SSH target).
# Required env vars:
#   PI_HOST      -> SSH target, e.g. pi@192.168.1.50
# Optional env vars:
#   PI_DIR       -> Target directory on the Pi (default: /opt/dashboard)
#   PI_SERVICE   -> systemd service name (default: dashboard.service)
#   ENV_FILE     -> Path to a local .env file to upload (optional)
#   SKIP_BUILD   -> Set to "1" to skip npm run build if you already built

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PI_HOST="${PI_HOST:?Set PI_HOST, e.g. pi@192.168.1.50}"
PI_DIR="${PI_DIR:-/opt/dashboard}"
PI_SERVICE="${PI_SERVICE:-dashboard.service}"
ENV_FILE="${ENV_FILE:-}"
SKIP_BUILD="${SKIP_BUILD:-0}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1" >&2; exit 1; }
}

require_cmd ssh
require_cmd rsync
require_cmd npm

echo "==> Deploy target: $PI_HOST:$PI_DIR (service: $PI_SERVICE)"

if [[ "$SKIP_BUILD" != "1" ]]; then
  echo "==> Installing deps and building locally"
  (cd "$ROOT_DIR" && npm ci && npm run build)
else
  echo "==> Skipping build (SKIP_BUILD=1)"
fi

echo "==> Creating target directory on Pi"
ssh "$PI_HOST" "mkdir -p '$PI_DIR'"

echo "==> Syncing standalone bundle"
rsync -az --delete "$ROOT_DIR/.next/standalone/" "$PI_HOST:$PI_DIR/"
rsync -az --delete "$ROOT_DIR/.next/static" "$PI_HOST:$PI_DIR/.next/static"
rsync -az --delete "$ROOT_DIR/public" "$PI_HOST:$PI_DIR/public"
rsync -az "$ROOT_DIR/package.json" "$ROOT_DIR/package-lock.json" "$PI_HOST:$PI_DIR/"

if [[ -n "$ENV_FILE" ]]; then
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "ENV_FILE '$ENV_FILE' not found" >&2
    exit 1
  fi
  echo "==> Uploading env file to $PI_DIR/.env"
  scp "$ENV_FILE" "$PI_HOST:$PI_DIR/.env"
else
  echo "==> Skipping env upload (ENV_FILE not set)"
fi

SERVICE_TMP="$(mktemp)"
cat >"$SERVICE_TMP" <<EOF
[Unit]
Description=Dashboard (Next.js standalone) service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$PI_DIR
EnvironmentFile=$PI_DIR/.env
ExecStart=/usr/bin/env node server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo "==> Installing systemd service $PI_SERVICE"
scp "$SERVICE_TMP" "$PI_HOST:/tmp/$PI_SERVICE"
ssh "$PI_HOST" "sudo mv /tmp/$PI_SERVICE /etc/systemd/system/$PI_SERVICE && sudo systemctl daemon-reload && sudo systemctl enable --now $PI_SERVICE"
rm -f "$SERVICE_TMP"

echo "==> Deployment complete."
echo "Check status with: ssh $PI_HOST \"systemctl status $PI_SERVICE\""
