#!/bin/sh
cd "$(dirname "$0")"
set -a
[ -f .env ] && . .env
set +a
exec node server.js
