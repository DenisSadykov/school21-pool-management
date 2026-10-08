#!/bin/sh
set -eu
psql --username postgres --dbname postgres --set ON_ERROR_STOP=1 --set app_password="$DB_PASSWORD" <<'SQL'
CREATE ROLE pool_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'app_password';
CREATE DATABASE pool OWNER pool_app;
SQL
