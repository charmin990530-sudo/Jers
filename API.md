# API — By Jers

Contrato HTTP completo. Todos los importes son **enteros en pesos colombianos**
(COP no tiene centavos, así que el peso es la unidad mínima). La API y el sitio se
sirven desde el **mismo origen y el mismo puerto**: no hay CORS que configurar.

Base: `{{baseUrl}}/api` · Puerto: valor de `PORT` en `backend/.env` (3000 por defecto).

## Respuestas de error

Forma única, sin excepciones. `details` solo aparece en errores de validación.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Datos de entrada inválidos",
    "details": [
      { "field": "precio", "message": "El precio debe ser un numero entero (la moneda no tiene centavos)" }
    ]
  },
  "requestId": "0f3c9e1a-1b2c-4c3d-9e8f-7a6b5c4d3e2f"
}
```

El `code` es estable: se decide por código, nunca por texto. El `requestId` sale
también en la cabecera `X-Request-ID` y sirve para buscar el registro en el log.

| HTTP | Códigos |
|---|---|
| **400** | `VALIDATION_ERROR` `INVALID_ID` `INVALID_PATH` `INVALID_ROLE` `INVALID_IDEMPOTENCY_KEY` `DUPLICATE_FIELD` `EMPTY_CART` `INSUFFICIENT_STOCK` `PRODUCT_UNAVAILABLE` `CANNOT_CANCEL` `WRONG_PASSWORD` `PASSWORDS_MISMATCH` `EMAIL_EXISTS` |
| **401** | `UNAUTHENTICATED` `INVALID_TOKEN` `TOKEN_EXPIRED` `TOKEN_REVOKED` `USER_NOT_FOUND` `INVALID_CREDENTIALS` `INVALID_RESET_TOKEN` |
| **403** | `FORBIDDEN` `CSRF_TOKEN_INVALID` `ORIGIN_NOT_ALLOWED` `ORIGIN_REQUIRED` |
| **404** | `NOT_FOUND` `PRODUCT_NOT_FOUND` `CATEGORY_NOT_FOUND` `BRAND_NOT_FOUND` `ORDER_NOT_FOUND` `CART_NOT_FOUND` `ITEM_NOT_FOUND` `ADDRESS_NOT_FOUND` `CONTACT_NOT_FOUND` `USER_NOT_FOUND` |
| **405 / 413 / 415** | `METHOD_NOT_ALLOWED` `PAYLOAD_TOO_LARGE` `UNSUPPORTED_MEDIA_TYPE` |
| **409** | `CHECKOUT_IN_PROGRESS` `CHECKOUT_STATE_CHANGED` `ORDER_STATE_CHANGED` `INVALID_ORDER_TRANSITION` `PAID_ORDER_REQUIRES_REFUND` |
| **429** | `RATE_LIMIT_EXCEEDED` `AUTH_RATE_LIMIT_EXCEEDED` `CONTACT_RATE_LIMIT_EXCEEDED` |
| **500 / 503** | `INTERNAL_ERROR` `CONFIG_INCOMPLETA` `DATABASE_UNAVAILABLE` `TRANSACTIONS_UNAVAILABLE` |

Un error no marcado como operativo (un bug o una dependencia caída) **nunca**
expone su mensaje al cliente: se registra en el log y se responde `INTERNAL_ERROR`.

## Autenticación

`POST /auth/login` y `POST /auth/register` devuelven un JWT en cookie **HttpOnly**
llamada `token`. El cliente nunca lo ve; no hay token en `localStorage`.

Para las peticiones que mutan hacen falta **las dos** cosas:

1. la cookie `jers_csrf` (la emite `GET /auth/csrf`), y
2. la cabecera `X-CSRF-Token` con ese mismo valor.

```
GET /api/auth/csrf
→ 200 { "success": true, "csrfToken": "abc123..." }   y Set-Cookie: jers_csrf=abc123...

