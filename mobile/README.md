# MiConstructor Mobile

Aplicación nativa compartida para iOS y Android, construida con Expo/React Native y conectada al mismo backend de producción que `miconstructor.es`.

## Arquitectura

- Expo SDK 57 / React Native 0.86.
- Un único código TypeScript para iOS y Android.
- Sesiones móviles mediante token opaco de servidor (`Authorization: Bearer ...`).
- Token guardado con `expo-secure-store` (Keychain en iOS / Keystore en Android).
- API por defecto: `https://miconstructor.es`.
- Identificadores nativos: `es.miconstructor.app` en iOS y Android.

## Funcionalidad incluida

- login, recuperación de contraseña y persistencia de sesión;
- registro de cliente o profesional;
- test técnico de 15 preguntas por especialidad durante el alta profesional;
- aceptación de Privacidad y Términos y Condiciones;
- cliente: proyectos, publicación, propuestas y shortlist/contacto;
- profesional: oportunidades compatibles, propuestas y resumen de facturación;
- soporte: chat persistente usuario ↔ administración;
- administración: KPI, usuarios, proyectos, audit y bandeja de soporte;
- información legal/contacto y enlaces a Aviso Legal, Privacidad, Cookies, T&C y SEPA;
- cierre de sesión que revoca también la sesión del servidor.

## Desarrollo

```bash
cd mobile
npm install
cp .env.example .env
npm run start
```

Android:

```bash
npm run android
```

iOS (requiere macOS para simulador local):

```bash
npm run ios
```

Validación que también usa CI:

```bash
npm run typecheck
npm run bundle:android
npm run bundle:ios
```

## Builds EAS

`eas.json` incluye perfiles `development`, `preview` y `production`.

Cuando exista una cuenta Expo/EAS y las credenciales de Apple/Google estén preparadas:

```bash
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
npx eas-cli@latest build --platform ios --profile preview
```

Para publicación se usan builds `production`, y después `eas submit` con las cuentas oficiales de App Store Connect y Google Play Console.

## Seguridad

La app no guarda la contraseña. Solo almacena el token opaco de sesión en el almacén seguro del sistema operativo. El backend acepta ese token únicamente tras verificar su hash en `auth_sessions`; las sesiones revocadas o expiradas dejan de funcionar.

La aplicación móvil declara `x-miconstructor-client: mobile`. En producción, las peticiones web siguen protegidas por Origin/CSRF, mientras que las peticiones nativas autenticadas usan Bearer token y no dependen de cookies del navegador.

## Pendiente antes de publicación en stores

- icono final 1024×1024 y recursos de splash con branding aprobado;
- capturas de pantalla por tamaños exigidos por cada store;
- cuentas Apple Developer y Google Play Developer;
- política de privacidad pública accesible por HTTPS;
- revisión final del listing, clasificación de contenido y formularios Data Safety / App Privacy;
- Stripe/SEPA nativo puede añadirse cuando `billingEnabled` esté activado; por ahora la app muestra estado/facturas y abre la configuración segura web del mandato.
