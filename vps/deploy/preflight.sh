#!/usr/bin/env bash
set -Eeuo pipefail

echo "Node: $(node --version)"
echo "PostgreSQL client: $(psql --version)"
echo "Espacio disponible:"
df -h /var/www /var/lib 2>/dev/null || df -h /
echo "Memoria:"
free -h
echo "Puerto reservado para MiConstructor:"
ss -ltnp '( sport = :3200 )' || true
echo "Servicios ONOFFCARGO (solo lectura; no se modifican):"
systemctl --no-pager --type=service --state=running | grep -Ei 'onoffcargo|matcher' || true
