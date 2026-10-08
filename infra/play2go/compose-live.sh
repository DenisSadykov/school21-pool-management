#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
exec docker compose \
  --env-file infra/play2go/.env \
  --env-file secure/telegram-bot.env \
  --env-file secure/runtime-integrations.env \
  -f infra/play2go/compose.yaml \
  -f infra/play2go/compose.production.yaml "$@"
