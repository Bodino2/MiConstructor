#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE=/etc/miconstructor/api.env
BACKUP_ROOT=/var/backups/miconstructor
UPLOAD_ROOT=/var/lib/miconstructor/uploads
RETENTION_DAYS=21

if [[ ! -r "$ENV_FILE" ]]; then
  echo "No se puede leer $ENV_FILE" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_ROOT/$timestamp"
install -d -m 0700 "$target"

pg_dump --format=custom --no-owner --no-acl --file="$target/database.dump" "$DATABASE_URL"
tar --create --zstd --file="$target/uploads.tar.zst" --directory="$UPLOAD_ROOT" objects
sha256sum "$target/database.dump" "$target/uploads.tar.zst" > "$target/SHA256SUMS"

find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime "+$RETENTION_DAYS" -print -exec rm -rf -- {} +
echo "Backup creado en $target"
