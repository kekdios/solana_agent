#!/usr/bin/env bash
# Build the React UI, start the HTTP server (Node), open the app in your browser.
# Usage: ./build-and-run.sh
# Stop: Ctrl+C (tears down the server). Optional: PORT=3456 ./build-and-run.sh (exported for node; default 3333).

set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-3333}"
export PORT

free_port() {
  local p
  if ! lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    return 0
  fi
  echo "Port $PORT is in use; stopping existing listener(s)..."
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN || true
  for p in $(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null); do
    kill "$p" 2>/dev/null || true
  done
  sleep 0.75
  for p in $(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null); do
    kill -9 "$p" 2>/dev/null || true
  done
  sleep 0.25
  if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Could not free port $PORT. Stop the process manually, then rerun."
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN || true
    exit 1
  fi
  echo "Port $PORT is free."
}

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "Building renderer..."
npm run build:renderer

free_port

echo "Starting server..."
node server.js &
SERVER_PID=$!

READY=""
for _ in $(seq 1 50); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Server process exited before becoming ready."
    exit 1
  fi
  if curl -sf "http://127.0.0.1:${PORT}/api/help" >/dev/null 2>&1; then
    READY="http://127.0.0.1:${PORT}"
    break
  fi
  sleep 0.15
done

if [[ -z "$READY" ]]; then
  echo "Server did not respond on http://127.0.0.1:${PORT} (check PORT in Settings or errors above)."
  exit 1
fi

URL="${BROWSER_URL:-$READY}"
echo "Opening $URL"
if command -v open >/dev/null 2>&1; then
  open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL"
else
  echo "Open this URL in a browser: $URL"
fi

echo "Solana Agent at $READY (server PID $SERVER_PID). Press Ctrl+C to stop."
wait "$SERVER_PID"
