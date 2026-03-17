#!/usr/bin/env bash
# Build and run: renderer + Mac app (.app dir), then open Solana Agent.
# Usage: ./build-and-run.sh

set -e
cd "$(dirname "$0")"

echo "Building renderer..."
npm run build:renderer

echo "Building Mac app (dir)..."
npx electron-builder --mac --dir

APP_PATH="dist/mac-arm64/Solana Agent.app"
if [[ ! -d "$APP_PATH" ]]; then
  APP_PATH="dist/mac/Solana Agent.app"
fi
if [[ -d "$APP_PATH" ]]; then
  echo "Running: $APP_PATH"
  open "$APP_PATH"
else
  echo "App not found under dist/mac-arm64 or dist/mac"
  exit 1
fi
