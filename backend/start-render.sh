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

# Defensive: ignore stale env override values like "data/modules/index.js"
# which cause Nakama to resolve /nakama/data/modules/data/modules/index.js.
unset NAKAMA_RUNTIME_JS_ENTRYPOINT
unset RUNTIME_JS_ENTRYPOINT

exec /nakama/nakama \
  --config /nakama/data/nakama-config.yml \
  --name nakama1 \
  --runtime.js_entrypoint "/nakama/data/modules/index.js" \
  --socket.server_key "${SERVER_KEY}" \
  --session.encryption_key "${SESSION_ENC_KEY}" \
  --session.refresh_encryption_key "${SESSION_REFRESH_KEY}" \
  --runtime.http_key "${RUNTIME_HTTP_KEY}" \
  --database.address "${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
