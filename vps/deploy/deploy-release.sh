#!/usr/bin/env bash
set -Eeuo pipefail

SHA="${1:-}"
BASE="${MICONSTRUCTOR_BASE:-/var/www/miconstructor}"
ENV_FILE="${MICONSTRUCTOR_ENV_FILE:-/etc/miconstructor/api.env}"
REPO_URL="${MICONSTRUCTOR_REPO_URL:-https://github.com/Bodino2/MiConstructor.git}"
SERVICE="miconstructor-api.service"
PRELIVE_PORT="${MICONSTRUCTOR_PRELIVE_PORT:-3201}"
BACKUP_ROOT="${MICONSTRUCTOR_BACKUP_ROOT:-/var/backups/miconstructor}"
UPLOAD_ROOT="${MICONSTRUCTOR_UPLOAD_ROOT:-/var/lib/miconstructor/uploads}"

fail() {
  echo "STOP: $*" >&2
  exit 1
}

[[ $EUID -eq 0 ]] || fail "deploy-release.sh trebuie rulat ca root"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || fail "primul argument trebuie sa fie SHA-ul complet de 40 caractere"
[[ -r "$ENV_FILE" ]] || fail "nu pot citi $ENV_FILE"
command -v systemd-run >/dev/null || fail "systemd-run lipseste"
command -v systemctl >/dev/null || fail "systemctl lipseste"
command -v runuser >/dev/null || fail "runuser lipseste"
command -v curl >/dev/null || fail "curl lipseste"
command -v git >/dev/null || fail "git lipseste"
command -v npm >/dev/null || fail "npm lipseste"
command -v pg_dump >/dev/null || fail "pg_dump lipseste"
command -v tar >/dev/null || fail "tar lipseste"
command -v zstd >/dev/null || fail "zstd lipseste"
command -v ss >/dev/null || fail "ss lipseste"

RELEASE="$BASE/releases/$SHA"
PREVIOUS="$(readlink -f "$BASE/current" 2>/dev/null || true)"
TAG="${SHA:0:12}-$$"
ENV_CHECK_UNIT="miconstructor-env-$TAG"
BACKUP_DB_UNIT="miconstructor-backup-$TAG"
MIGRATE_UNIT="miconstructor-migrate-$TAG"
PRELIVE_UNIT="miconstructor-prelive-$TAG"
PRELIVE_STARTED=false

