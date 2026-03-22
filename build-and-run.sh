#!/usr/bin/env bash
# Build the React UI, start the HTTP server (Node), open the app in your browser.
# Usage: ./build-and-run.sh
# Stop: Ctrl+C (tears down the server). Custom PORT may be set in Settings (DB); default URL is :3333.

set -euo pipefail
cd "$(dirname "$0")"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "Building renderer..."
npm run build:renderer

echo "Starting server..."
node server.js &
SERVER_PID=$!

READY=""
for _ in $(seq 1 50); do
  if curl -sf "http://127.0.0.1:3333/api/help" >/dev/null 2>&1; then
    READY="http://127.0.0.1:3333"
    break
  fi
  sleep 0.15
done

if [[ -z "$READY" ]]; then
  echo "Server did not respond on http://127.0.0.1:3333 (check PORT in Settings or errors above)."
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
