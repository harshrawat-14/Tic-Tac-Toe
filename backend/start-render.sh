#!/bin/sh
set -eu

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-localdb}"
DB_NAME="${DB_NAME:-nakama}"
SERVER_KEY="${NAKAMA_SERVER_KEY:-defaultkey}"
SESSION_ENC_KEY="${NAKAMA_SESSION_ENCRYPTION_KEY:-change-me-session-key}"
SESSION_REFRESH_KEY="${NAKAMA_SESSION_REFRESH_ENCRYPTION_KEY:-change-me-refresh-key}"
RUNTIME_HTTP_KEY="${NAKAMA_RUNTIME_HTTP_KEY:-change-me-http-key}"
DB_ADDRESS="${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# Defensive: clear any stale Render env override variants first.
unset NAKAMA_RUNTIME_JS_ENTRYPOINT 2>/dev/null || true
unset NAKAMA_RUNTIME_JS_ENTRYPOINT_PATH 2>/dev/null || true
unset RUNTIME_JS_ENTRYPOINT 2>/dev/null || true
unset RUNTIME_JS_ENTRYPOINT_PATH 2>/dev/null || true

# Force a safe entrypoint value. Nakama expects a filename relative to
# /nakama/data/modules, not a nested "data/modules/..." path.
export NAKAMA_RUNTIME_JS_ENTRYPOINT="index.js"

echo "[start-render] Launching Nakama with runtime.js_entrypoint=index.js"

echo "[start-render] Running database migrations"
/nakama/nakama migrate up --database.address "${DB_ADDRESS}"

exec /nakama/nakama \
  --config /nakama/data/nakama-config.yml \
  --name nakama1 \
  --runtime.js_entrypoint "index.js" \
  --socket.server_key "${SERVER_KEY}" \
  --session.encryption_key "${SESSION_ENC_KEY}" \
  --session.refresh_encryption_key "${SESSION_REFRESH_KEY}" \
  --runtime.http_key "${RUNTIME_HTTP_KEY}" \
  --database.address "${DB_ADDRESS}"
