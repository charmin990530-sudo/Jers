# By Jers — API

API REST de la tienda (Node + Express + Mongoose). El frontend es HTML/CSS/JS
vanilla servido aparte; aquí sólo vive la API.

## Arranque en local

Un solo proceso sirve **el sitio y la API en el mismo puerto**, así que no hay
CORS, ni preflight, ni un segundo servidor con otro puerto que se desincronice.

```bash
# 1) MongoDB local
sudo systemctl start mongod

# 2) Dependencias (workspaces: instala la raíz y el backend de una vez)
npm install

# 3) Variables de entorno
cp backend/.env.example backend/.env         # rellena JWT_SECRET
# PORT=3000 por defecto. Si el puerto está ocupado, cambialo aquí: es el único
# sitio donde hay un puerto escrito.
#
# IMPORTANTE: el sitio y la API los sirve ESTE proceso, así que `PORT` tiene que
# ser el mismo puerto desde el que abres el navegador. `js/config.js` saca la URL
# de la API de `window.location.origin` y no escribe ningún puerto, de modo que
# si cambias PORT a 3005, la web tiene que abrirse en http://localhost:3005.

# 4) Datos iniciales
npm run seed                                # 6 categorías, 6 marcas, 16 productos, admin y cliente

# 5) Arrancar
npm start                                   # http://localhost:3000
```

| Script | Qué hace |
|---|---|
| `npm start` | Reconstruye `public/` y arranca el servidor |
| `npm run dev` | Igual, con recarga al guardar (`node --watch`) |
| `npm run build:static` | Solo regenera `public/` |
| `npm run seed` | Carga datos iniciales |
| `npm test` | 127 tests contra un replica set en memoria |

`npm test` no necesita nada levantado: levanta su propio MongoDB en memoria con
replica set, que es lo que permite probar transacciones de verdad.

### Estructura

```
raíz/            HTML, css/, js/, img/, data/, admin/   <- fuente del sitio
public/          copia generada, la que se sirve        <- artefacto
backend/         API Express + tests
scripts/         preparar-estatico.mjs
thunder-tests/   colección de Thunder Client
API.md           contrato de la API
```

`public/` es una **copia generada**: se reconstruye en cada `npm start` y en
Vercel. Los archivos a editar son siempre los de la raíz.

## Rutas del sitio

El servidor resuelve las páginas sin extensión: `/carrito` sirve
`carrito.html`, `/admin/dashboard` sirve `admin/dashboard.html`, y lo que no
existe devuelve `404.html` con código 404.

## Contrato de errores

Toda respuesta de error tiene **exactamente** esta forma, sin excepciones:

```json
{
  "error": { "code": "VALIDATION_ERROR", "message": "Datos de entrada inválidos",
             "details": [ { "field": "precio", "message": "…" } ] },
  "requestId": "0f3c9e1a-…"
}
```

`details` sólo aparece en errores de validación. El `code` es estable: el frontend
decide qué hacer mirando el código, nunca el texto del mensaje.

| HTTP | Códigos |
|---|---|
| 400 | `VALIDATION_ERROR` `INVALID_ID` `DUPLICATE_FIELD` `INVALID_PATH` `INVALID_ROLE` `EMPTY_CART` `INSUFFICIENT_STOCK` `PRODUCT_UNAVAILABLE` `INVALID_IDEMPOTENCY_KEY` `CANNOT_CANCEL` |
| 401 | `UNAUTHENTICATED` `INVALID_TOKEN` `TOKEN_EXPIRED` `TOKEN_REVOKED` `USER_NOT_FOUND` `INVALID_CREDENTIALS` `INVALID_RESET_TOKEN` `WRONG_PASSWORD` |
| 403 | `FORBIDDEN` `ORIGIN_NOT_ALLOWED` `ORIGIN_REQUIRED` `CSRF_TOKEN_INVALID` |
| 404 | `NOT_FOUND` `PRODUCT_NOT_FOUND` `CATEGORY_NOT_FOUND` `BRAND_NOT_FOUND` `ORDER_NOT_FOUND` `CART_NOT_FOUND` `ITEM_NOT_FOUND` `ADDRESS_NOT_FOUND` `CONTACT_NOT_FOUND` |
| 405 / 413 / 415 | `METHOD_NOT_ALLOWED` `PAYLOAD_TOO_LARGE` `UNSUPPORTED_MEDIA_TYPE` |
| 409 | `CHECKOUT_IN_PROGRESS` `CHECKOUT_STATE_CHANGED` `ORDER_STATE_CHANGED` `PAID_ORDER_REQUIRES_REFUND` `INVALID_ORDER_TRANSITION` |
| 429 | `RATE_LIMIT_EXCEEDED` `AUTH_RATE_LIMIT_EXCEEDED` `CONTACT_RATE_LIMIT_EXCEEDED` |
| 500 / 503 | `INTERNAL_ERROR` `CONFIG_INCOMPLETA` `DATABASE_UNAVAILABLE` `TRANSACTIONS_UNAVAILABLE` |

