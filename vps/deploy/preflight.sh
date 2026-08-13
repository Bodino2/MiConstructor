#!/usr/bin/env bash
set -Eeuo pipefail

BASE=/var/www/miconstructor
ENV_FILE=/etc/miconstructor/api.env
SERVICE=miconstructor-api.service

echo "MiConstructor preflight"
echo "Node: $(node --version)"
echo "PostgreSQL client: $(psql --version)"
echo "Espacio disponible:"
df -h /var/www /var/lib 2>/dev/null || df -h /
echo "Memoria:"
free -h

echo "Usuario MiConstructor:"
id miconstructor

echo "Configuración MiConstructor:"
stat -c '%A %U:%G %n' "$ENV_FILE"

echo "Release actual:"
readlink -f "$BASE/current" 2>/dev/null || echo "current todavía no existe"

echo "Puerto local MiConstructor (3200):"
ss -ltnp '( sport = :3200 )' || true

echo "Servicio MiConstructor:"
systemctl --no-pager --full status "$SERVICE" 2>/dev/null | head -25 || true
