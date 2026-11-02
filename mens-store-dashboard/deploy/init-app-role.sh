#!/bin/sh
set -eu
export AHMED_STORE_DB_PASSWORD="$(cat /run/secrets/app_db_password)"
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv app_password AHMED_STORE_DB_PASSWORD
CREATE ROLE ahmed_store_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE ahmed_store TO ahmed_store_app;
SQL
