#!/bin/sh
set -eu
while true; do
  node /app/dist/ops/database.mjs backup --out "/backups/$(date -u +%Y%m%dT%H%M%SZ)"
  touch /backups/last-success
  sleep "${BACKUP_INTERVAL_SECONDS:-86400}"
done
