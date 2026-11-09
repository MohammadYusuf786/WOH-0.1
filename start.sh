#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18 or newer is required."
  exit 1
fi
[ -f .env ] || cp .env.example .env
[ -d node_modules ] || npm install
npm start
