#!/usr/bin/env bash
set -Eeuo pipefail

CONFIG_FILE="${1:-/etc/nginx/sites-available/miconstructor.conf}"
MARKER_BEGIN="# MICONSTRUCTOR_CANONICAL_WWW_BEGIN"
MARKER_END="# MICONSTRUCTOR_CANONICAL_WWW_END"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "No existe la configuración Nginx: $CONFIG_FILE" >&2
  exit 1
fi

if ! grep -Eq 'server_name[[:space:]]+miconstructor\.es[[:space:]]+www\.miconstructor\.es;' "$CONFIG_FILE"; then
  echo "La configuración no declara miconstructor.es y www.miconstructor.es juntos." >&2
  exit 1
fi

if grep -Fq "$MARKER_BEGIN" "$CONFIG_FILE"; then
  echo "Canonical redirect already configured."
  nginx -t
  exit 0
fi

BACKUP="${CONFIG_FILE}.before-canonical-$(date +%Y%m%d-%H%M%S)"
cp -a "$CONFIG_FILE" "$BACKUP"

python3 - "$CONFIG_FILE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
needle = "server_name miconstructor.es www.miconstructor.es;"
block = """server_name miconstructor.es www.miconstructor.es;\n\n    # MICONSTRUCTOR_CANONICAL_WWW_BEGIN\n    if ($host = www.miconstructor.es) {\n        return 301 https://miconstructor.es$request_uri;\n    }\n    # MICONSTRUCTOR_CANONICAL_WWW_END"""
count = text.count(needle)
if count < 1:
    raise SystemExit("No se encontró server_name para MiConstructor.")
path.write_text(text.replace(needle, block), encoding="utf-8")
print(f"Canonical redirect inserted in {count} MiConstructor server block(s).")
PY

if ! nginx -t; then
  cp -a "$BACKUP" "$CONFIG_FILE"
  nginx -t || true
  echo "Nginx validation failed; configuration restored from $BACKUP" >&2
  exit 1
fi

systemctl reload nginx

echo "Canonical www redirect applied successfully."
echo "Backup: $BACKUP"
