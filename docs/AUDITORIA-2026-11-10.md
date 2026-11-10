# Auditoría del 10 de noviembre de 2026 — aplicación completa

Alcance: backend (Express + MongoDB), SPA de Angular, despliegue previsto en
Vercel y preparación para entrega. Todo se probó contra un **MongoDB en
memoria** con datos de demostración: no se tocó la base del usuario, ni se
enviaron correos reales, ni se ejecutó ningún cobro.

## Estado

**LISTO PARA REVISIÓN FINAL**, con las salvedades del apartado final (no hay
pasarela de pago: el cobro se confirma por WhatsApp, y el panel administrativo
sigue sin alta de productos ni categorías).

## P0 — tienda inutilizable en cualquier acceso por HTTP de red

**Síntoma.** Abriendo la tienda por `http://192.168.0.12:3000` (la IP de la red,
que es como se abre desde el móvil o desde otro equipo) la página se quedaba
**en blanco**. En `localhost` cargaba bien, lo que hacía pensar que el problema
era del navegador.

**Causa.** La CSP que monta `helmet` en `backend/src/app.js` heredaba de sus
directivas por defecto `upgrade-insecure-requests`, y salía siempre, también en
desarrollo y por HTTP plano. Esa directiva convierte en `https://` **todos** los
recursos http de la página: el navegador intentaba descargar el JS y el CSS por
HTTPS contra un servidor que no habla TLS, el handshake fallaba y Angular ni
siquiera arrancaba. Los orígenes `localhost` y `127.0.0.1` son "potentially
trustworthy" y el navegador no los sube, por eso el fallo solo se reproducía con
la IP de la red.

**Corrección.** `upgrade-insecure-requests` se emite ahora **solo cuando la
conexión es segura** (`req.secure`, que ya tiene en cuenta `trust proxy`). En
producción, con HTTPS de verdad, la directiva sigue ahí.

**Verificación.** Chromium headless: en `http://127.0.0.1` el DOM renderizaba
(57 KB) y en `http://192.168.0.12` el DOM llegaba vacío con «handshake failed»
en consola. Después del cambio, las dos rutas renderizan.

## P1 — la recuperación de contraseña estaba rota

**Síntoma.** El correo de «restablece tu contraseña» apuntaba a
`{FRONTEND_URL}/reset-password.html`. La SPA de Angular sirve todo desde el
router y **no tiene** esa ruta: el enlace del correo llevaba a la página 404.
Peor: la pantalla de inicio de sesión no tenía ningún enlace a
«olvidé mi contraseña», así que la función era inalcanzable desde la tienda.

**Corrección.**

- Pantallas nuevas en Angular: `/recuperar` (pedir el enlace) y
  `/reset-password?token=…` (cambiarla), en el mismo componente y con los
  mismos estilos que el acceso, para no romper la identidad visual.
- El backend envía el enlace a `/reset-password?token=…` (ruta del router).
- `vercel.json` reescribe las dos rutas a `index.html`.
- El enlace antiguo `/reset-password.html` redirige, conservando el token.
- El formulario de inicio de sesión enlaza a la nueva pantalla.

La respuesta de «pedir el enlace» **no dice si el correo existe**: el servidor
responde igual en los dos casos y la pantalla mantiene esa ambigüedad a
propósito, para no poder usarse para listar clientes.

## P1 — el panel de administración no dejaba operar la tienda

El panel listaba productos y pedidos y cambiaba el estado de un pedido, pero no
permitía **reponer stock ni cambiar un precio**: la única forma de arreglar un
producto agotado era entrar en la base de datos a mano.

**Corrección.** Edición en línea en la pestaña de productos: precio, stock y
visibilidad, con validación en el cliente (enteros, sin negativos) y guardado
con `PATCH /api/admin/productos/:id`, que ya existía y ya está protegido por
rol en el servidor.

## P2 — el límite de 99 unidades del carrito era del cliente, no del servidor

`schemas.addToCart` limitaba la cantidad **de cada petición** a 99, pero el
total del mismo producto en el carrito no se comprobaba: dos altas de 50
dejaban 100 unidades y el servidor lo aceptaba. El frontend recortaba a 99, así
que solo se veía con dos pestañas o una llamada directa a la API.

**Corrección.** El tope es ahora por producto en el carrito y vive en el modelo
(`CANTIDAD_MAXIMA_POR_ITEM`), que es el sitio donde la invariante es de nadie
más. La respuesta es `400 INVALID_QUANTITY` y el incremento se revierte.

## P1 — dos compras simultáneas con la misma clave devolvían un error

