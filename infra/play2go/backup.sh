#!/usr/bin/env bash
set -euo pipefail
umask 077
task_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
task_backup_dir="$task_root/secure/backups"
mkdir -p "$task_backup_dir"
chmod 700 "$task_backup_dir"
exec 9>"$task_backup_dir/.backup.lock"
flock -n 9 || exit 0
task_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
task_dump="$task_backup_dir/pool-$task_stamp.dump"
task_compose="$task_root/infra/play2go/compose.yaml"
docker compose -f "$task_compose" exec -T db \
  pg_dump -U postgres -d pool -Fc --schema=public --no-owner --no-acl \
  --no-publications --no-subscriptions > "$task_dump.partial"
test -s "$task_dump.partial"
docker compose -f "$task_compose" exec -T db pg_restore --list \
  < "$task_dump.partial" > /dev/null
mv "$task_dump.partial" "$task_dump"
sha256sum "$task_dump" > "$task_dump.sha256"
task_config="$task_backup_dir/config-$task_stamp.tar.gz"
task_config_paths=(infra/play2go .dockerignore)
for task_settings in secure/production-settings.env secure/frontend-settings.env \
  secure/integration-settings-status.json secure/source-integration-config.json \
  secure/local-project-settings.tar.gz; do
  if [[ -f "$task_root/$task_settings" ]]; then
    task_config_paths+=("$task_settings")
  fi
done
tar -czf "$task_config" -C "$task_root" "${task_config_paths[@]}"
sha256sum "$task_config" > "$task_config.sha256"
printf 'Verified archive: %s\nProtected configuration: %s\n' "$task_dump" "$task_config"
