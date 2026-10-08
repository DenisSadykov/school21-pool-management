#!/usr/bin/env bash
set -euo pipefail
umask 077
cd /opt/school21-pool-copy
task_compose=infra/play2go/compose.yaml
task_database=pool_live_20261008
task_tables="$(docker compose -f "$task_compose" exec -T db psql -U postgres -d "$task_database" -Atc "SELECT count(*) FROM pg_tables WHERE schemaname='public'")"
[[ "$task_tables" == 0 ]] || { echo 'Live target is not empty; refusing restore'; exit 1; }
test -f secure/source-refresh.env
trap 'rm -f /opt/school21-pool-copy/secure/source-refresh.env' EXIT
docker run --rm --network host --env-file secure/source-refresh.env \
  -e 'PGOPTIONS=-c default_transaction_read_only=on' \
  -v /opt/school21-pool-copy/secure:/backup postgres:17-bookworm \
  pg_dump -Fc --schema=public --no-owner --no-acl --no-publications --no-subscriptions \
  -f /backup/source-cutover-20261008.dump
docker run --rm -i --network host --env-file secure/source-refresh.env \
  -e 'PGOPTIONS=-c default_transaction_read_only=on' postgres:17-bookworm \
  psql -At -v ON_ERROR_STOP=1 < infra/play2go/table-counts.sql > secure/source-cutover-counts.txt
chmod 600 secure/source-cutover-20261008.dump secure/source-cutover-counts.txt
docker compose -f "$task_compose" exec -T db psql \
  -U pool_app -d "$task_database" -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public'
docker compose -f "$task_compose" exec -T db pg_restore \
  -U pool_app -d "$task_database" --no-owner --no-acl --exit-on-error --single-transaction \
  < secure/source-cutover-20261008.dump
docker compose -f "$task_compose" exec -T db psql \
  -U postgres -d "$task_database" -At -v ON_ERROR_STOP=1 \
  < infra/play2go/table-counts.sql > secure/live-cutover-counts.txt
diff -u secure/source-cutover-counts.txt secure/live-cutover-counts.txt
sha256sum secure/source-cutover-20261008.dump > secure/source-cutover-20261008.dump.sha256
echo 'Fresh source restored; all public table counts match'
