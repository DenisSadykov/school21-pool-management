#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_PYTHON="${BACKEND_PYTHON:-$ROOT_DIR/backend/.venv/bin/python}"

echo "[1/5] Frontend build"
(
  cd "$ROOT_DIR/frontend"
  CI=true npm run build
)

echo "[2/5] Frontend tests (pass if none are configured)"
(
  cd "$ROOT_DIR/frontend"
  CI=true npm run test:ci
)

echo "[3/5] Backend dependency check"
(
  cd "$ROOT_DIR/backend"
  "$BACKEND_PYTHON" -m pip check
)

echo "[4/5] Backend compile check"
(
  cd "$ROOT_DIR/backend"
  "$BACKEND_PYTHON" -m compileall app.py telegram_bot.py services routes models utils tests
)

echo "[5/5] Backend smoke tests"
(
  cd "$ROOT_DIR/backend"
  "$BACKEND_PYTHON" -m pytest tests -q
)

echo "Daily check completed successfully."