cleanup() {
  if [[ "$PRELIVE_STARTED" == true ]]; then
    systemctl stop "$PRELIVE_UNIT.service" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

validate_env_structure() {
  python3 - "$ENV_FILE" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
raw = path.read_bytes()
if b"\x00" in raw:
    raise SystemExit("api.env contine NUL")
for index, byte in enumerate(raw):
    if byte == 13 and (index + 1 >= len(raw) or raw[index + 1] != 10):
        raise SystemExit(f"api.env contine CR izolat la byte {index}")
text = raw.decode("utf-8")
invalid = []
for number, line in enumerate(text.splitlines(), 1):
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        continue
    if "=" not in stripped:
        invalid.append(number)
        continue
    name = stripped.split("=", 1)[0].strip()
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
        invalid.append(number)
if invalid:
    raise SystemExit(f"api.env are linii invalide: {invalid}")
print("ENV_STRUCTURE_OK")
PY
}

validate_env_runtime() {
  systemd-run --quiet --wait --pipe --collect \
    --unit="$ENV_CHECK_UNIT" \
    -p User=miconstructor \
    -p Group=miconstructor \
    -p "EnvironmentFile=$ENV_FILE" \
    /usr/bin/python3 -c '
import os
required = ["DATABASE_URL", "SESSION_PEPPER", "TOKEN_PEPPER", "BILLING_JOB_SECRET", "ADMIN_EMAIL", "GEOAPIFY_API_KEY"]
missing = [name for name in required if not os.environ.get(name)]
if missing:
    raise SystemExit("missing env: " + ",".join(missing))
key = os.environ["GEOAPIFY_API_KEY"]
if len(key) < 16 or any(ord(ch) < 32 or ord(ch) == 127 for ch in key):
    raise SystemExit("invalid GEOAPIFY_API_KEY")
if os.environ.get("HOST", "127.0.0.1") != "127.0.0.1":
    raise SystemExit("HOST must be 127.0.0.1")
if os.environ.get("PORT", "3200") != "3200":
    raise SystemExit("PORT must be 3200")
print("ENV_RUNTIME_OK")
'
}

backup_before_migration() {
  local timestamp target
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  target="$BACKUP_ROOT/$timestamp"
  install -d -m 0700 "$target"

  systemd-run --quiet --wait --pipe --collect \
    --unit="$BACKUP_DB_UNIT" \
    -p "EnvironmentFile=$ENV_FILE" \
    /bin/bash -c 'exec pg_dump --format=custom --no-owner --no-acl --file="$1/database.dump" "$DATABASE_URL"' _ "$target"

  [[ -d "$UPLOAD_ROOT/objects" ]] || fail "lipseste $UPLOAD_ROOT/objects"
  tar --create --zstd --file="$target/uploads.tar.zst" --directory="$UPLOAD_ROOT" objects
  sha256sum "$target/database.dump" "$target/uploads.tar.zst" > "$target/SHA256SUMS"
  echo "BACKUP_OK=$target"
}

prepare_release() {
  install -d -o miconstructor -g miconstructor "$BASE/releases"

  if [[ -e "$RELEASE" && ! -d "$RELEASE/.git" ]]; then
    fail "$RELEASE exista dar nu este checkout Git valid"
  fi

  if [[ ! -d "$RELEASE/.git" ]]; then
    runuser -u miconstructor -- git clone --no-checkout "$REPO_URL" "$RELEASE"
  fi

  chown -R miconstructor:miconstructor "$RELEASE"
  local remote remote_main actual
  remote="$(runuser -u miconstructor -- git -C "$RELEASE" remote get-url origin)"
  [[ "$remote" == "$REPO_URL" ]] || fail "origin neasteptat: $remote"

  runuser -u miconstructor -- git -C "$RELEASE" fetch --quiet origin main
  remote_main="$(runuser -u miconstructor -- git -C "$RELEASE" rev-parse origin/main)"
  [[ "$remote_main" == "$SHA" ]] || fail "SHA-ul cerut nu este HEAD-ul origin/main: $remote_main"

  runuser -u miconstructor -- git -C "$RELEASE" checkout --quiet --detach "$SHA"
  actual="$(runuser -u miconstructor -- git -C "$RELEASE" rev-parse HEAD)"
  [[ "$actual" == "$SHA" ]] || fail "checkout SHA mismatch: $actual"
  echo "RELEASE_SHA_OK=$actual"
}

build_release() {
  cd "$RELEASE/vps"
  runuser -u miconstructor -- env NODE_ENV=development npm ci --include=dev --no-audit --no-fund
  runuser -u miconstructor -- env NODE_ENV=development npm run build
  [[ -f dist/src/server.js ]] || fail "dist/src/server.js lipseste"
  [[ -f dist/src/migrate.js ]] || fail "dist/src/migrate.js lipseste"
  echo "BUILD_OK"
}

migrate_release() {
  systemd-run --quiet --wait --pipe --collect \
    --unit="$MIGRATE_UNIT" \
    -p User=miconstructor \
    -p Group=miconstructor \
    -p "WorkingDirectory=$RELEASE/vps" \
    -p "EnvironmentFile=$ENV_FILE" \
    /usr/bin/env NODE_ENV=production /usr/bin/node dist/src/migrate.js
  echo "MIGRATIONS_OK"
}

wait_ready() {
  local url="$1"
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

prelive_release() {
  if ss -ltn | grep -q ":$PRELIVE_PORT "; then
    fail "portul pre-live $PRELIVE_PORT este ocupat"
  fi

  systemd-run --quiet --unit="$PRELIVE_UNIT" --collect \
    -p User=miconstructor \
    -p Group=miconstructor \
    -p "WorkingDirectory=$RELEASE/vps" \
    -p "EnvironmentFile=$ENV_FILE" \
    /usr/bin/env NODE_ENV=production HOST=127.0.0.1 PORT="$PRELIVE_PORT" \
    /usr/bin/node dist/src/server.js
  PRELIVE_STARTED=true

  if ! wait_ready "http://127.0.0.1:$PRELIVE_PORT/health/ready"; then
    journalctl -u "$PRELIVE_UNIT.service" -n 120 --no-pager || true
    fail "pre-live healthcheck timeout"
  fi

  curl -fsS --max-time 5 "http://127.0.0.1:$PRELIVE_PORT/" >/dev/null
  curl -fsS --max-time 5 "http://127.0.0.1:$PRELIVE_PORT/guia" >/dev/null
  curl -fsS --max-time 5 "http://127.0.0.1:$PRELIVE_PORT/opiniones" >/dev/null
  curl -fsS --max-time 5 "http://127.0.0.1:$PRELIVE_PORT/qr/espana-clientes-v1.svg" >/dev/null
  curl -fsS --max-time 5 "http://127.0.0.1:$PRELIVE_PORT/qr/espana-profesionales-v1.svg" >/dev/null
  curl -fsS --max-time 5 "http://127.0.0.1:$PRELIVE_PORT/guide-nav.js" | grep -Fq '/#como-funciona'

  systemctl stop "$PRELIVE_UNIT.service" >/dev/null 2>&1 || true
  PRELIVE_STARTED=false
  echo "PRELIVE_FULL_OK"
}

rollback() {
  echo "ROLLBACK_START"
  if [[ -n "$PREVIOUS" && -d "$PREVIOUS" ]]; then
    ln -sfn "$PREVIOUS" "$BASE/current.rollback"
    mv -Tf "$BASE/current.rollback" "$BASE/current"
    systemctl restart "$SERVICE" || true
    wait_ready "http://127.0.0.1:3200/health/ready" || true
    echo "ROLLBACK_CURRENT=$(readlink -f "$BASE/current" 2>/dev/null || true)"
  else
    echo "ROLLBACK_SKIPPED=no previous release" >&2
  fi
}

activate_release() {
  ln -sfn "$RELEASE" "$BASE/current.new"
  mv -Tf "$BASE/current.new" "$BASE/current"
  echo "CURRENT=$(readlink -f "$BASE/current")"

  if ! systemctl restart "$SERVICE"; then
    rollback
    fail "$SERVICE restart failed"
  fi

  if ! wait_ready "http://127.0.0.1:3200/health/ready"; then
    journalctl -u "$SERVICE" -n 120 --no-pager || true
    rollback
    fail "live healthcheck timeout"
  fi
  echo "LOCAL_LIVE_OK"
}

public_smoke() {
  curl -fsS --max-time 8 https://miconstructor.es/health/ready >/dev/null || return 1
  curl -fsS --max-time 8 https://miconstructor.es/ >/dev/null || return 1
  curl -fsS --max-time 8 https://miconstructor.es/guia >/dev/null || return 1
  curl -fsS --max-time 8 https://miconstructor.es/opiniones >/dev/null || return 1
  curl -fsS --max-time 8 https://miconstructor.es/qr/espana-clientes-v1.svg >/dev/null || return 1
  curl -fsS --max-time 8 https://miconstructor.es/qr/espana-profesionales-v1.svg >/dev/null || return 1
  { curl -fsS --max-time 8 https://miconstructor.es/guide-nav.js | grep -Fq '/#como-funciona'; } || return 1
  echo "PUBLIC_SMOKE_OK"
}

echo "=== MiConstructor deterministic deploy ==="
echo "TARGET_SHA=$SHA"
echo "PREVIOUS=${PREVIOUS:-none}"
validate_env_structure
validate_env_runtime
prepare_release
build_release
backup_before_migration
migrate_release
prelive_release
activate_release
if ! public_smoke; then
  rollback
  fail "public smoke failed"
fi

echo "=========================================="
echo "MICONSTRUCTOR_DEPLOY_OK"
echo "LIVE_SHA=$SHA"
echo "CURRENT=$(readlink -f "$BASE/current")"
echo "=========================================="