POST /api/cart
X-CSRF-Token: abc123...
Cookie: token=...; jers_csrf=abc123...
```

`DELETE` también lo exige. `GET`, `HEAD` y `OPTIONS` no.

Cambiar la contraseña, hacer logout o restablecerla incrementa
`tokenVersion`, lo que invalida al instante cualquier JWT emitido antes.

## Dinero

| Regla | Detalle |
|---|---|
| Unidad | peso colombiano, entero. `58000`, nunca `58000.5`. |
| Validación | `z.number().int()` en Zod y validador en los modelos Mongoose. `58000.5` → 400. |
| Subtotal | `precioUnitario × cantidad`, entero exacto. |
| Envío | gratis desde **200.000**, si no **15.000** (`SHIPPING_RULES`). |
| Total | `subtotal + envío − descuento`, nunca negativo. |
| Descuento | entero 0–100, redondeo half-up sobre división entera. |
| Umbral | envío gratis en el valor exacto (200.000 → gratis; 199.999 → 15.000). |

El precio se **congela** en el carrito al agregar (`precioUnitario`), pero el
checkout usa el precio vigente del producto en ese momento.

## Transacciones

`POST /orders`, `PATCH /orders/:id/cancelar` y el cancelación desde admin mueven
stock, así que van en una transacción de MongoDB con **sesión explícita en cada
consulta** (`backend/src/services/transaction.js`).

Un `mongod` **standalone no admite transacciones**. El helper lo detecta al
arrancar; si no hay replica set, ejecuta la operación con compensación explícita
y avisa por log. Para atomicidad real:

```bash
# /etc/mongod.conf -> replication: { replSetName: rs0 }
sudo systemctl restart mongod && mongosh --eval 'rs.initiate()'
```

## Idempotencia

`POST /orders` acepta la cabecera `Idempotency-Key` (8–100 caracteres,
`[A-Za-z0-9._:-]`). Repetir la **misma** clave devuelve `200` con el pedido ya
creado en lugar de crear un segundo pedido. Es la protección contra el doble clic
en «Comprar».

```
POST /api/orders   Idempotency-Key: abc-123-def
→ 201 { "order": { "numeroOrden": "BJ-260928-XDQ2TU", ... } }

POST /api/orders   Idempotency-Key: abc-123-def     (mismo cuerpo)
→ 200 { "message": "El pedido ya había sido creado",
        "order": { "numeroOrden": "BJ-260928-XDQ2TU", ... } }