## Autenticación

Login/registro devuelven un JWT en cookie **HttpOnly** (`token`). El cliente
nunca lo ve. Para las peticiones que mutan hacen falta **dos** cosas:

1. la cookie `jers_csrf` (la sirve `GET /api/auth/csrf`), y
2. la cabecera `X-CSRF-Token` con ese mismo valor.

En `tests/` y en las pruebas manuales, `agent` + `X-CSRF-Token` bastan.

## Dinero

**Todos los importes son enteros.** La moneda es el peso colombiano, que no tiene
subdivisión, así que el peso *es* la unidad mínima. No hay coma flotante en
ninguna suma, y `zod` (`backend/src/middleware/validation.js`) y los modelos
Mongoose rechazan `58000.5` con un 400. Toda la aritmética pasa por
`backend/src/services/money.js`.

Envío: gratis desde **$200.000**, si no **$15.000** (`SHIPPING_RULES` en
`orderController.js`). `descuentoPorcentaje` es un entero 0–100 redondeado
half-up.

## Transacciones

Crear un pedido y cancelarlo mueven stock, así que van dentro de una
transacción (`backend/src/services/transaction.js`), con **sesión explícita en
cada consulta**: `mongoose.connection.transaction()` no la propaga y se comprobó
que da un falso "ok" sin atomicidad.

Un `mongod` **standalone no admite transacciones**. El helper lo detecta al
arrancar y, si no hay replica set, ejecuta la operación con la compensación
explícita que ya tenía el proyecto (avisa por log). Para atomicidad real en local:

```bash
# /etc/mongod.conf ->  replication:
#                        replSetName: rs0
sudo systemctl restart mongod
mongosh --eval 'rs.initiate()'
```

---

# Endpoints

Base: `/api`. `🔒` = requiere sesión · `🛡` = requiere rol admin.

El detalle completo de cada endpoint, con cuerpos y errores, está en
[`API.md`](../API.md) (raíz del repositorio).

## Salud

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado del proceso, Mongo, Redis y configuración. No requiere sesión. |