Con la misma `Idempotency-Key`, la segunda petición perdía la carrera por el
carrito y devolvía `409 CHECKOUT_IN_PROGRESS` aunque la primera **sí** hubiera
creado el pedido. El cliente veía un error y podía pensar que su compra no se
guardó (y volver a comprar).

**Corrección.** Cuando la transacción falla con `CHECKOUT_IN_PROGRESS` (o con la
violación del índice único de idempotencia) se busca el pedido de esa clave
durante un instante breve; si aparece, se devuelve **ese** pedido con `200`. Si
no aparece, se devuelve el error original.

## P0 — la compensation del checkout inventaba stock (sin replica set)

En un `mongod` local normal (sin `--replSet`, que es lo que documenta el
README) no hay transacciones, y la coherencia la deja la compensación del
controlador. Esa compensación devolvía el stock de **todas** las líneas del
carrito, se hubieran descontado o no:

- Si el fallo era «el carrito ya tiene otro checkout en curso», no se había
  descontado nada: cada intento fallido **sumaba** stock que nunca había salido.
- Si el stock se agotaba en una línea, el `bulkWrite` aplicaba las anteriores y
  la compensación devolvía también la de la que no se había descontado.

El efecto era **stock fantasma**: el inventario crecía con cada checkout
fallido y la tienda podía vender producto inexistente.

**Corrección.** Se anota qué líneas se descontaron de verdad y la compensación
devuelve solo esas. En el camino transaccional (Atlas, replica set) el
`bulkWrite` sigue siendo uno solo: la transacción garantiza el todo-o-nada.

## Verificación

| Comprobación | Resultado |
|---|---|
| Pruebas del backend | **285** aprobadas (19 suites + 1 nueva) |
| Pruebas del frontend anterior | **43** aprobadas |
| Pruebas de Angular (navegador) | **28** aprobadas |
| Recorrido por API contra MongoDB temporal | **52/52** |
| Recorrido en Chromium real | **17/17** |
| `npm run lint` | sin errores |
| `npm run typecheck` + `check:angular` | sin errores |
| Build de producción | correcto |
| `npm audit --omit=dev` (raíz y Angular) | 0 avisos |

El recorrido en navegador cubrió: registro, catálogo, búsqueda, carrito con
cambio de cantidad, checkout con el desglose de importes (artículos, envío,
IVA, total), creación del pedido con su número de orden y el enlace de
WhatsApp, historial, cancelación con devolución del stock, y edición de stock
desde el panel de administración.

## Qué NO se corrigió (y por qué)

- **No hay pasarela de pago.** El cobro se confirma por WhatsApp y el pedido
  queda `pendiente` hasta que alguien marca `estadoPago: pagado` en el panel.
  Añadir una pasarela es un proyecto aparte (credenciales, webhooks con firma,
  idempotencia de cobros) y no se ha inventado ninguna integración.
- **No hay compra como invitado.** El carrito y el checkout exigen sesión; el
  pedido necesita un usuario al que pertenece.
- **No hay cupones.** No existen en el modelo ni en la API. El campo de
  descuento del pedido se eliminó en una ronda anterior en vez de dejar un
  campo muerto.
- **Faltan las pantallas de perfil, direcciones y contacto** en Angular: sus
  rutas antiguas redirigen a «Mis pedidos». La API sí las soporta
  (`/auth/profile`, `/auth/addresses`, `/contact`).
- **El alta de productos, categorías y marcas** desde el panel sigue sin
  existir en Angular (sí en la API). Lo que se añadió fue la edición de lo
  que ya está en el catálogo.
- **`frontend/img/hero-secuencia/` (17 MB, 153 archivos)** pertenece a la
  pantalla de bienvenida anterior, que la SPA de Angular ya no sirve. Está
  versionada porque el frontend anterior se conserva a propósito, pero no lo
  usa nadie: es el candidato más claro a podar en la siguiente ronda.

## Cómo comprobar la salud del servicio

`GET /api/health` responde 200 sin depender de la base. En producción solo
devuelve «vivo» salvo que se envíe la cabecera `x-health-token` con el valor de
`HEALTH_DETAIL_TOKEN`; con ella, añade el estado de Mongo, Redis y de la
configuración.

## Cómo revertir un despliegue

Vercel: *Deployments → el despliegue anterior → ⋯ → Promote to Production*.
La base de datos no se toca al desplegar: no hay migraciones en el arranque y
los índices se crean con `syncIndexes()` (en un entorno serverless hay que
sincronizarlos una vez por adelantado, porque cada invocación es un proceso
nuevo).
