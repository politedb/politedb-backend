#!/usr/bin/env bash
# Runs on the VPS from the freshly extracted release (see .github/workflows/deploy-vps.yml).
# Swaps the release into APP_DIR, restarts the app, checks /api/health and rolls back to the
# previous release if the check fails.
#
# Note: a rollback restores code and .env, not the database. Migrations must stay
# compatible with the previous release (additive, or dropping only unused objects).
set -euo pipefail

APP_DIR="${APP_DIR:?APP_DIR is required}"
INCOMING_DIR="${INCOMING_DIR:?INCOMING_DIR is required}"
NEW_ENV_FILE="${NEW_ENV_FILE:?NEW_ENV_FILE is required}"
HEALTH_ATTEMPTS="${HEALTH_ATTEMPTS:-30}"
HEALTH_INTERVAL="${HEALTH_INTERVAL:-2}"

STATE_DIR="$APP_DIR/.deploy"
PREVIOUS_DIR="$STATE_DIR/previous"
CODE_ITEMS=(dist node_modules scripts package.json package-lock.json ecosystem.config.cjs)

restart_app() {
  APP_DIR="$APP_DIR" bash "$APP_DIR/scripts/deploy-vps.sh"
}

health_url() {
  if [[ -n "${HEALTH_URL:-}" ]]; then
    echo "$HEALTH_URL"
    return
  fi
  local port
  port="$(grep -E '^PORT=' "$APP_DIR/.env" | tail -n 1 | cut -d= -f2- | tr -d '[:space:]"' || true)"
  echo "http://127.0.0.1:${port:-4000}/api/health"
}

wait_healthy() {
  local url="$1"
  for ((attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt++)); do
    if node -e 'fetch(process.argv[1]).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))' "$url"; then
      echo "Healthy after ${attempt} check(s): $url"
      return 0
    fi
    sleep "$HEALTH_INTERVAL"
  done
  return 1
}

rollback() {
  echo "Rolling back to the previous release"
  for item in "${CODE_ITEMS[@]}" .env; do
    rm -rf "${APP_DIR:?}/$item"
    if [[ -e "$PREVIOUS_DIR/$item" ]]; then
      mv "$PREVIOUS_DIR/$item" "$APP_DIR/$item"
    fi
  done
  if [[ -d "$APP_DIR/dist" ]]; then
    restart_app || true
  else
    echo "No previous release to restore (first deploy)."
  fi
}

mkdir -p "$STATE_DIR"
rm -rf "$PREVIOUS_DIR"
mkdir -p "$PREVIOUS_DIR"

# Keep the running release aside instead of deleting it, so it can be restored.
for item in "${CODE_ITEMS[@]}" .env; do
  if [[ -e "$APP_DIR/$item" ]]; then
    mv "$APP_DIR/$item" "$PREVIOUS_DIR/$item"
  fi
done

for item in "${CODE_ITEMS[@]}"; do
  mv "$INCOMING_DIR/$item" "$APP_DIR/$item"
done
mv "$NEW_ENV_FILE" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"
chmod +x "$APP_DIR/scripts/"*.sh

if ! restart_app; then
  echo "DEPLOY_FAILED: restart failed"
  rollback
  exit 1
fi

URL="$(health_url)"
if ! wait_healthy "$URL"; then
  echo "DEPLOY_FAILED: health check did not pass: $URL"
  rollback
  exit 1
fi

rm -rf "$INCOMING_DIR"
echo "Deploy complete. Previous release kept in $PREVIOUS_DIR"