```

## Autorización

Todo recurso de carrito, dirección y pedido se filtra por el usuario de la
sesión **en la propia consulta**, no comprobando después. Un pedido o un carrito
de otro usuario devuelve **404** (no 403), para no confirmar que ese recurso
existe.

| Rol | Puede |
|---|---|
| invitado | catálogo público, contacto |
| `user` | lo anterior + su carrito, sus pedidos, su perfil y sus direcciones |
| `admin` | lo anterior + `/api/admin/*` y `/api/users/*` |

No se puede degradar, desactivar ni borrar al último administrador, ni hacer el
admin esas operaciones sobre sí mismo (`LAST_ADMIN`, `SELF_DELETE`,
`SELF_DEACTIVATE`).

---

# Endpoints

## Salud

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado del proceso, Mongo, Redis y configuración. **No requiere sesión** y **no depende de la base**: con Mongo caído responde `200` con `database: "disconnected"`. Sirve de sonda de vida. |

## Auth

| Método | Ruta | Cuerpo | Notas |
|---|---|---|---|
| GET | `/auth/csrf` | — | Emite el token CSRF en cookie y en el cuerpo. |
| POST | `/auth/register` | `{nombre, apellido, email, password, telefono?, aceptoTerminos: true, aceptoPrivacidad: true}` | 201 + cookie. Los dos `acepto*` deben ser exactamente `true`. |
| POST | `/auth/login` | `{email, password, rememberMe?}` | Cookie `token`. Siempre 200 genérico ante credenciales malas. |
| POST | `/auth/logout` | — | Invalida la sesión. |
| POST | `/auth/forgot-password` | `{email}` | **Siempre 200**, exista o no: no enumera usuarios. |
| POST | `/auth/reset-password` | `{token, password, confirmPassword}` | `token` es 64 hex. |
| GET 🔒 | `/auth/me` | — | Usuario actual. |
| PATCH 🔒 | `/auth/profile` | `{nombre?, apellido?, telefono?}` | |
| PATCH 🔒 | `/auth/password` | `{currentPassword, newPassword}` | Renueva la sesión. |
| POST 🔒 | `/auth/addresses` | `{alias, nombreCompleto, telefono, direccion, ciudad, departamento, codigoPostal?, esPrincipal?}` | 201. La primera queda principal. |
| PATCH 🔒 | `/auth/addresses/:addressId` | campos parciales | |
| DELETE 🔒 | `/auth/addresses/:addressId` | — | Reasigna la principal si hacía falta. |

## Productos (público)

| Método | Ruta | Query |
|---|---|---|
| GET | `/products` | `page, limit(≤50), categoria, marca, search, minPrice, maxPrice, enPromocion, destacado, sort` |
| GET | `/products/:id` | 404 si está inactivo |
| GET | `/products/featured` | máx. 8 |
| GET | `/products/promociones` | máx. 12 |
| GET | `/products/categorias` | activas, por `orden` |
| GET | `/products/marcas` | activas, por `orden` |
| GET | `/products/categoria/:slug` | `page, limit, sort` |
| GET | `/products/buscar` | `q` (mín. 2), full-text por relevancia |

`sort` ∈ `nuevos` (defecto) · `mas_vendidos` · `precio_asc` ·
`precio_desc` · `descuento`.

> El listado público devuelve **solo productos activos**. El de admin devuelve
> también los inactivos, que es lo que hace que los conteos de los dos endpoints
> no coincidan.

## Carrito 🔒

| Método | Ruta | Cuerpo |
|---|---|---|
| GET | `/cart` | — |
| POST | `/cart` | `{productoId, cantidad}` (1–99) |
| PATCH | `/cart/:itemId` | `{cantidad}` (1–99) |
| DELETE | `/cart/:itemId` | — |
| DELETE | `/cart` | vacía todo |

## Pedidos 🔒

| Método | Ruta | Notas |
|---|---|---|
| POST | `/orders` | **Transaccional**. Acepta `Idempotency-Key`. Devuelve `whatsappUrl` con el pedido pre-rellenado. |
| GET | `/orders` | `page, limit, estado` |
| GET | `/orders/:id` | 404 si es de otro usuario |
| PATCH | `/orders/:id/cancelar` | `{motivo?}`. Solo desde `pendiente`/`confirmado` y si no está pagado. Devuelve el stock. |

Estados: `pendiente → confirmado → procesando → enviado → entregado`, con salidas
a `cancelado` y `reembolsado`. Transiciones inválidas → `400 INVALID_ORDER_TRANSITION`.
Pagos: `pendiente`, `pagado`, `fallido`, `reembolsado`.

## Contacto

| Método | Ruta | Cuerpo |
|---|---|---|
| POST | `/contact` | `{nombre, email, telefono?, mensaje}`. Sin sesión. Campo trampa `website`: si viene relleno responde **202** sin guardar (anti-spam). |

## Usuarios 🛡

| Método | Ruta | Notas |
|---|---|---|
| GET | `/users` | `page, limit, search, role, activo` |
| GET | `/users/:id` | |
| PATCH | `/users/:id/role` | `{role: 'user'\|'admin'}` |
| PATCH | `/users/:id/toggle-active` | cuerpo vacío o `{activo}` |
| DELETE | `/users/:id` | desactiva (baja lógica) |

## Admin 🛡

| Método | Ruta | Notas |
|---|---|---|
| GET | `/admin/dashboard` | `totalRevenue` suma **solo pedidos pagados**. Añadido `revenueToday`. |
| GET | `/admin/productos` | `search, activo, categoria, marca, page, limit` |
| POST | `/admin/productos` | `precio` entero; `precioAnterior` debe ser mayor |
| PATCH | `/admin/productos/:id` | |
| DELETE | `/admin/productos/:id` | baja lógica |
| GET/POST/PATCH/DELETE | `/admin/categorias[/:id]` | lista cerrada: `rostro, ojos, labios, shampoo, acondicionador, tratamientos` |
| GET | `/admin/categorias/:id/check-products` | |
| GET/POST/PATCH/DELETE | `/admin/marcas[/:id]` | |
| GET | `/admin/marcas/:id/check-products` | |
| GET | `/admin/pedidos` | `page, limit, estado, estadoPago` |
| GET | `/admin/pedidos/:id` | |
| PATCH | `/admin/pedidos/:id` | `{estado?, estadoPago?, notas?}`. Cancelar devuelve stock, en transacción. |
| GET | `/admin/contactos` | `page, limit, estado` |
| PATCH | `/admin/contactos/:id` | `{estado: 'nuevo'\|'atendido'}` |

## Límites de peticiones

| Ámbito | Por defecto |
|---|---|
| General | 100 / 15 min |
| Auth (register, login, forgot, reset) | 5 / 1 min |
| Contacto | 5 / 15 min |

En producción se cuentan con un store de Redis y se apoyan en `TRUST_PROXY_HOPS`.

## Límites de cuerpo

256 kB. Excederlo → `413 PAYLOAD_TOO_LARGE`. `POST`/`PATCH`/`PUT` exigen
`Content-Type: application/json` → si no, `415 UNSUPPORTED_MEDIA_TYPE`.
