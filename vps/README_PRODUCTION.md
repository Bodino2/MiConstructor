# MiConstructor en producción (VPS)

Este directorio es la aplicación real y no utiliza los datos de demostración del prototipo.

## Separación respecto a ONOFFCARGO

- usuario Linux: `miconstructor`;
- aplicación: `/var/www/miconstructor`;
- datos privados: `/var/lib/miconstructor/uploads`;
- configuración: `/etc/miconstructor/api.env`;
- base PostgreSQL: `miconstructor`, con propietario `miconstructor`;
- servicio: `miconstructor-api.service`;
- puerto local: `127.0.0.1:3200`;
- hostname recomendado durante la puesta en marcha: `app.miconstructor.es`.

No se reutilizan la base, el usuario, los directorios, el puerto ni los servicios de ONOFFCARGO.

## Primera instalación

1. Ejecutar `deploy/preflight.sh` y guardar el resultado.
2. Crear el usuario Linux sin shell interactiva y los directorios anteriores.
3. Crear una base y un rol PostgreSQL exclusivos, con contraseña aleatoria.
4. Copiar `.env.example` a `/etc/miconstructor/api.env`, completar secretos y aplicar permisos `0600 root:miconstructor`.
5. Instalar dependencias con `npm ci`, ejecutar `npm run check` y `npm run build` dentro de `vps/`.
6. Ejecutar `npm run migrate:prod` y, una sola vez, crear el administrador con `ADMIN_BOOTSTRAP_PASSWORD=... npm run seed:admin`.
7. Retirar `ADMIN_BOOTSTRAP_PASSWORD` del archivo de entorno.
8. Instalar y activar `miconstructor-api.service` y el timer semanal.
9. Instalar la configuración Nginx, comprobar con `nginx -t` y obtener TLS con Certbot.
10. Comprobar `/health/live`, `/health/ready`, alta, email, test profesional, propuesta, shortlist y webhook Stripe antes de abrir el acceso.

## Publicación sin corte

Cada release se instala en un directorio nuevo. Después de `npm ci`, build, migraciones y healthcheck local, el enlace `/var/www/miconstructor/current` cambia de forma atómica al release nuevo y se reinicia únicamente `miconstructor-api.service`. ONOFFCARGO no se reinicia.

## Backups y mutare ulterioară

`deploy/backup.sh` creează un `pg_dump` și o arhivă a fișierelor, ambele cu sume de control. `deploy/restore-check.sh` le validează. Pentru mutarea MiConstructor pe alt VPS:

1. instalezi Node 22+, PostgreSQL 16+ și Nginx;
2. restaurezi `database.dump` într-o bază goală;
3. restaurezi `uploads.tar.zst` în `/var/lib/miconstructor/uploads`;
4. copiezi mediul, schimbând parolele și URL-ul dacă este necesar;
5. pornești serviciul și verifici healthcheck-ul;
6. schimbi DNS doar după validare.

Schema și stocarea nu depind de IP-ul actual, deci mutarea nu necesită rescrierea aplicației.
