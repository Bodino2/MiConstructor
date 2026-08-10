#!/usr/bin/env bash
set -Eeuo pipefail

CONFIG_FILE="${1:-/etc/nginx/sites-available/miconstructor.conf}"
NGINX_BIN="${NGINX_BIN:-nginx}"
SYSTEMCTL_BIN="${SYSTEMCTL_BIN:-systemctl}"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "No existe la configuración Nginx: $CONFIG_FILE" >&2
  exit 1
fi

BACKUP="${CONFIG_FILE}.before-canonical-$(date +%Y%m%d-%H%M%S)"
cp -a "$CONFIG_FILE" "$BACKUP"

python3 - "$CONFIG_FILE" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")

# Remove the first-generation in-block redirect and any previously generated
# dedicated www blocks so this helper stays idempotent.
text = re.sub(
    r"\n\s*# MICONSTRUCTOR_CANONICAL_WWW_BEGIN.*?# MICONSTRUCTOR_CANONICAL_WWW_END",
    "",
    text,
    flags=re.S,
)
text = re.sub(
    r"\n?# MICONSTRUCTOR_CANONICAL_WWW_SERVER_BEGIN.*?# MICONSTRUCTOR_CANONICAL_WWW_SERVER_END\n?",
    "\n",
    text,
    flags=re.S,
)

server_name_re = re.compile(
    r"server_name\s+miconstructor\.es\s+www\.miconstructor\.es\s*;"
)


def server_spans(source: str):
    spans = []
    for match in re.finditer(r"(?m)^\s*server\s*\{", source):
        brace = source.find("{", match.start(), match.end())
        depth = 0
        end = None
        for index in range(brace, len(source)):
            char = source[index]
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    end = index + 1
                    break
        if end is not None:
            spans.append((match.start(), end))
    return spans

spans = server_spans(text)
matching = []
for start, end in spans:
    block = text[start:end]
    if server_name_re.search(block):
        matching.append((start, end, block))

if not matching:
    # Already transformed configurations declare root and www separately.
    has_root = re.search(r"server_name\s+miconstructor\.es\s*;", text)
    has_www = re.search(r"server_name\s+www\.miconstructor\.es\s*;", text)
    if has_root and has_www and "MICONSTRUCTOR_CANONICAL_WWW_SERVER_BEGIN" in text:
        print("Canonical www redirect already configured with dedicated server blocks.")
        raise SystemExit(0)
    raise SystemExit("No se encontró un bloque MiConstructor con root + www.")

https_block = None
has_ipv6_http = False
has_ipv6_https = False

# Replace from the end so byte offsets remain valid.
for start, end, block in reversed(matching):
    if re.search(r"(?m)^\s*listen\s+\[::\]:80\b", block):
        has_ipv6_http = True
    if re.search(r"(?m)^\s*listen\s+\[::\]:443\b", block):
        has_ipv6_https = True
    if re.search(r"(?m)^\s*listen\s+(?:\[::\]:)?443\b[^;]*\bssl\b[^;]*;", block):
        https_block = block
    new_block = server_name_re.sub("server_name miconstructor.es;", block, count=1)
    text = text[:start] + new_block + text[end:]

if https_block is None:
    raise SystemExit("No se encontró el bloque HTTPS de MiConstructor generado por Certbot.")

ssl_directive_re = re.compile(
    r"(?m)^\s*(ssl_certificate(?:_key)?\s+[^;]+;|"
    r"include\s+/etc/letsencrypt/options-ssl-nginx\.conf;|"
    r"ssl_dhparam\s+[^;]+;)\s*(?:#.*)?$"
)
ssl_directives = []
for match in ssl_directive_re.finditer(https_block):
    directive = match.group(1).strip()
    if directive not in ssl_directives:
        ssl_directives.append(directive)

if not any(item.startswith("ssl_certificate ") for item in ssl_directives):
    raise SystemExit("No se encontró ssl_certificate en el bloque HTTPS.")
if not any(item.startswith("ssl_certificate_key ") for item in ssl_directives):
    raise SystemExit("No se encontró ssl_certificate_key en el bloque HTTPS.")

http_listens = ["    listen 80;"]
if has_ipv6_http:
    http_listens.append("    listen [::]:80;")

https_listens = ["    listen 443 ssl;"]
if has_ipv6_https:
    https_listens.append("    listen [::]:443 ssl;")

ssl_lines = "\n".join(f"    {item}" for item in ssl_directives)
redirect = "return 301 https://miconstructor.es$request_uri;"

www_blocks = f"""

# MICONSTRUCTOR_CANONICAL_WWW_SERVER_BEGIN
server {{
{chr(10).join(http_listens)}
    server_name www.miconstructor.es;
    {redirect}
}}

server {{
{chr(10).join(https_listens)}
    server_name www.miconstructor.es;
{ssl_lines}
    {redirect}
}}
# MICONSTRUCTOR_CANONICAL_WWW_SERVER_END
"""

path.write_text(text.rstrip() + www_blocks + "\n", encoding="utf-8")
print(f"Converted {len(matching)} MiConstructor block(s) and created dedicated www redirect servers.")
PY

if ! "$NGINX_BIN" -t; then
  cp -a "$BACKUP" "$CONFIG_FILE"
  "$NGINX_BIN" -t || true
  echo "Nginx validation failed; configuration restored from $BACKUP" >&2
  exit 1
fi

"$SYSTEMCTL_BIN" reload nginx

echo "Canonical www redirect applied successfully with dedicated server blocks."
echo "Backup: $BACKUP"
