# CONTINUAR — Migración frontend → Angular

**Fecha:** 2026-11-04  
**Objetivo actual:** terminar la migración/rediseño del frontend de By Jers a Angular 20+ en una sola pasada, manteniendo el backend intacto.

## Estado actual

- Angular CLI `20.3.42` scaffold en `frontend/angular`.
- Build de Angular: **OK** (limpio, lazy chunks: home, admin, catalogo, producto, carrito, checkout, auth, pedidos, looks).
- Lint + type-check del repo: **OK** (`npm run check`).
- Type-check de Angular app/spec: **OK**.
- Build output: `frontend/angular/dist/angular/browser`.

## Avances de esta sesión

- Corregido `provideBrowserAnimationsAsync` → `provideAnimationsAsync` en `frontend/angular/src/app/app.config.ts`.
- Corregidos los `@use` de estilos en `frontend/angular/src/styles.scss`.
- Cambiado `@import '@fontsource-variable/...'` → `@use '@fontsource-variable/...'` para evitar deprecación Sass.
- Actualizado `frontend/angular/src/app/app.spec.ts`.
- Añadido ignore de ESLint para `frontend/angular/dist/**` en `eslint.config.js`.
- Integrado el build de Angular en `scripts/preparar-estatico.mjs` (copia `frontend/angular/dist/angular/browser` → `frontend/public`, con respaldo a la versión estática si no hay build).
- Añadidas rutas y componentes base (Home, Admin) con standalone + lazy loading (`loadComponent`).
- Migrado el cliente API a Angular service (`frontend/angular/src/app/services/api.service.ts`) con la misma política de red, sesión, CSRF y errores.
- Implementadas pantallas: Home, Catálogo, Producto, Carrito, Checkout, Auth, Pedidos y Lookbook (3D) conectadas al `ApiService`.

## Verificación

- `cd frontend/angular && npm run build` → OK.
- `npm run check` en raíz → OK.
- `npx tsc -p frontend/angular/tsconfig.app.json --noEmit` → OK.
- `npx tsc -p frontend/angular/tsconfig.spec.json --noEmit` → OK.
- `node scripts/preparar-estatico.mjs` → OK (armó `frontend/public/` desde el build Angular).
- `npm run test:frontend` → OK (3 suites, 43 tests).

## Estado git

- Hay muchas líneas en rojo (`D`) porque el frontend viejo estaba en la raíz y ahora vive bajo `frontend/`.
- `frontend/` aparece como no trackeado (`??`).
- Esto no significa que se borró funcionalidad en esta sesión; parece una reorganización/estado de rutas.
- Cambios propios de esta sesión: `eslint.config.js`, `frontend/angular/src/app/app.config.ts`, `frontend/angular/src/styles.scss`, `frontend/angular/src/app/app.spec.ts`, `scripts/preparar-estatico.mjs`, `frontend/angular/src/app/app.ts`, `frontend/angular/src/app/app.routes.ts`, `frontend/angular/src/app/home/*`, `frontend/angular/src/app/admin/*`, `frontend/angular/src/app/services/api.service.ts`, `frontend/angular/src/app/catalogo/*`, `frontend/angular/src/app/producto/*`, `frontend/angular/src/app/carrito/*`, `frontend/angular/src/app/checkout/*`, `frontend/angular/src/app/auth/*`, `frontend/angular/src/app/pedidos/*`, `frontend/angular/src/app/looks/*`.

## Próximos pasos

1. ~~Integrar el build de Angular en `scripts/preparar-estatico.mjs`~~ ✅ Hecho.
2. ~~Añadir rutas y componentes Angular para la tienda y el admin~~ ✅ Hecho (Home, Admin, Catálogo, Producto, Carrito, Checkout, Auth, Pedidos, Looks con lazy).
3. ~~Migrar cliente API a Angular services~~ ✅ Hecho (`ApiService`).
4. ~~Implementar pantallas: home, catálogo, producto, carrito, checkout, auth, pedidos, looks...~~ → Se implementaron las pantallas de tienda (Home, Catálogo, Producto, Carrito, Checkout, Auth) y de experiencia (Pedidos, Looks).
5. ~~Añadir animaciones 3D/GSAP/Three.js según plan aprobado~~ → Lookbook (3D) implementado.
6. Volver a ejecutar build, lint, typecheck y tests → ✅ Hecho (todo en verde).

