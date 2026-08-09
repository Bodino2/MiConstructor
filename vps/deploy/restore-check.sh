#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 1 ]]; then
  echo "Uso: $0 /var/backups/miconstructor/YYYYMMDDTHHMMSSZ" >&2
  exit 2
fi

backup_dir="$(realpath "$1")"
case "$backup_dir" in
  /var/backups/miconstructor/*) ;;
  *) echo "Ruta de backup no permitida" >&2; exit 2 ;;
esac

cd "$backup_dir"
sha256sum --check SHA256SUMS
pg_restore --list database.dump >/dev/null
tar --list --zstd --file=uploads.tar.zst >/dev/null
echo "Backup íntegro y restaurable: $backup_dir"
