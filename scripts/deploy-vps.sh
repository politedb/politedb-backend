#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
SYSTEMD_SERVICE="${SYSTEMD_SERVICE:-}"
PM2_APP_NAME="${PM2_APP_NAME:-politedb-backend}"
PM2_ECOSYSTEM_FILE="${PM2_ECOSYSTEM_FILE:-ecosystem.config.cjs}"

cd "$APP_DIR"

if [[ -n "$SYSTEMD_SERVICE" ]]; then
  echo "Restarting systemd service: $SYSTEMD_SERVICE"
  sudo systemctl restart "$SYSTEMD_SERVICE"
  sudo systemctl status "$SYSTEMD_SERVICE" --no-pager
  exit 0
fi

echo "Restarting PM2 app: $PM2_APP_NAME"
PM2_BIN="$(command -v pm2 || true)"

if [[ -z "$PM2_BIN" && -x "./node_modules/.bin/pm2" ]]; then
  PM2_BIN="./node_modules/.bin/pm2"
fi

if [[ -z "$PM2_BIN" ]]; then
  echo "PM2_NOT_FOUND"
  echo "Install PM2 globally, or add it to project dependencies."
  exit 127
fi

echo "Using PM2 binary: $PM2_BIN"
if [[ -f "$PM2_ECOSYSTEM_FILE" ]]; then
  echo "Using PM2 ecosystem: $PM2_ECOSYSTEM_FILE"
  APP_DIR="$APP_DIR" PM2_APP_NAME="$PM2_APP_NAME" "$PM2_BIN" startOrReload "$PM2_ECOSYSTEM_FILE" --update-env
else
  "$PM2_BIN" start dist/server.js --name "$PM2_APP_NAME"
fi
"$PM2_BIN" save
exit 0
