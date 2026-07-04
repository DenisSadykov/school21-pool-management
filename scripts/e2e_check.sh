#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_PYTHON="${BACKEND_PYTHON:-$ROOT_DIR/backend/.venv/bin/python}"
BACKEND_PORT="${BACKEND_PORT:-5052}"
FRONTEND_PORT="${FRONTEND_PORT:-3005}"
BACKEND_URL="http://127.0.0.1:${BACKEND_PORT}"
FRONTEND_URL="http://127.0.0.1:${FRONTEND_PORT}"
BACKEND_LOG="${ROOT_DIR}/.codex-audits/e2e-backend.log"
FRONTEND_LOG="${ROOT_DIR}/.codex-audits/e2e-frontend.log"

mkdir -p "${ROOT_DIR}/.codex-audits"

cleanup() {
  if [[ -n "${FRONTEND_PID:-}" ]] && kill -0 "${FRONTEND_PID}" >/dev/null 2>&1; then
    kill "${FRONTEND_PID}" >/dev/null 2>&1 || true
    wait "${FRONTEND_PID}" 2>/dev/null || true
  fi
  if [[ -n "${BACKEND_PID:-}" ]] && kill -0 "${BACKEND_PID}" >/dev/null 2>&1; then
    kill "${BACKEND_PID}" >/dev/null 2>&1 || true
    wait "${BACKEND_PID}" 2>/dev/null || true
  fi
}

wait_for_url() {
  local url="$1"
  local label="$2"
  local attempts="${3:-60}"
  for ((i=1; i<=attempts; i+=1)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Timed out waiting for ${label}: ${url}" >&2
  return 1
}

trap cleanup EXIT

echo "Starting isolated backend on ${BACKEND_URL}"
(
  cd "${ROOT_DIR}/backend"
  "$BACKEND_PYTHON" tests/e2e_server.py --port "${BACKEND_PORT}"
) >"${BACKEND_LOG}" 2>&1 &
BACKEND_PID=$!

wait_for_url "${BACKEND_URL}/api/health" "backend"

echo "Starting frontend on ${FRONTEND_URL}"
(
  cd "${ROOT_DIR}/frontend"
  PORT="${FRONTEND_PORT}" \
  BROWSER=none \
  REACT_APP_API_URL="${BACKEND_URL}" \
  npm start
) >"${FRONTEND_LOG}" 2>&1 &
FRONTEND_PID=$!

wait_for_url "${FRONTEND_URL}" "frontend"

echo "Running Playwright tests"
(
  cd "${ROOT_DIR}/frontend"
  PLAYWRIGHT_BASE_URL="${FRONTEND_URL}" ./node_modules/.bin/playwright test
)