## Restricciones activas

- Backend no debe modificarse.
- Angular 20+.
- Hash routing recomendado.
- SCSS + design tokens.
- Three.js procedural.
- GSAP.
- Tienda + admin.
- Fuentes self-hosted vía Fontsource.


## Sesión del 9–10 de noviembre de 2026

- Auditoría inicial y correcciones documentadas en docs/AUDITORIA-2026-11-09.md.
- Panel local de seguimiento en /home/juandagamer/Escritorio/by-jers-en-vivo, puerto 4317. Mantener la bitácora con avances verificables mediante node server.mjs event etapa titulo detalle desde esa carpeta. No representa pensamiento interno ni todas las herramientas automáticamente.
- NVIDIA GTX 1050 confirmada como renderizador WebGL en el panel con selección EGL de NVIDIA. npm run preview:gpu -- http://127.0.0.1:4317/ abre el panel.
- La portada de maquillaje de la tienda sigue pendiente: la apertura anterior solo verificó funcionamiento. No se ha generado video nuevo.


## Entrega del 10 de noviembre de 2026

Ver docs/ENTREGA.md y la actualización final de docs/AUDITORIA-2026-11-09.md. La instrucción antigua de no modificar backend quedó superada por la autorización del usuario para auditar y corregir toda la aplicación. Backend: 278 pruebas aprobadas; Angular: 18; frontend anterior: 43. Portada Three.js implementada con la foto original y cosméticos 3D. Dependencias de producción sin avisos conocidos tras actualizaciones y migración a Zod 4.6.7. Recorrido completo de compra probado con MongoDB temporal, sin tocar datos reales.


## Sesión del 10 de noviembre de 2026 (auditoría y correcciones)

Alcance: auditoría de la aplicación completa (backend + SPA de Angular) sobre un
MongoDB temporal, recorrido de compra en navegador real y preparación para
entrega. Detalle en `docs/AUDITORIA-2026-11-10.md`.

### P0 — la tienda se quedaba en blanco

La CSP de `app.js` heredaba de helmet la directiva `upgrade-insecure-requests`
siempre, también en HTTP plano. Al abrir la tienda por la IP de la red
(`http://192.168.0.12:3000`) el navegador subía **todos** los recursos a
`https://`, el handshake TLS fallaba contra el servidor HTTP y la página se
quedaba en blanco. Solo se veía en `localhost`, porque esos orígenes son
"potentially trustworthy" y el navegador no los sube. La directiva ahora se
emite solo cuando la conexión es segura (`req.secure`).

### P1 — la recuperación de contraseña estaba rota

El correo de recuperación apuntaba a `/reset-password.html`, una ruta que la SPA
de Angular no tiene: quien|club clickaba el enlace caía en la página 404.
Ahora hay pantallas `/recuperar` y `/reset-password` en Angular, el enlace del
backend apunta a la ruta del router, `vercel.json` las reescribe y el login
tiene el enlace «¿Olvidaste tu contraseña?».

### P1/P2 — correcciones de negocio

- El límite de 99 unidades del carrito era **por petición**: dos altas de 50
  dejaban 100 unidades. Ahora el tope es por producto en el carrito
  (`400 INVALID_QUANTITY`).
- Sin replica set, la compensación del checkout devolvía el stock de líneas que
  nunca se habían descontado (stock fantasma). Ahora solo devuelve lo aplicado.
- Dos peticiones simultáneas con la misma `Idempotency-Key` devolvían `409` a
  la segunda; ahora la segunda devuelve el mismo pedido.
- El panel de administración era de solo lectura: no se podía reponer stock ni
  cambiar un precio. Ahora hay edición en línea de precio, stock y visibilidad.

### Verificación

- Backend: 285 pruebas (19 + 1 suite nueva) aprobadas.
- Angular: 28 pruebas aprobadas en navegador.
- Frontend anterior: 43 pruebas aprobadas.
- Recorrido en navegador real (Chromium): 17/17 — registro, catálogo, carrito,
  checkout con desglose, pedido con enlace de WhatsApp, historial, cancelación y
  edición de stock en el panel. Sin errores de JavaScript.
- Recorrido por API: 52/52 comprobaciones contra MongoDB temporal.
