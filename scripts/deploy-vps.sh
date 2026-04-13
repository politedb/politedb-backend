#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
SYSTEMD_SERVICE="${SYSTEMD_SERVICE:-}"
PM2_APP_NAME="${PM2_APP_NAME:-}"

find_pm2() {
  if command -v pm2 >/dev/null 2>&1; then
    command -v pm2
    return 0
  fi

  local candidates=(
    "$HOME/.npm-global/bin/pm2"
    "$HOME/.local/bin/pm2"
    "/usr/local/bin/pm2"
    "/usr/bin/pm2"
  )

  if [[ -d "$HOME/.nvm/versions/node" ]]; then
    while IFS= read -r path; do
      candidates+=("$path")
    done < <(find "$HOME/.nvm/versions/node" -type f -path "*/bin/pm2" 2>/dev/null | sort -r)
  fi

  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -x "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done

  return 1
}

cd "$APP_DIR"

if [[ -n "$SYSTEMD_SERVICE" ]]; then
  echo "Restarting systemd service: $SYSTEMD_SERVICE"
  sudo systemctl restart "$SYSTEMD_SERVICE"
  sudo systemctl status "$SYSTEMD_SERVICE" --no-pager
  exit 0
fi

if [[ -n "$PM2_APP_NAME" ]]; then
  echo "Restarting PM2 app: $PM2_APP_NAME"
  PM2_BIN="$(find_pm2 || true)"

  if [[ -z "${PM2_BIN:-}" ]]; then
    echo "PM2_NOT_FOUND"
    echo "Install PM2 globally or configure SYSTEMD_SERVICE instead."
    exit 127
  fi

  echo "Using PM2 binary: $PM2_BIN"

  if "$PM2_BIN" describe "$PM2_APP_NAME" >/dev/null 2>&1; then
    "$PM2_BIN" restart "$PM2_APP_NAME" --update-env
  else
    "$PM2_BIN" start dist/server.js --name "$PM2_APP_NAME"
  fi
  "$PM2_BIN" save
  exit 0
fi

echo "No restart method configured. Set SYSTEMD_SERVICE or PM2_APP_NAME."
exit 1
