# MiConstructor en producción (VPS)

Este directorio es la aplicación real y no utiliza los datos de demostración del prototipo.

## Separación respecto a otros proyectos del VPS

- usuario Linux: `miconstructor`;
- aplicación: `/var/www/miconstructor`;
- datos privados: `/var/lib/miconstructor/uploads`;
- configuración: `/etc/miconstructor/api.env`;
- base PostgreSQL: `miconstructor`, con propietario `miconstructor`;
- servicio: `miconstructor-api.service`;
- puerto local: `127.0.0.1:3200`;
- puerto temporal de pre-live: `127.0.0.1:3201`;
- hostname de producción: `miconstructor.es`.

El flujo de despliegue de MiConstructor no inspecciona, reinicia ni modifica servicios, repositorios o directorios de otros proyectos del VPS.

## Primera instalación

1. Ejecutar `deploy/preflight.sh` y guardar el resultado.
2. Crear el usuario Linux y los directorios anteriores.
3. Crear una base y un rol PostgreSQL exclusivos, con contraseña aleatoria.
4. Copiar `.env.example` a `/etc/miconstructor/api.env`, completar secretos y aplicar permisos `0600 root:miconstructor`.
5. Instalar dependencias con `npm ci --include=dev`, ejecutar `npm run check` y `npm run build` dentro de `vps/`.
6. Ejecutar `npm run migrate:prod` y, una sola vez, crear el administrador con `ADMIN_BOOTSTRAP_PASSWORD=... npm run seed:admin`.
7. Retirar `ADMIN_BOOTSTRAP_PASSWORD` del archivo de entorno.
8. Instalar y activar `miconstructor-api.service` y el timer semanal.
9. Instalar la configuración Nginx, comprobar con `nginx -t` y obtener TLS con Certbot.
10. Comprobar `/health/live`, `/health/ready`, alta, email, test profesional, propuesta, shortlist y webhook Stripe antes de abrir el acceso.

## Publicación determinista sin corte

Las actualizaciones normales se hacen con `deploy/deploy-release.sh`. El script recibe el SHA completo que ya ha pasado CI en GitHub y ejecuta en este orden:

1. valida la estructura de `/etc/miconstructor/api.env` sin cargar secretos en el shell root;
2. valida mediante `systemd` las variables obligatorias y la clave Geoapify;
3. descarga o reutiliza el release como usuario `miconstructor`, evitando problemas de ownership Git;
4. instala también las dependencias de desarrollo necesarias para compilar TypeScript;
5. crea un backup de PostgreSQL y uploads;
6. aplica migraciones usando el mismo `EnvironmentFile` que producción;
7. arranca el release nuevo en `127.0.0.1:3201`, forzando ese puerto después de cargar el EnvironmentFile;
8. verifica home, Guía, Opiniones, ambos QR nacionales y el fix de navegación;
9. cambia `/var/www/miconstructor/current` de forma atómica;
10. reinicia únicamente `miconstructor-api.service`, comprueba health local y después las rutas públicas;
11. si el servicio nuevo no queda ready, restaura automáticamente el enlace al release anterior.

Uso, desde un checkout que ya contenga el script:

```bash
sudo bash vps/deploy/deploy-release.sh <SHA_COMPLETO_VERDE_EN_CI>
```

Tras la primera publicación que incluya este script, también se puede ejecutar desde el release activo:

```bash
sudo bash /var/www/miconstructor/current/vps/deploy/deploy-release.sh <SHA_COMPLETO_VERDE_EN_CI>
```

No se debe desplegar desde un checkout de trabajo mutable ni hacer cambios manuales directamente dentro de `current`.

## Backups y migración futura

`deploy/backup.sh` crea un `pg_dump` y una archivación de uploads, ambos con sumas de control. `deploy/restore-check.sh` los valida. Para mover MiConstructor a otro VPS:

1. instalar Node 22+, PostgreSQL 16+ y Nginx;
2. restaurar `database.dump` en una base vacía;
3. restaurar `uploads.tar.zst` en `/var/lib/miconstructor/uploads`;
4. copiar el entorno, rotando secretos y cambiando URL si hace falta;
5. iniciar el servicio y verificar healthchecks;
6. cambiar DNS solo después de validar la nueva instancia.

El esquema y el almacenamiento no dependen de la IP actual, por lo que la migración no requiere reescribir la aplicación.