## Auth — `🔒` a partir de `/me`

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/register` | Alta. Requiere `aceptoTerminos` y `aceptoPrivacidad` en `true`. |
| POST | `/auth/login` | Devuelve cookie `token`. Acepta `rememberMe`. |
| POST | `/auth/logout` | Invalida la sesión (incrementa `tokenVersion`). |
| GET | `/auth/csrf` | Emite el token CSRF en cookie + cuerpo. |
| POST | `/auth/forgot-password` | Siempre 200, exista o no el email (no enumera usuarios). |
| POST | `/auth/reset-password` | `{ token, password, confirmPassword }`. |
| GET 🔒 | `/auth/me` | Usuario actual. |
| PATCH 🔒 | `/auth/profile` | `{ nombre?, apellido?, telefono? }`. |
| PATCH 🔒 | `/auth/password` | `{ currentPassword, newPassword }`. Renueva la sesión. |
| POST 🔒 | `/auth/addresses` | Alta de dirección. La primera queda principal. |
| PATCH 🔒 | `/auth/addresses/:addressId` | Edición por `_id` de subdocumento. |
| DELETE 🔒 | `/auth/addresses/:addressId` | Borra y reassigna la principal. |

## Productos (públicos)

| Método | Ruta | Query |
|---|---|---|
| GET | `/products` | `page, limit, categoria, marca, search, minPrice, maxPrice, enPromocion, destacado, sort` |
| GET | `/products/:id` | Detalle. 404 si está inactivo. |
| GET | `/products/featured` | Máx. 8 destacados. |
| GET | `/products/promociones` | Máx. 12 en promoción. |
| GET | `/products/categorias` | Activas, por `orden`. |
| GET | `/products/marcas` | Activas, por `orden`. |
| GET | `/products/categoria/:slug` | Por slug de categoría. |
| GET | `/products/buscar` | `q` (mín. 2 caracteres), full-text por score. |

`sort` ∈ `nuevos` (defecto) · `mas_vendidos` · `precio_asc` · `precio_desc` · `descuento`.

## Carrito `🔒` — siempre del usuario autenticado

| Método | Ruta |
|---|---|
| GET | `/cart` |
| POST | `/cart` — `{ productoId, cantidad }` (1–99) |
| PATCH | `/cart/:itemId` — `{ cantidad }` |
| DELETE | `/cart/:itemId` |
| DELETE | `/cart` |

El precio queda **congelado** al agregar (`precioUnitario`); el checkout usa el
precio vigente.

## Pedidos `🔒`

| Método | Ruta | Notas |
|---|---|---|
| POST | `/orders` | Transaccional. Acepta `Idempotency-Key` (8–100 chars) para evitar el doble clic. Devuelve `whatsappUrl`. |
| GET | `/orders` | `page, limit, estado`. Solo los del usuario. |
| GET | `/orders/:id` | 404 si es de otro usuario. |
| PATCH | `/orders/:id/cancelar` | Solo desde `pendiente`/`confirmado` y si no está pagado. Transaccional: devuelve el stock. |

Estados: `pendiente → confirmado → procesando → enviado → entregado`, con salidas
a `cancelado` y `reembolsado`. Pagos: `pendiente`, `pagado`, `fallido`,
`reembolsado`.

## Usuarios `🛡`

| Método | Ruta |
|---|---|
| GET | `/users` — `page, limit, search, role, activo` |
| GET | `/users/:id` |
| PATCH | `/users/:id/role` — `{ role: 'user' \| 'admin' }` |
| PATCH | `/users/:id/toggle-active` |
| DELETE | `/users/:id` (desactiva) |

No se puede degradar, desactivar ni borrar al último admin, ni one's a sí mismo.

## Admin `🛡`

| Método | Ruta | Notas |
|---|---|---|
| GET | `/admin/dashboard` | `totalUsers, totalProducts, totalOrders, totalRevenue, revenueToday, ordersByStatus, recentOrders`. `totalRevenue` suma **solo pedidos pagados**. |
| GET | `/admin/productos` | `search, activo, categoria, marca, page, limit`. |
| POST | `/admin/productos` | `precio` entero obligatorio; `precioAnterior > precio`. |
| PATCH | `/admin/productos/:id` | |
| DELETE | `/admin/productos/:id` | Baja lógica (`activo: false`). |
| GET/POST/PATCH/DELETE | `/admin/categorias[/:id]` | Categorías de lista cerrada: `rostro, ojos, labios, shampoo, acondicionador, tratamientos`. |
| GET | `/admin/categorias/:id/check-products` | |
| GET/POST/PATCH/DELETE | `/admin/marcas[/:id]` | |
| GET | `/admin/marcas/:id/check-products` | |
| GET | `/admin/pedidos` | `page, limit, estado, estadoPago`. |
| GET | `/admin/pedidos/:id` | |
| PATCH | `/admin/pedidos/:id` | `{ estado?, estadoPago?, notas? }`. Las transiciones inválidas dan 409. Cancelar devuelve stock (transaccional). |
| GET | `/admin/contactos` | `page, limit, estado`. |
| PATCH | `/admin/contactos/:id` | `{ estado: 'nuevo' \| 'atendido' }`. |

## Contacto (público)

| Método | Ruta |
|---|---|
| POST | `/contact` — `{ nombre, email, telefono?, mensaje }`. Campo trampa `website`: si viene relleno responde 202 sin guardar. |

---

## Tests

```bash
npm test          # 127 tests, 7 suites
```

| Suite | Cubre |
|---|---|
| `money.test.js` | Aritmética pura: sumas, redondeos, cero, negativos, desborde, envío en el umbral. |
| `financial.test.js` | Totales contra la BD: persistido = devuelto, snapshots, stock, balance, idempotencia, atomicidad, autorización por usuario, fin de mes. |
| `auth.test.js` | Registro, login, sesión, revocación. |
| `cart-orders.test.js` | Carrito y ciclo de pedido. |
| `products.test.js` | Catálogo, filtros, búsqueda. |
| `security-middleware.test.js` | CSRF, rutas ambiguas, 415. |
| `security-flows.test.js` | Flujos completos de seguridad. |

## Notas de despliegue

En producción la app **se niega a arrancar** si falta `JWT_SECRET` (64+ chars),
`MONGODB_URI` con TLS, `REDIS_URL` con `rediss://`, `COOKIE_SECURE=true`,
`TRUST_PROXY_HOPS=1` y `SECRETS_FROM_ENV=true`. El checklist completo está en
`backend/.env.example`.
