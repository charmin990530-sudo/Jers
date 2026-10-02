# AUDITORÍA — By Jers (e-commerce de maquillaje y cuidado capilar)

- **Fecha:** 2 de octubre de 2026
- **Alcance:** backend (Express + MongoDB/Mongoose), frontend (HTML/CSS/JS vanilla), configuración, despliegue (Vercel), CI y datos de seed
- **Rama auditada:** `master` @ `e19cdba` (árbol limpio)
- **Rama de corrección:** `audit/fixes`
- **Entorno de verificación:** Node v22.23.3, npm 10.9.9, mongod local sin réplica (standalone), `.env` de desarrollo
- **Método:** lectura completa del código, ejecución de la suite de tests, arranque real del servidor, seed real, y pruebas manuales de la API con `curl` autenticado como admin
- **Nota:** existe una auditoría anterior en `docs/AUDITORIA.md` (683 líneas) feita sobre `feature/interactividad-video`. Este informe la **sustituye**: la anterior declaraba `CORREGIDO` en 95 filas, y al re-verificar una a una contra el código, el resultado es que 56 seguían pendientes. Aquí cada hallazgo tiene evidencia ejecutada o lectura de línea.

---

## 1. Resumen ejecutivo

El backend está bien construido y es la parte más sólida del proyecto. No hay inyección SQL/NoSQL explotable, ni XSS, ni IDOR, ni fugas de secretos. El precio se calcula siempre en servidor, la aritmética es entera con rango verificado, el stock se descuenta con check-and-set atómico dentro de transacción, y la idempotencia del checkout está bien resuelta (verificado: dos POST con la misma `Idempotency-Key` → 201 + 200 con el mismo pedido).

El frontend, en cambio, tiene **cinco funcionalidades rotas**, y dos de ellas tocan directamente el dinero y el pedido.

Estado real que verifiqué levantando el proyecto:

| Comprobación | Resultado |
|---|---|
| `npm install` | OK, 483 paquetes, **0 vulnerabilidades** |
| `npm test` | **164 tests, 11 suites, todos pasan** (67 s) |
| `npm run build:static` | OK, 248 archivos a `public/` |
| `npm start` | Arranca; **el `MONGODB_URI` de `backend/.env` falla con `bad auth : authentication failed`** (ver §1.1) |
| `npm audit` | 0 vulnerabilidades. En `backend/` **no se puede ejecutar**: no hay lockfile propio (§4, M-12) |
| Lint / typecheck / formateo | **No existen.** Ningún tooling, ningún `lint` en package.json |
| Suite de tests de frontend | **No existe.** Cero cobertura del código donde están todos los bugs |

### 1.1 Bloqueante de arranque que conviene saber

`backend/.env` (archivo real, permisos `600`) contiene una `MONGODB_URI` de Atlas que responde `bad auth : authentication failed`. Con esa configuración el proceso **arranca pero la API devuelve 503 en todo `/api/*`** y el catálogo no carga. No es un bug del código: es una credencial caducada en el entorno local. Para poder auditar tuve que arrancar con `MONGODB_URI=mongodb://127.0.0.1:27017/...` (el `mongod` local está activo y sin auth).

**Consecuencia:** cualquiera que clone el repo hoy ve la web sin productos y sin explicación, porque el mensaje del 503 sí viaja pero el navegador no lo muestra en el home.

### 1.2 Puntaje por área

| Área | Nota | Comentario |
|---|---|---|
| Seguridad backend | 8.0 | Sin vectores explotables. Se resta enumeración de usuarios (A-03, A-04), la caída total de API si Redis se cae en caliente (A-02) y el rate limit colapsado si falta `TRUST_PROXY_HOPS` (M-05). |
| Modelo de datos | 8.0 | Índices compuestos bien pensados, incluido el `partial` de idempotencia. Faltan índices para el listado por defecto y el orden por precio (M-11). |
| Aritmética monetaria | 9.5 | `services/money.js` con enteros y `Number.isSafeInteger` en cada operación, más validador en Zod **y** en Mongoose. Prácticamente impecable. |
| Integridad de pedidos | **4.0** | La compensación del checkout borra el historial del usuario (C-01, reproducido). Reembolsar no repone stock (A-06, reproducido). |
| Pagos / checkout | 4.5 | Sin pasarela, sin webhook, sin conciliación. El total mostrado no es el que se cobra (A-01) y la confirmación nunca se abre (A-02 FE). |
| Frontend / bugs | 4.0 | Carrito inutilizable (C-02), 3 módulos del panel muertos por un `throw` (A-03), guardado de admin silencioso (A-05). |
| Accesibilidad | 5.0 | Salt link y labels correctos, pero contraste 3:1 en el botón principal y 2.3:1 en placeholders (M-14). Seis modales sin gestión de foco (M-08). |
| SEO | 5.0 | `canonical` en 9 páginas, pero OG estático en fichas, cero `canonical` en 6 páginas, sitemap sin fichas de producto. |
| Tests | 7.0 | 164 tests reales de backend. **Cero** de frontend: ningún bug crítico de esta auditoría habría sido detectado. |
| Cumplimiento legal | 4.0 | Modales de términos y privacidad existen y funcionan (§6). Faltan datos de empresa, política de cookies y política de devoluciones. |

**Global: 5.9 / 10.**

### 1.3 Los 8 riesgos que más pesan

| # | Riesgo | Por qué importa |
|---|---|---|
| 1 | **Pérdida de historial de pedidos** (C-01) | Reproducido: dos POST simultáneos sin `Idempotency-Key` borran **todos** los pedidos del usuario. Pérdida directa de ventas y de evidencia. |
| 2 | **El carrito no deja quitar artículos** (C-02) | La clase `carrito-item__img` no tiene ni una regla en las 19 hojas CSS. La imagen de 900 px desborda un panel de 390 px y empuja el botón `×` fuera de pantalla. |
| 3 | **Se cobra un precio distinto al que se muestra** (A-01) | Verificado: pedido de $29.000 → el cliente ve "$29.000", el backend cobra $44.000. Los $15.000 de envío aparecen por sorpresa al pagar. |
| 4 | **El panel de productos del admin muere con un 500** (A-03) | `throw` sin `try/catch` en un listener `async`. Un fallo de red deja el botón "Nuevo Producto" sin functionality y la tabla en "Cargando..." para siempre. |
| 5 | **Reembolsar no devuelve el stock** (A-06) | Reproducido: `entregado → reembolsado` deja `vendidos` inflado y el inventario sin recuperar. |
| 6 | **Sin pasarela de pago** | `estadoPago` lo cambia un admin a mano, sin evidencia ni webhook. El riesgo es 100 % humano. |
| 7 | **Redis caído en caliente tumba la API entera** (A-02) | El store lanza excepción, `passOnStoreError` está en `false`, y `reconnectStrategy` deja de reintentar a los 4 intentos. 500 en todo `/api/*` hasta reiniciar. |
| 8 | **Cero tests de frontend** | El único gate (`npm test`) no mira un solo archivo de `js/`. |

---

## 2. Arquitectura detectada

```
Navegador
  │
  │  un solo origen (http://localhost:3000 en dev, dominio en Vercel)
  │
  ├── GET /                → express.static(public/)        páginas
  ├── GET /carrito         → app.js:381 regex → carrito.html  (HTML abreviado)
  └── /api/*               → rutas Express                  JSON
        │
        ├── middleware: helmet(CSP) → cors → security(requestId, originGuard)
        │              → rateLimit → bodyParser → cookieParser → csrfProtection
        ├── /api guard: configError? 503 : connectDB? 503 : next
        ├── /api/auth     authLimiter → authenticate → rutas
        ├── /api/products optionalAuth → catálogo
        ├── /api/cart     authenticate
        ├── /api/orders   authenticate
        ├── /api/users    authenticate + authorize('admin')
        ├── /api/admin    authenticate + authorize('admin')
        └── /api/contact  contactLimiter
              │
              └── MongoDB (Mongoose 8) ──► SMTP (nodemailer, mejor esfuerzo)
                                             Redis (rate limit, prod)
                                             Sentry (prod)
```

Decisiones de diseño acertadas que conviene conservar:

- **Un solo proceso sirve sitio y API.** Elimina CORS, preflight y el desfase de puertos. `js/config.js` deriva la URL de `window.location.origin`.
- **`public/` es build generado** por `scripts/preparar-estatico.mjs`, fuera de git. `npm start` lo reconstruye, así que lo servido nunca queda desfasado.
- **`syncIndexes()` explícito** en el arranque (`app.js:446`), con el porqué documentado: `autoIndex` es perezoso y no creaba los índices.
- **Aritmética en enteros con doble barrera** (Zod + validador Mongoose). Ningún camino puede meter un centavo.
- **`js/api.js` es la única capa de red** y **nunca lanza**: un contrato `{ok, msg, data}` uniforme. Eso eliminó de raíz tres políticas distintas de 401.
- **`js/sanitize.js` con adopción sistemática**: audité los ~60 `innerHTML` de `js/` y los que interpolan datos pasan por `escapeHTML` o `safeAssetUrl`. **No encontré XSS explotable.**

---

## 3. Lo que verifiqué que NO es un bug

Lo dejo escrito porque son trampas de inspection donde se pierden horas:

| Sospecha | Verificación |
|---|---|
| Inyección NoSQL por query params | Express 4 usa `qs` y sí genera objetos, pero los 8 puntos que leen `req.query` están tras `validateQuery`, y `optionalBooleanQuery` colapsa cualquier objeto a `false`. Vector cerrado. |
| IDOR en pedidos/direcciones/carrito | `orderController.js:354,389,424,444` filtran siempre por `usuario: req.userId`; direcciones se buscan dentro del documento del usuario; el carrito se busca por `usuario`. No hay acceso cruzado. |
| Carrera al descontar stock | El `bulkWrite` incluye `stock: { $gte: cantidad }` en el filtro y comprueba `modifiedCount`. Es check-and-set atómico, no read-modify-write. |
| Doble clic en checkout | El carrito se reclama con `checkoutToken` + TTL de 2 min mediante `findOneAndUpdate` condicional. Verificado: segundo POST → 409. |
| Inyección de cabeceras SMTP | `emailService.js:18` quita `\r\n` del asunto. |
| XSS en comentarios/reseñas/nombres | Los ~60 `innerHTML` de `js/` escapan. `safeAssetUrl` rechaza `javascript:` y `data:`. `escapeHTML` escapa también `"` y `'`, así que no hay salida de atributo. |
| Tokens en `localStorage` | Solo el carrito (escapado al pintar). La sesión es cookie HttpOnly; el token de reset va en un `<input hidden>` y se borra de la URL con `replaceState`. |
| Enumeración en login | Mensaje y código idénticos en ambos casos (`INVALID_CREDENTIALS`, 401). Hay un oráculo de **tiempo** (A-03), pero no de contenido. |
| Anti-last-admin | `userController.js` serializa las tres mutaciones con un mutex y `activeAdminCount(excludeId)`. Many backends no tienen esto. |
| CSRF | Doble capa: `originGuard` rechaza `Sec-Fetch-Site: cross-site` y exige Origin/Referer en producción; `csrfProtection` valida cookie↔header con HMAC y `timingSafeEqual`. |
| Contrato de error | `sendError` es el único emisor y `errorHandler` cierra el último caso. Sobre `{error:{code,message,details}, requestId}` con `requestId` también en la cabecera `X-Request-ID`. |
| Enlace legal | Los modales de Términos y Privacidad existen en `index.html` y `register.html`, y `inicializarModales()` los abre. La auditoría anterior los marcó como rotos: ya no lo están. |
| `TRUST_PROXY_HOPS` | **Sí** se valida que sea entero 0-5 (`env.js:141`). Lo que falta es *exigir* ≥1 en producción (M-05). |
| Ingresos del día en UTC | `rangoDiaNegocio()` (`adminController.js:214`) usa `inicioDiaNegocio`. Ya corregido, y el CI lo cubre en dos zonas horarias. |

---

## 4. Hallazgos

Severidad: **CRÍTICO** = pierde dinero/datos o bloquea una función de venta · **ALTO** = función rota con impacto directo · **MEDIO** = degradación o deuda con riesgo · **BAJO** = limpieza y consistencia.

Cada hallazgo indica si lo **reproduje** contra el servidor o si es de lectura de código.

### 4.1 CRÍTICOS

---

#### C-01 · La compensación del checkout borra todo el historial de pedidos del usuario

- **Severidad:** CRÍTICO
- **Ubicación:** `backend/src/controllers/orderController.js:231` (dentro del `catch` de 215-235)
- **Evidencia:** **reproducido contra el servidor**

```js
Order.deleteMany({ usuario: req.userId, idempotencyKey: idempotencyKey || null }),
```

En Mongo, `{campo: null}` coincide con los documentos donde el campo es `null` **o no existe**. `Idempotency-Key` es opcional (línea 65), así que cuando el cliente no la envía el filtro es `{usuario, idempotencyKey: null}` y **borra todos los pedidos previos de ese usuario**.

No hace falta que el pedido se haya creado: el `throw` de `INSUFFICIENT_STOCK` (línea 190) ocurre **antes** de `Order.create`, y la compensación corre igual.

Reproducción (servidor real, mongod standalone):

```
2 POST simultáneos a /api/orders sin Idempotency-Key  →  201 y 409
antes: 3 pedidos en Mongo   (2 sin idempotencyKey)
después: 1 pedido en Mongo  (0 sin idempotencyKey)
```

Los dos pedidos sin clave desaparecieron.

- **Impacto:** un cliente con historial de compras lo pierde por un doble clic, un reintento de red o un producto sin stock. Sin copia ni aviso. Es pérdida directa de ventas y de evidencia comercial. Con réplica set (Atlas) la rama no se ejecuta, pero el código es el que se despliega y el `.env` apunta a una URI que hoy no autentica.
- **Solución:** eliminar el `deleteMany` por usuario y compensar por `_id` del documento creado. Como el `throw` ocurre antes del `create`, la forma correcta es mover la creación del pedido **antes** de la reserva de stock y compensar solo ese `_id`:
  ```js
  let createdOrderId = null;
  // tras Order.create:  createdOrderId = created[0]._id;
  ...
  if (!transactional && createdOrderId) {
    await Order.deleteOne({ _id: createdOrderId });
  }
  ```

---

#### C-02 · El carrito no deja quitar artículos: la imagen desborda y el botón `×` sale del panel

- **Severidad:** CRÍTICO
- **Ubicación:** `js/carrito.js:136` emite `class="carrito-item__img"`; **no existe ninguna regla con ese nombre en las 19 hojas CSS** (verificado con `grep -rn "carrito-item__img" css/` → 0 resultados). El contenedor es `css/base.css:809-816`.
- **Evidencia:** lectura de código + medición de assets

```css
.carrito-item {
    display: grid;
    grid-template-columns: 1fr auto auto;   /* línea 814 */
}
```

`1fr` equivale a `minmax(auto, 1fr)`, y el mínimo `auto` de un elemento reemplazado sin ancho explícito es su **tamaño intrínseco**. Las imágenes reales son de 900×1350 px (medido: `img/productos/base-atenea.webp` = 900×1350). El panel mide `max-width: 390px` con `padding: 24px` → 342 px útiles (`.carrito-panel`, `css/base.css:752-760`).

- **Impacto:** cada línea del carrito se maqueta a ≥900 px dentro de una lista de 342 px. `.carrito-lista` (`css/base.css:802`) tiene `overflow-y: auto`, así que el otro eje computa a `auto` y aparece scroll horizontal. El nombre, el precio y **el botón `×` de quitar quedan a ~560 px del borde derecho**, fuera del panel visible, sin ninguna pista visual. Para quitar un artículo hay que hacer scroll horizontal dentro del carrito. Además cada fila mide 1350 px de alto.
- **Solución:**
  ```css
  .carrito-item { grid-template-columns: 64px 1fr auto; align-items: center; }
  .carrito-item__img { width: 64px; height: 64px; object-fit: cover; border-radius: 8px; }
  ```
  más `width="64" height="64"` en el `<img>` de `carrito.js:136` para reservar espacio y evitar CLS.

### 4.2 ALTOS

---

#### A-01 · El checkout muestra un total que no es el que se cobra

- **Severidad:** ALTO
- **Ubicación:** `js/checkout.js:57-74` y `checkout.html:35` · vs `backend/src/controllers/orderController.js:50,126`
- **Evidencia:** **reproducido**

```js
// backend/src/controllers/orderController.js:50
export const SHIPPING_RULES = Object.freeze({ freeFrom: 200000, cost: 15000 });
// línea 126
const costoEnvio = shippingCostFor(subtotal, SHIPPING_RULES);
```

`renderCart()` acumula `precio * cantidad` (= subtotal) y lo escribe en `#checkout-total`. `checkout.html:32-36` no tiene ninguna línea de envío.

Reproducción:

```
POST /api/orders, producto de $29.000
→ respuesta del servidor: subtotal 29000, costoEnvio 15000, total 44000
→ lo que el cliente ve en pantalla: "Total: $29.000"
```

Con un carrito de $120.000 el cliente ve $120.000 y el mensaje de WhatsApp que genera el backend dice "Envío: $15.000 / Total: $135.000". El catálogo semilla va de $19.000 a $92.000, así que **casi toda la gente paga envío**.

- **Impacto:** el cliente descubre un cobro 12,5 % mayor en el momento exacto de pagar, después de haber aceptado otra cifra en pantalla. Es la clase de discrepancia que genera quejas y pérdida de confianza en la primera compra.
- **Decisión de negocio requerida:** ¿el envío se cobra siempre, o gratis desde cierto monto? `SHIPPING_RULES` está hardcodeado (M-13) y `.env.example` no lo expone.
- **Solución:** mostrar el desglose `Subtotal / Envío (gratis desde $200.000) / Total` replicando la misma regla del servidor **solo para mostrar**, etiquetado como estimación, o consumiendo el subtotal que ya devuelve `GET /api/cart`. Nunca una fórmula distinta a la del servidor para el importe mostrado.

---

#### A-02 · El frontend nunca abre WhatsApp pese a que el backend promete la redirección

- **Severidad:** ALTO
- **Ubicación:** `js/checkout.js:182-196` y `checkout.html:83` · vs `backend/src/controllers/orderController.js:307`
- **Evidencia:** lectura de código

El backend responde literalmente `message: 'Pedido creado exitosamente. Serás redirigido a WhatsApp para confirmar.'` y devuelve `order.whatsappUrl`. El frontend nunca navega:

```js
setMessage(`Pedido ${order.numeroOrden} creado correctamente.`, 'exito');
const whatsappUrl = safeExternalUrl(order.whatsappUrl);
if (whatsappUrl && whatsappLink) { whatsappLink.href = whatsappUrl; whatsappLink.hidden = false; }
return;   // submitButton queda deshabilitado para siempre
```

El enlace es `<a id="whatsapp-link" … hidden>` en `checkout.html:83`, **dentro del `<form>`, justo debajo del botón de submit ya puesto en gris permanente**.

- **Impacto:** el pedido se crea, el carrito se consume, el stock se descuenta y se envían dos correos, pero **el pago no está confirmado**. El mensaje verde dice "creado correctamente" y no hay ningún indicador de que falte un paso. El propio backend lo anticipa (`orderController.js:265-271`). Un cliente que lee el mensaje y se va = pedido perdido.
- **Solución:** `setMessage('Pedido creado. Te llevamos a WhatsApp para confirmar el pago.', 'exito')` y `setTimeout(() => window.location.assign(whatsappUrl), 1200)`, más un texto de respaldo explícito.
- **Alternativa a decidir:** abrir WhatsApp en pestaña nueva (`target="_blank"`, que es como está el `<a>` ahora) y mantener al usuario en la web con una sección de "mis pedidos" visible. Requiere decisión tuya.

---

#### A-03 · Si fallan categorías o marcas, el panel de productos queda muerto sin mensaje

- **Severidad:** ALTO
- **Ubicación:** `js/admin/productos.js:26-29`, lanzadores en `:48` y `:59`
- **Evidencia:** lectura de código

```js
document.addEventListener('DOMContentLoaded', async () => {
    iniciarAplicacion();
    await verificarAdminYCargar();   // ← si lanza, no se ejecuta nada más
    inicializarFiltros();
    inicializarPaginacion();
    inicializarModal();      // ← aquí está el listener del botón "Nuevo Producto"
    inicializarFormulario();
});
```

`cargarCategorias()` y `cargarMarcas()` hacen `throw new Error(...)` sin `try/catch`, a diferencia de sus equivalentes en `categorias.js:42-61` y `marcas.js:30-49`, que sí lo tienen. La excepción sale de un listener `async` → promesa rechazada sin manejar, no un error visible.

- **Impacto:** un 500 o un 429 en `GET /api/admin/categorias` deja al admin mirando `productosBody` congelado en "Cargando..." para siempre. El botón "➕ Nuevo Producto" no hace nada, los 5 filtros no responden, la paginación no responde y guardar un producto es imposible. Un fallo de red menor inutiliza el catálogo completo sin un solo mensaje.
- **Solución:** mover `inicializarFiltros/Paginacion/Modal/Formulario` **antes** del `await` (la UI del modal no debe depender de la red) y envolver las dos cargas en `try/catch` pintando estado de error en la tabla.

---

#### A-04 · El guardado en el panel admin falla en silencio

- **Severidad:** ALTO
- **Ubicación:** `js/admin/productos.js:612-622`, `categorias.js:312-322`, `marcas.js:294-304`
- **Evidencia:** lectura de código

```js
} catch (error) {
    handleApiError({ message: error.message, data: error.data }, 'guardar-producto');
    if (error.data?.errors && Array.isArray(error.data.errors)) {
        error.data.errors.forEach(item => {
            const input = form.elements.namedItem(item.field);
            if (input) mostrarErrorCampo(input, item.message);
        });
    }
    // ← no hay else con mensaje global
}
```

`handleApiError` (`js/api.js:386-391`) **solo escribe en `console.error`**. No hay ningún mensaje en pantalla.

Además `item.field` para imágenes viene como `'imagenes.0.url'` (`validation.js:86` → `err.path.join('.')`), así que `form.elements.namedItem('imagenes.0.url')` devuelve `null` y el error nunca se muestra.

- **Impacto:** el admin escribe un precio, pulsa "Guardar" y **no ocurre nada visible**: el modal sigue abierto, la tabla no se refresca, solo queda un `console.error`. Casos reales que caen aquí: `assetUrl` rechaza una ruta relativa sin `/` inicial (`validation.js:45`), `minorAmount` rechaza decimales (`validation.js:39`), o cualquier 500. El admin reintenta a ciegas.
- **Solución:** añadir la rama `else { mostrarMensajeGlobal(form, error.message || 'No se pudo guardar…', 'error') }` y localizar los campos de imagen con `form.querySelector('[name="…"]')`.

---

#### A-05 · El enlace de sesión del panel apunta a rutas que no existen

- **Severidad:** ALTO
- **Ubicación:** `js/app.js:1005, 1008, 1018`
- **Evidencia:** **reproducido con el servidor**

```js
profile.href = 'mi-perfil.html';    // ruta RELATIVA
orders.href  = 'mis-pedidos.html';
login.href   = 'login.html';
```

Los seis scripts de `js/admin/*.js` llaman `iniciarAplicacion()` (p. ej. `dashboard.js:38`), que inyecta ese `<li>` en el `.menulist` del admin.

```
GET /admin/mi-perfil.html      → 404
GET /mi-perfil.html            → 200
```

- **Impacto:** desde `/admin/dashboard`, "Mi perfil" pide `/admin/mi-perfil.html` y devuelve el 404 del sitio. Igual con "Mis pedidos". Para un admin con la sesión caducada, "Iniciar sesión" lleva a `/admin/login.html` → 404. El menú de sesión es un callejón sin salida en la mitad de las pantallas del panel.
- **Solución:** rutas absolutas (`/mi-perfil.html`, `/mis-pedidos.html`, `/login.html`), igual que ya hace `api.js:81`.

---

#### A-06 · `entregado → reembolsado` no repone stock

- **Severidad:** ALTO
- **Ubicación:** `backend/src/controllers/adminController.js:315` (transición válida) y `:382` (`else` que solo hace `Object.assign` + `save`)
- **Evidencia:** **reproducido**

La transición `entregado: ['reembolsado']` es válida (línea 315) y cae en el `else` de 382. Se cambia `estado` a `reembolsado` **sin** el `$inc: {stock: +cantidad, vendidos: -cantidad}` que sí se hace en la rama de cancelación (349-357).

Reproducción con la API real:

```
pedido creado (stock 50, vendidos 2)
confirmado → procesando → enviado → entregado   [200 en cada uno]
→ reembolsado                                       [200]
estado: reembolsado   stock: 49   vendidos: 3
```

El stock sigue descontado y `vendidos` sigue contando una venta reembolsada.

- **Impacto:** inventario inflado de forma permanente. Un producto reembolsado sigue apareciendo como agotado, y las estadísticas de más-vendidos mienten.
- **Solución:** extraer la reposición a un helper `revertirStock(order, session)` y llamarlo en **toda** transición que devuelva mercancía (`cancelado` **y** `reembolsado`).

---

#### A-07 · La caída de Redis tras el arranque tumba TODA la API con 500

- **Severidad:** ALTO
- **Ubicación:** `backend/src/middleware/redisRateLimitStore.js:16` + `backend/src/app.js:88` (reconnect que se rinde) + `node_modules/express-rate-limit/dist/index.cjs:671` (`passOnStoreError: false`)
- **Evidencia:** lectura de código + verificación en la librería instalada

```js
// redisRateLimitStore.js:16
if (!this.client?.isOpen) throw new Error('Redis client not connected');
```

`express-rate-limit@7.5.1` tiene `passOnStoreError: false` por defecto y su `catch` hace `throw error`. Ese error propaga al `errorHandler` global → **500 `INTERNAL_ERROR`**.

El fallback a store en memoria de `app.js:97-113` **solo cubre el fallo de conexión del arranque**. Una vez vivo el proceso, `reconnectStrategy` (`app.js:88`) es `retries => retries > 3 ? false : ...`: tras 4 reintentos **deja de reconectar para siempre** y `isOpen` queda en `false` permanentemente.

`noEsEstatico` (`app.js:225-228`) solo salta estáticos y `/api/health`, así que **todo `/api/*` devuelve 500** de forma permanente hasta reiniciar.

- **Impacto:** un blip de red de 5 s en Upstash deja la tienda caída de forma total e irreversible hasta el siguiente despliegue. Contradice el comentario de `app.js:98-99` ("la API sigue respondiendo").
- **Solución:** (1) no lanzar cuando `!this.client?.isOpen`: devolver un valor neutro y marcar el store como degradado; (2) `reconnectStrategy` que nunca devuelva `false` definitivamente, o watchdog que re-cree el cliente; (3) `disableOfflineQueue: true`.

---

#### A-08 · El contador de marcas del hero nunca se actualiza

- **Severidad:** ALTO
- **Ubicación:** `js/index.js:75-77` vs `backend/src/controllers/productController.js:209-213`
- **Evidencia:** **reproducido**

```js
if (marcasRes.ok && Array.isArray(marcasRes.data)) {   // data es un objeto, no un array
  contadorMarcas.textContent = `+${marcasRes.data.length}`;
}
```

El backend responde `{ success, count, brands }` (confirmado: `GET /api/products/marcas` devuelve `brands` como array de 6). `Array.isArray(objeto)` es `false` → la rama **nunca** se ejecuta.

- **Impacto:** `index.html:148-161` muestra `+300 Productos / +20 Marcas / 100% Originales`. El de productos sí se corrige con `data.total`; **el de marcas queda congelado en "+20"** aunque la base tenga 6. Dos cifras contiguas con idéntico estilo visual, una verdadera y otra falsa. Afirmar "+20 marcas" con 6 referencias en una tienda de cosméticos es un problema de confianza directo.
- **Solución:** `const marcas = marcasRes.data?.brands; if (marcasRes.ok && Array.isArray(marcas)) contadorMarcas.textContent = \`+${marcas.length}\`;`

---

#### A-09 · El mensaje de error de los campos de contraseña nunca se borra

- **Severidad:** ALTO
- **Ubicación:** `js/auth.js:127-133` (`limpiarErrorCampo`)
- **Evidencia:** lectura de código + estructura HTML

```js
export function limpiarErrorCampo(input) {
    input.removeAttribute('aria-invalid');
    const errorSpan = input.parentElement.querySelector('.campo-error');   // ← parentElement
```

El comentario de **`mostrarErrorCampo` (`auth.js:99-106`)** documenta que `parentElement` fallaba *justo en los campos de contraseña* y por eso se cambió a `input.closest('.campo, …')`. **`limpiarErrorCampo` nunca se corrigió.**

Estructura real (`login.html:111-125`, `register.html:127-168`, `reset-password.html:82-115`):

```html
<div class="password-wrapper">
  <input type="password" id="confirmPassword"> … </div>
<span class="campo-error" aria-live="polite"></span>   <!-- hermano, fuera del wrapper -->
```

- **Impacto:** el usuario escribe mal la confirmación, ve rojo "Las contraseñas no coinciden", corrige — **el texto rojo sigue ahí**. `limpiarErroresFormulario()` delega en esta función, así que al reintentar el envío el `aria-invalid` se quita pero el mensaje visible permanece, y el `aria-describedby` que `mostrarErrorCampo` añadió sigue apuntando a un span con texto de error. El formulario parece funcionar mientras la pantalla afirma lo contrario. Afecta a login, registro, reset y cambio de contraseña.
- **Solución:** replicar el `closest()` de `mostrarErrorCampo:107` y eliminar el `aria-describedby` cuando el span queda vacío.

### 4.3 MEDIOS

---

#### M-01 · No se puede cambiar la cantidad desde el carrito

- **Ubicación:** `js/carrito.js:263-283` (función implementada, **sin ningún call site**) y `:140` (la cantidad se pinta como texto plano)
- **Evidencia:** `grep -rn "cambiarCantidad" js/` → solo su definición (`:263`) y su autollamada (`:271`)

`cambiarCantidad()` está exportada, con degradación a localStorage y reintento en 401. El panel pinta `<span class="carrito-item__cantidad">Cant: ${item.cantidad}</span>`.

- **Impacto:** un cliente que puso 5 unidades no puede bajarlas a 2 sin quitar el producto entero y volver a añadirlo desde la ficha. Con un carrito de 8 líneas, cada corrección son 8 navegaciones.
- **Solución:** control `− N +` por línea, delegando con el mismo patrón ya usado para `.quitar-item` (`carrito.js:423-428`).

---

#### M-02 · Fallar al añadir al carrito no produce ninguna señal

- **Ubicación:** `js/carrito.js:396-406`
- **Evidencia:** lectura

```js
agregar({ id: tarjeta.dataset.id, … }).then(r => { if (r.ok) abrirPanel(); });   // si !ok, se descarta r.motivo
```

`agregar()` devuelve `{ok:false, motivo}` en caminos reales: id no-ObjectId (`:200`) y cualquier error del backend (`:232` — sin stock, producto desactivado, red caída).

- **Impacto:** el usuario pulsa "Añadir al carrito" y no se abre el panel, no cambia el contador, no sale ningún aviso. Repite el clic o concluye que el producto no se puede comprar. El sistema **calcula la causa exacta y la tira**.
- **Solución:** en el `.then`, si `!r.ok`, mostrar `r.motivo` en un toast (`mostrarToast` ya existe en los scripts de admin y es reutilizable).

---

#### M-03 · El filtro `activo` de `GET /api/users` está muerto: devuelve siempre todos

- **Ubicación:** `backend/src/controllers/userController.js:59-60` + `backend/src/middleware/validation.js:71-74` y `:421`
- **Evidencia:** **reproducido contra el servidor**

```js
// userController.js:59-60
if (activo === 'true') filter.activo = true;      // tras Zod, activo es booleano → siempre false
if (activo === 'false') filter.activo = false;
```

`validateQuery` **reemplaza** `req.query` por la salida de Zod (`:421`), y `optionalBooleanQuery` convierte el valor a boolean. Las dos comparaciones contra cadenas nunca son ciertas → `filter.activo` **nunca se asigna**.

Reproducción con la API real autenticada como admin:

```
GET /api/users?activo=true   → total 2   (ambos activo:true)
GET /api/users?activo=false  → total 2   (los mismos dos)
```

`API.md:210` documenta `activo` como parámetro soportado.

- **Impacto:** el admin pide "ver solo desactivados", recibe la lista completa y concluye que hay un fallo de sincronización. Riesgo operativo real: creer que una cuenta fue desactivada cuando sigue activa.
- **Solución:** `if (activo !== undefined) filter.activo = activo;`. Añadir test que fije el comportamiento.

---

#### M-04 · Oráculo de tiempo en login permite enumerar emails

- **Ubicación:** `backend/src/controllers/authController.js:124-133`

```js
const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
if (!user || !user.activo) return next(new AppError('Credenciales inválidas', 401, 'INVALID_CREDENTIALS'));
const isMatch = await user.compararPassword(password);
```

El mensaje es idéntico (correcto), pero la ruta del usuario inexistente **no ejecuta `bcrypt.compare`**. Con `bcryptjs@2.4.3` en JS puro y coste 12, ese compare tarda cientos de milisegundos frente a ~1 ms de la consulta. Choca frontalmente con el diseño anti-enumeración que el propio proyecto sí aplica en `forgotPassword` (`:342-366`).
- **Solución:** comparar siempre contra un hash señuelo cuando el usuario no exista.

---

#### M-05 · `TRUST_PROXY_HOPS` no se exige en producción: el rate limiting colapsa a una sola clave

- **Ubicación:** `backend/src/app.js:53` + `backend/src/config/env.js:200-215`

`TRUST_PROXY_HOPS` por defecto es `0` y `validateSecurityEnvironment()` valida 20 invariantes de seguridad pero **no exige `TRUST_PROXY_HOPS >= 1`**. Sin `trust proxy`, `req.ip` es la IP del socket; tras el proxy de Vercel esa IP la comparten todas las invocaciones de la región.

- **Impacto:** con la configuración por defecto en producción, 100 peticiones de cualquier usuario en 15 minutos bloquean la tienda completa con 429. `AUTH_RATE_LIMIT` (5/min) se vuelve inútil contra fuerza bruta.
- **Solución:** en `validateSecurityEnvironment()`, si `VERCEL` o `VERCEL_ENV` está presente y `TRUST_PROXY_HOPS < 1`, añadirlo a la lista de errores. O un `keyGenerator` propio basado en `x-vercel-forwarded-for` / `cf-connecting-ip`.

---

#### M-06 · No existe búsqueda de productos, pese a que el backend la implementa y funciona

- **Ubicación:** `js/api.js` **no tiene wrapper** para `GET /api/products/buscar`; **cero `<input type="search">`** en los 22 HTML (verificado con `grep -c 'type="search"'` → 0 en todos)
- **Evidencia:** **reproducido** — `GET /api/products/buscar?q=labial` → `success: true, total: 3`

El backend expone la ruta (`routes/products.js:23`) con índice de texto completo, validación de longitud mínima y orden por `textScore`. Nadie la llama.
- **Impacto:** con 300 productos en 6 pestañas de categoría, la única forma de encontrar "shampoo anticaída" es recordar en qué pestaña está. El backend ya paga el coste de esa función sin que nadie la use.
- **Solución:** wrapper en `js/api.js` + un input en el header con debounce de 300 ms.

---

#### M-07 · `mis-direcciones.html` es inalcanzable

- **Ubicación:** `js/app.js:1015` (el menú solo añade perfil y pedidos)
- **Evidencia:** `grep -rn "mis-direcciones" --include=*.html --include=*.js` → los únicos resultados son su propio `<body class="mis-direcciones-page">`, su `<link>` y su `<script>`. No está en el menú, ni en el pie, ni en `mi-perfil.html`, ni en `sitemap.xml`.

Una funcionalidad terminada (CRUD completo, validación campo a campo, modal, y el backend respetando "solo una principal a la vez") es **inalcanzable** salvo escribiendo la URL a mano.
- **Solución:** añadir el enlace al `<li>` de sesión en `app.js:1015` y uno cruzado en `mi-perfil.html`.

---

#### M-08 · Seis modales no gestionan el foco

- **Ubicación:** `js/mis-pedidos.js:220-258` y `:457-463` · `js/admin/productos.js:388-390` y `:512-516` · `categorias.js:174-176` y `:204-208` · `marcas.js:167-169` y `:199-203` · `pedidos.js:184-190` y `:304-312` · `usuarios.js:154-162` y `:164-168`

El patrón es siempre `modal.hidden = false; document.body.style.overflow='hidden'`. Ninguno mueve el foco dentro, ninguno lo restaura al cerrar, ninguno atrapa `Tab`.

- **Impacto:** un usuario de teclado pulsa "Ver detalle" y el foco sigue en el botón, detrás del modal: `Tab` recorre los ~200 elementos del fondo en lugar del contenido del pedido. `Esc` sí cierra pero devuelve el foco a un punto arbitrario.
- **Contraste que demuestra que el proyecto sabe hacerlo:** `carrito.js:172-187` devuelve el foco al elemento que abrió el panel, `:446-460` implementa la trampa de `Tab`, y `auth.js:254` mueve el foco al botón de cerrar. El patrón correcto existe tres veces en el mismo repositorio; estos seis no lo aplican.
- **Solución:** helper único `abrirModal(modal, primerFoco)` / `cerrarModal(modal, previo)` en `auth.js`, con `inert` en el fondo.

---

#### M-09 · Filtro de productos dispara dos peticiones y puede pintar la página equivocada

- **Ubicación:** `js/admin/productos.js:218-235`

```js
element.addEventListener('change', () => { paginaActual = 1; cargarProductos(1); });
if (element.tagName === 'INPUT') element.addEventListener('input', debounce(() => { paginaActual = 1; cargarProductos(1); }, 500));
```

`#filtroBuscar` (`admin/productos.html:68`) es un `<input>`, así que recibe **los dos** listeners. Al escribir y pulsar Enter salen dos peticiones; como `cargarProductos` no cancela la anterior, dos respuestas pueden llegar en orden inverso y pintar la página antigua sobre la nueva.
- **Solución:** `change` solo en `<select>`, `input` con debounce solo en `<input>`.

---

#### M-10 · Login y registro rehabilitan el botón justo antes de redirigir

- **Ubicación:** `js/login.js:139-143` · `js/register.js:258-262`

```js
setTimeout(() => { redirigirTrasAuth(); }, 800);
setBtnLoading(btnLogin, false);   // ← 800 ms antes de navegar
```

Durante 800 ms (login) / 1000 ms (registro) el botón vuelve a estar habilitado con el formulario ya enviado. Un doble clic reenvía `POST /auth/login`. En registro el segundo POST devuelve `EMAIL_EXISTS` y **borra el mensaje de éxito** que el usuario está leyendo (`register.js:209-235`).
- **Solución:** no rehabilitar en el camino de éxito — el mismo criterio que ya aplicó `checkout.js:196` con un comentario que explica el porqué.

---

#### M-11 · Ningún índice sirve las consultas de catálogo por defecto ni el orden por precio

- **Ubicación:** `backend/src/models/Product.js:192-202`

Índices declarados: `{categoria:1, activo:1}`, `{marca:1, activo:1}`, `{destacado:1, activo:1}`, `{enPromocion:1, activo:1}`. `buildFilter` (`productController.js:41`) siempre aplica `activo: true`, pero **ninguno de los cuatro tiene `activo` como campo líder** → `COLLSCAN` + orden en memoria en el caso más frecuente (portada y catálogo).

Los 4 modos de orden por precio (`productController.js:78-80`) y los filtros `minPrice`/`maxPrice` (`:53-57`) no tienen índice que los soporte. `/api/products/buscar` hace `countDocuments({activo:true, $text:{$search:q}})`, que obliga a recorrer todas las postings del término en cada request.
- **Solución:** añadir `{ activo: 1, createdAt: -1, _id: 1 }` (listado por defecto y `nuevos`) y `{ activo: 1, precio: 1 }` (orden por precio y rango de precios).

---

#### M-12 · `npm audit` no se puede ejecutar en `backend/`

- **Ubicación:** `backend/package.json` es un workspace de la raíz, así que sus dependencias viven en el lockfile raíz. `npm audit --prefix backend` falla con `ENOLOCK`.

El CI ejecuta `npm audit` en ambos sitios (§3.4 del README lo afirma), así que ese paso **falla o se salta**. Verificado en local: `npm audit --prefix backend` → `npm error code ENOLOCK`.
- **Solución:** eliminar el paso del workflow, o mover el audit a la raíz con `npm audit --workspaces`.

---

#### M-13 · Reglas de envío hardcodeadas, sin impuestos ni cupones

- **Ubicación:** `backend/src/controllers/orderController.js:50,127` · `backend/src/models/Order.js:96`

```js
export const SHIPPING_RULES = Object.freeze({ freeFrom: 200000, cost: 15000 });
```

- **Envío:** constantes de módulo. Cambiar el umbral de envío gratis exige un redeploy. `env.js` no expone nada de esto.
- **Impuestos:** no hay cálculo de IVA/ICA en ninguna parte del sistema. `total = subtotal + envío`. Si los precios del catálogo son sin impuestos, el cobro no incluye lo que hay que declarar; si son con impuestos, `total` no lo refleja y no hay forma de auditarlo.
- **Cupones:** el campo `descuento` existe (`Order.js:96`) y siempre vale `0`. `discountPercentage` y `applyDiscountPercentage` (`money.js:163,180`) están implementados y probados pero **no los usa ningún controlador**: solo alimentan el virtual de presentación.
- **Decisión de negocio requerida** para los tres puntos.
- **Solución:** mover `SHIPPING_RULES` a `env.js` con validación de enteros no negativos. Documentar si los precios incluyen IVA.

---

#### M-14 · Tres defectos de contraste WCAG 1.4.3 en el sistema de formularios

- **Ubicación:** `css/auth.css:104` · `css/auth.css:325` · `css/auth.css:332-346` + `--color-mauve` (`css/base.css:12`)
- **Evidencia:** ratios calculados con la fórmula WCAG 2.1

| Ubicación | Par | Ratio | Mínimo |
|---|---|---|---|
| `.campo input::placeholder { #b8a9a9 }` | sobre blanco | **2.26:1** | 4.5:1 |
| `.formulario-mensaje.exito { #27ae60 }` | sobre blanco | **2.87:1** | 4.5:1 |
| `.auth-btn { #c97b82 }` + `#fff`, 16px/600 | sobre blanco | **3.16:1** | 4.5:1 |

Detalle: `--color-texto` sobre el que `.auth-btn:hover` cambia da 11.35:1, así que **el contraste empeora justo cuando el usuario deja de mirar el texto**.

- **Impacto:** los placeholders son ilegibles con baja visión. Peor: los **mensajes de éxito** ("¡Cuenta creada con éxito!", "Pedido X creado correctamente") son verdes pálidos: un usuario con baja visión **no ve la confirmación de que su compra se registró**. Y el botón de acción principal de todo el sitio es el de menor contraste.
- **Solución:** `#867172` para placeholders (4.55:1, verificado), `#1e7a45` para `.exito` (5.35:1, verificado), y `#a85a62` para `--color-mauve` (4.88:1, verificado).

---

#### M-15 · No hay pasarela de pago: `estadoPago` es editable a mano y sin evidencia

- **Ubicación:** `backend/src/controllers/orderController.js:202` · `backend/src/models/Order.js:111-120` · `backend/src/controllers/adminController.js:383`

`metodoPago` se **fija siempre** a `'whatsapp'` (`:202`); el enum declara además `'transferencia'|'efectivo'|'tarjeta'` pero esos tres son inalcanzables. `estadoPago` arranca en `'pendiente'` y **solo un admin lo cambia a mano**.

Lo que **sí** está bien: la idempotencia del checkout. `Idempotency-Key` se valida por formato (`:66-68`), se comprueba antes de operar (`:69-84`), y hay un índice único parcial `{usuario:1, idempotencyKey:1}` con `partialFilterExpression` cuyo comentario explica por qué `sparse: true` no habría servido. **Verificado:** dos POST con la misma clave → 201 y 200 con el mismo pedido, un solo documento.

- **Escenario:** un admin marca `pagado` por error un pedido cancelado y el dashboard reporta ingresos que nunca entraron. No hay conciliación que lo detecte.
- **Decisión de negocio requerida.** Si se cobra por WhatsApp/transferencia: documentar `estadoPago` como operable-manualmente y añadir campos de evidencia (`pagoConfirmadoPor`, `pagoConfirmadoEn`, `comprobante`). Si se integra pasarela: endpoint de webhook fuera de `authenticate`, con HMAC sobre el cuerpo crudo (`express.raw`), replay protection por timestamp+nonce y tabla de eventos procesados.

---

#### M-16 · Sentry se inicializa antes de que `dotenv` cargue el `.env`

- **Ubicación:** `backend/src/instrument.js:7-8,11-17` + `backend/src/app.js:5` vs `config/env.js:12-13`

```js
// instrument.js:7-8
const dsn = process.env.SENTRY_DSN;
const isProduction = process.env.NODE_ENV === 'production';
```

En ESM los módulos se evalúan en el orden de los `import`. `app.js:5` importa `'./instrument.js'` **antes** de `config/db.js` → `config/env.js`, que es el único que hace `dotenv.config({path: envPath})`. Cuando `NODE_ENV` y `SENTRY_DSN` vienen solo del `.env` (self-hosted, Docker, `npm start`), **ambas son `undefined` en ese punto y `Sentry.init()` nunca se llama**. Sin ningún aviso.

- **Impacto:** monitoreo desactivado silenciosamente en cualquier despliegue fuera de Vercel. El equipo opera a ciegas.
- **Solución:** que `instrument.js` importe `config/env.js`, o mover la inicialización a una función `initSentry()` llamada desde `app.js` tras los imports.

---

#### M-17 · La compensación de `cancelOrder` revierte siempre a `pendiente`

- **Ubicación:** `backend/src/controllers/orderController.js:424-437`

```js
Order.updateOne({ _id: req.params.id },
  { $set: { estado: 'pendiente' }, $unset: { canceladoEn: 1, motivoCancelacion: 1 } }),
```

El estado anterior puede ser `pendiente` **o** `confirmado` (filtro de `:391`). Si estaba `confirmado` y falla la reposición de stock, la compensación lo degrada a `pendiente`: el cliente ve que su pedido "confirmado por la tienda" ha retrocedido. Contraste: la compensación equivalente en `adminController.js:373-376` **sí** restaura `previousEstado` porque ahí la variable está disponible. Aquí no se capturó.
- **Solución:** leer el estado previo en el `catch` y usarlo.

---

#### M-18 · Un error transitorio de Mongo convierte un checkout exitoso en un 409

- **Ubicación:** `backend/src/services/transaction.js:128` + `orderController.js:146,158-169`

`session.withTransaction()` reintenta el callback ante errores con etiqueta `TransientTransactionError`. El callback no es idempotente respecto al estado que él mismo escribe:

1. Intento 1: el `findOneAndUpdate` reclama el carrito con `checkoutToken` → **éxito**; luego el `bulkWrite` falla por error transitorio.
2. El driver aborta y **reintenta** el callback.
3. Intento 2: el mismo `checkoutToken` ya no casa (`checkoutExpiresAt` en futuro) → `!claimedCart` → lanza `CHECKOUT_IN_PROGRESS` (409).

El cliente recibe "ya hay un checkout en curso" cuando el primero ya terminó. Y como el TTL es de 2 min (`:147`), un reintento del cliente dentro de esa ventana también recibe 409 en vez del replay idempotente.
- **Solución:** generar el `checkoutToken` **dentro** del callback (mover el `randomUUID()` de `:146` al interior), para que el filtro `$or` vuelva a casar.

---

#### M-19 · `/api/health` expone el mensaje de error de configuración sin redactar

- **Ubicación:** `backend/src/app.js:272-283` (emisión) vs `:49` (`redactConfig`, que existe pero no se aplica aquí) vs `:306-311` (donde sí se usa)

```js
...(configError ? { configError: configError.message } : {}),   // ← crudo
```

`redactConfig` trunca a 300 chars precisamente para no filtrar el `.env`, y el middleware `/api` lo usa. `/api/health` devuelve el mensaje crudo, que puede ser la lista completa de variables que faltan: `Configuración de seguridad inválida: JWT_SECRET, REDIS_ENABLED, MONGODB_URI_TLS, COOKIE_SECURE, .env permissions`. Además está exento del rate limit (`:226`) y responde 200 incluso con Mongo caído.
- **Impacto:** reconocimiento gratuito y sin autenticar: qué variables están configuradas, si Redis/Mongo funcionan. No hay secretos, pero es información de=topología.
- **Solución:** aplicar `redactConfig(configError.message)`, y en producción limitar `environment`/`redis`/`configError`.

---

#### M-20 · Siete puntos leen `process.env` saltándose `config/env.js`

- **Ubicación:** `instrument.js:7,8,13` · `app.js:349,405,487` · `config/db.js:30,35` · `seeds/seed.js:334-335,339-340`

El encargo de `env.js` es ser la fuente única. Estas lecturas lo evitan, y `validateSecurityEnvironment()` (que valida 20 invariantes) **no valida ninguna**:

| Ubicación | Variable | Consecuencia |
|---|---|---|
| `app.js:349` | `SERVE_STATIC` | Sin default documentado; si falta, sirve estáticos en cualquier entorno |
| `app.js:405` | `SENTRY_DSN` | Sin validar: un DSN malformado hace que `Sentry.init` lance en el import |
| `app.js:487` | `FAIL_FAST_ON_DB_ERROR` | Igual, sin mención en `.env.example` |
| `db.js:30,35` | `MONGO_MAX_POOL_SIZE`, `MONGO_SERVER_SELECTION_TIMEOUT_MS` | Sin validar: `Number('abc')\|\|5` → 5; `MONGO_MAX_POOL_SIZE=0` → 0 (pool mínimo, degrada throughput) |
| `seed.js:334-340` | `SEED_*` | Acepta longitud ≥ 12, sin entropía ni lista de contraseñas comunes |

- **Solución:** exportarlas desde `env.js` con validación de rango y formato, e incluirlas en `validateSecurityEnvironment` cuando corresponda.

---

#### M-21 · Fichas de producto: la previsualización de enlaces siempre muestra la misma tarjeta

- **Ubicación:** `producto.html:13-18` + `js/producto.js:153-239`

```html
<meta property="og:title" content="By Jers | Producto">
<meta property="og:image" content="https://byjers.com/img/hero/soficora.webp">
```

`actualizarOpenGraph()` y el JSON-LD `Product` los reescriben **solo en runtime**. El comentario de `producto.html:21-26` asume que eso arregla la previsualización de enlaces.

**WhatsApp no ejecuta JavaScript** al generar la previsualización, ni lo hacen Facebook, LinkedIn, Telegram ni Slack: leen el HTML crudo. Como la tienda cierra sus ventas por WhatsApp, **toda ficha compartida muestra la misma tarjeta "By Jers | Producto"** con la imagen del hero, idéntica para todos los productos.
- **Solución:** generar en el build (`preparar-estatico.mjs` ya centraliza la copia) una página estática por producto con OG y JSON-LD reales. Alternativa mínima: cambiar el `og:title`/`og:image` estáticos a algo verdadero (marca y categoría) en vez de la palabra "Producto".

---

#### M-22 · El carrusel de marcas anuncia tres marcas que no existen en la base de datos

- **Ubicación:** `index.html:192-209` vs `backend/src/seeds/seed.js:16-21`

| HTML hardcodeado | Seed real (verificado en la API) |
|---|---|
| Maybelline, L'Oréal Paris, MAC | Atenea Profesional, L'Bel, Jorge de la Garza, Maybelline, L'Oréal Paris, MAC |
| **NYX, Revlon, Wella** | *(no existen)* |

`index.html:176` dice "Más de 20 marcas disponibles" con 6 en la base. Y el error es doble: **se esconden las tres marcas propias** (Atenea, L'Bel, JDG) detrás de tres distribuidoras que no venden.
- **Solución:** poblar el carrusel desde `getBrands()` (`api.js:319`, ya disponible) con el patrón de estados de `index.js:62-81`, y bajar el texto a la cifra real.

---

#### M-23 · Acciones de usuario sin feedback al fallar

- **Ubicación:** `js/mis-pedidos.js:428-431` · `js/mis-direcciones.js:300-316` · `js/admin/usuarios.js:195-218`

```js
if (!response.ok) {
    handleApiError({ message: response.msg, status: response.data?.status }, 'cancelar-pedido');
    return;                        // ← solo consola
}
```

Los tres archivos **ya tienen** `mostrarToast` importado y usado en otros caminos.
- **Impacto:** el usuario pulsa "Cancelar pedido" y si el backend responde `CANNOT_CANCEL` (el estado cambió a `procesando` entre medias) **no ocurre nada visible**: el `prompt` se cierra, el pedido sigue en la lista, sin explicación.
- **Solución:** usar el `mostrarToast` ya presente en el camino `!response.ok`.

### 4.4 BAJOS

| ID | Severidad | Ubicación | Problema | Solución |
|---|---|---|---|---|
| B-01 | BAJO | `orderController.js:91,449` · `authController.js:94` · `adminController.js:111,152` · `userController.js:110,157,160,200,204` | Conflictos de estado devuelven **400** en vez de **409**. Inconsistente con el 409 que ya usa `CHECKOUT_IN_PROGRESS` (`:171`), lo que impide al frontend distinguir "corrige tu payload" de "resuelve el conflicto". | Cambiar a 409. |
| B-02 | BAJO | `authController.js:92-95` | `EMAIL_EXISTS` **confirma la existencia del email** en un endpoint público: permite construir un listado de clientes. La mitigación existe en el mismo archivo (`forgotPassword`) y no se aplica aquí. **Verificado:** devuelve 400 con mensaje explícito. | Responder 201/202 genérico y enviar "si esta cuenta ya existía, confirma tu acceso". |
| B-03 | BAJO | `middleware/apiError.js:46-107` · `auth.js:76-78` · `errorHandler.js:103-105` | El contrato de error promete ser auditable leyendo `apiError.js` y se publica en `API.md:31-32`, pero **14 códigos se emiten como literales fuera del registro** (`EMAIL_EXISTS`, `INVALID_CREDENTIALS`, `EMPTY_CART`, `INSUFFICIENT_STOCK`, `LAST_ADMIN`, `CATEGORY_HAS_PRODUCTS`…) y 5 de ellos ni siquiera están documentados. Además `TOKEN_EXPIRED` **nunca se emite**: `auth.js:76` captura el error JWT y devuelve siempre `INVALID_TOKEN`. | Mover los 14 a `ErrorCodes`, añadir los 5 a `API.md`, y separar la rama de expiración en `auth.js`. |
| B-04 | BAJO | `middleware/security.js:11-27` · `app.js:265,266` | El token CSRF está firmado con clave derivada del secreto y validado en tiempo constante: correcto. Pero su vida útil es de 8 h y no rota con la sesión, así que tras un `logout` el token sigue siendo válido. | Rotar el token CSRF en login/logout. |
| B-05 | BAJO | `apiError.js` / todo el proyecto | **No hay tests de frontend.** Ningún bug crítico de esta auditoría habría sido detectado por la suite. | Tests con jsdom para `carrito.js`, `checkout.js` y `js/api.js`. |
| B-06 | BAJO | raíz | **No hay linter, ni type-check, ni formateador.** Ningún tooling en `package.json`, ningún paso en CI. Los errores de tipo solo los ve el navegador en runtime — y de ahí salen A-03 y A-08. | ESLint + `checkJs` o JSDoc types, como paso de CI. |
| B-07 | BAJO | raíz | `npm audit --prefix backend` falla con `ENOLOCK` (ver M-12). El CI afirma ejecutarlo. | Ver M-12. |
| B-08 | BAJO | `models/User.js:114` vs `validation.js:106,130` | Contraseñas de hasta 128 caracteres, pero **bcrypt trunca silenciosamente a 72 bytes**. Dos contraseñas que coincidan en 72 bytes son equivalentes a efectos de autenticación. | `max(72)` en Zod y en el modelo, o migrar a Argon2id. |
| B-09 | BAJO | `models/Order.js:192` | Índice `{estado:1}` **redundante**: `{estado:1, createdAt:-1}` (`:173`) ya sirve cualquier query por prefijo. Solo encarece escrituras y duplica disco. Peor: `syncIndexes()` lo recrearía en cada arranque. | Eliminar la línea. |
| B-10 | BAJO | `models/Product.js:144-146,172-174` | Dos hooks arman el mismo SKU con `Date.now().toString(36)`: resolución de milisegundo. Con el índice `unique`, dos admins creando productos que compartan las 3 primeras letras en el mismo ms dan `E11000`. El seed ya lo resolvió forzando por posición; la ruta de API no. | `crypto.randomUUID().slice(0,8)` y borrar el `pre('save')` duplicado. |
| B-11 | BAJO | `adminController.js:32-36` + `models/Product.js:110-119` | `POST /api/admin/productos` no verifica que la categoría y la marca **existan**. Zod solo valida el formato ObjectId. Una referencia colgante produce `categoria: null` en el catálogo público, y el frontend espera un objeto con `nombre`/`slug`. | Verificar existencia antes de crear. |
| B-12 | BAJO | `seeds/seed.js:343-349` | El seed limpia 4 de 7 colecciones (`Order`, `Cart` y `Contact` no se vacían) pero el log dice "Limpiando base de datos…". Tras un re-seed quedan referencias huérfanas y `populate` devuelve `null`. | `dropDatabase()` o las 7, y log exacto. |
| B-13 | BAJO | `cartController.js:79-81` + `models/Cart.js` `agregarItem` | El cliente recorta a 99 unidades en tres sitios; el backend valida 99 **por llamada**, no sobre la cantidad **resultante**. N llamadas con `cantidad: 1` acumulan por encima de 99. | Validar el tope sobre la cantidad resultante. |
| B-14 | BAJO | `mis-pedidos.js:422-426` | `confirmarCancelacion` **pide el motivo, no la confirmación**: un clic en "Aceptar" cancela el pedido de inmediato (con restauración de stock en el backend). Además usa `alert()`/`prompt()`, que no son traducibles y anulan el `aria-live`. | Reutilizar `#modalDetallePedido` para confirmar, con `<textarea>` opcional y botón explícito. |
| B-15 | BAJO | `js/api.js:378-383` | `apiErrorFromResponse` **ignora su segundo argumento**: el fallback `'No se pudo guardar el producto'` se descarta. Agrava A-04. | `(respuesta, porDefecto = '…')`. |
| B-16 | BAJO | `js/producto.js:702-709` | `mostrarError` inyecta en `innerHTML` sin `escapeHTML` y sin null-check. Hoy solo recibe un literal, así que **no hay XSS explotable**, pero es el único punto de ~60 que no escapa. | `escapeHTML` + guarda de null. |
| B-17 | BAJO | `js/app.js:729-733,847-869` | El panel del chatbot no es un diálogo: sin `role="dialog"`, sin `aria-modal`, sin gestión de foco. Al cerrarlo el foco queda en un elemento que pasa a `display:none`. Afecta a las 21 páginas. | `role="dialog"` + `inert` + foco al abrir y devolver al cerrar. |
| B-18 | BAJO | `carrito.js:290`, `app.js:999`, `rutas.js:43`, `mis-pedidos.js:40`, `mi-perfil.js:54`, `mis-direcciones.js:45` | **4 viajes paralelos a `/auth/me`** al cargar una página de cuenta, y el contador del carrito puede pintar con datos de una respuesta distinta de la que usa la página. | Promesa compartida en `api.js`: preguntar al backend solo si no hay ninguna en vuelo. |
| B-19 | BAJO | `app.js:57-58,133-144` + `vercel.json:14` | `obtenerPaginaActual()` hace `pathname.split('/').pop()`. Con `cleanUrls: true` la URL canónica es `/maquillaje` → `"maquillaje"`, y el enlace es `href="maquillaje.html"` → `"maquillaje.html"`. La comparación falla y **el enlace de la página actual nunca se resalta en producción**. | Normalizar quitando la extensión en ambos lados. |
| B-20 | BAJO | `carrito.js:67-68` + `carrito.js:203,208` | El backend valida el id del producto como ObjectId de 24 hex; el carrito en localStorage guarda ids de producto que **no son ObjectId** (los que `producto.html?id=` acepta). `agregar()` devuelve `{ok:false}` y ese motivo se descarta (ver M-02). | Alinear ambos lados o adaptar el id. |
| B-21 | BAJO | 13 HTML (`login.html:88`, `register.html:70`, `checkout.html:38`, `admin/*.html`…) | Formularios con `method="post"` y sin `action`. Con JS el `preventDefault()` lo evita, pero si un módulo ES falla al cargar, el `DOMContentLoaded` nunca registra el handler y el formulario hace POST a la página actual: recarga, pierde todo lo escrito y en `login.html` muestra JSON crudo. | Quitar `method="post"` o añadir `<noscript>` avisando. |
| B-22 | BAJO | `app.js:501-516` + `contacto.html:98` | El formulario de contacto **no tiene estado de carga**: `setBtnLoading()` busca `.btn-texto`/`.btn-loader` y `<button class="contact-btn">Enviar</button>` no tiene ninguno. El `disabled` sí se aplica, pero el texto no cambia. | Añadir los dos spans, como en `login.html:138-141`. |
| B-23 | BAJO | 21 HTML (`index.html:362,368,374`) | Los tres iconos del pie apuntan a `facebook.com/tu-tienda`, `instagram.com/tu-tienda`, `twitter.com/tu-tienda`: perfiles que no existen. | URLs reales o eliminar los iconos. |
| B-24 | BAJO | `bienvenida.html:26,34` + `scripts/preparar-estatico.mjs:29` | **Doble splash screen**: la página carga `loader-boot.js` (que inyecta `#page-loader`) y además trae su propio `#intro-loader`, que solo se oculta cuando 6 de 153 webp descargan. Dos animaciones de progreso compitiendo. `img/hero-secuencia/` pesa **17 MB en 153 archivos**. | Eliminar uno de los dos loaders. |
| B-25 | BAJO | `resenas.html:65-114` + `js/resenas.js` (4 líneas) | `<h1>Lo que dicen nuestras clientas</h1>` sobre seis reseñas escritas a mano en el HTML, con nombres. No hay modelo de reseñas, moderación, fechas ni verificación de compra. Las estrellas son texto plano sin `aria-label`. En Colombia, afirmar "opiniones reales" sin que lo sean es práctica comercial engañosa. | Conectar a un modelo `Review` con moderación, o cambiar el encabezado a algo honesto y añadir `aria-label`. |
| B-26 | BAJO | `vercel.json:24` vs `app.js:139-152` | **Dos cabeceras CSP** en Vercel: la de `vercel.json` (aplicada a `/(.*)`, incluidas las respuestas de `/api/*`) y la de `helmet`. La de `vercel.json` no incluye `frame-src 'none'` ni `upgrade-insecure-requests`, y fija `connect-src 'self'` sin `API_ORIGIN`. Hoy no hay impacto (arquitectura de un solo dominio), pero diverge. | Eliminar la CSP de `vercel.json` para `/api/*` o alinear ambas. |
| B-27 | BAJO | `app.js:348,355-370,381-382` | El comentario de "segunda barrera" afirma que `.env` y `package.json` no se sirven nunca, pero `STATIC_DENY` **solo se aplica a la ruta de HTML abreviado** (`:382`), no a `express.static` (`:370`). Lo único que hoy lo impide es `dotfiles:'deny'` y que `public/` sea build generado. La barrera prometida no existe. | Pasar `STATIC_DENY` al `setHeaders` de `express.static`, y renombrar el comentario. |
| B-28 | BAJO | `services/money.js:40-48` + `errorHandler.js:51,64-65` | `MoneyError` fija `isOperational = true` pero no `statusCode` ni `code`. Un `MoneyError` por overflow produce **500 con el mensaje interno** en lugar de un 400 de validación. | `statusCode = 400` y `code = VALIDATION_ERROR` en `MoneyError`. |
| B-29 | BAJO | `authController.js:143-146` | `logout` incrementa `tokenVersion`, lo que **revoca la sesión en todos los dispositivos**. La cookie local se borra igualmente, así que el `$inc` es redundante para el propio dispositivo. `changePassword` y `resetPassword` sí deben rotar todas; `logout` es discutible y no está documentado. | Sin `$inc` en logout, o documentarlo y ofrecer `/api/auth/logout-all`. |
| B-30 | BAJO | `middleware/auth.js:22-25` + `authController.js:39` | `issuer`/`audience` solo se exigen en producción. `JWT_EXPIRES_IN` es código muerto: el único llamador siempre pasa `SESSION_EXPIRES_IN` o `REMEMBER_ME_EXPIRES_IN`, pero `.env.example:31` lo publica como si tuviera efecto. | Verificar issuer/audience siempre; eliminar el default muerto. |
| B-31 | BAJO | `authController.js:235` + `app.js:242` | `PATCH /api/auth/password` solo tiene el limitador general (100/15 min), y cada intento cuesta un `bcrypt.compare` de coste 12 en JS puro. Un atacante con un token robado puede agotar CPU del servidor. | Añadir `password` a `isAuthRateLimitedPath`. |
| B-32 | BAJO | `config/db.js:38,51` + `app.js:112` | `db.js:38` imprime el **hostname del cluster** en cada arranque; los errores de Redis y Mongo se registran sin redacción. Si un driver incluye la URL en su mensaje (con `REDIS_URL` y contraseña), acabaría en los logs. Potencial, no confirmado. | Enmascarar el host; aplicar `redact()` a los mensajes de drivers. |
| B-33 | BAJO | `api/index.js:66-70` | El shim serverless reconstruye `req.url` con la subruta de `req.query.path` sin normalizar `..`. **No encontré bypass** (la guarda de `%2f` de `security.js:74` no salta porque la URL ya fue reescrita, pero `path-to-regexp` trata `/api/foo/../admin` como literal y cae en el 404). El impacto real es un 404 en vez de un 400. | Validar `subruta` con un patrón estricto antes de reescribir. |
| B-34 | BAJO | `adminController.js:322` | Verificado que **NO** es bug: la guarda `if (nextEstado === 'cancelado' && (order.estadoPago === 'pagado' \|\| req.body.estadoPago === 'pagado'))` devuelve 409 `PAID_ORDER_REQUIRES_REFUND` al intentar marcar pagado un pedido cancelado. La auditoría anterior loointerlo como hueco. Dejar anotado para que nadie lo "arregle". | Ninguna. |
| B-35 | BAJO | 22 HTML | Google Fonts es render-blocking en las 22 páginas: `<link rel="stylesheet">` en `<head>` sin `media="print"` ni `preload`. `display=swap` mitiga el LCP pero el `<link>` sigue bloqueando el primer render. | `<link rel="preload" as="style" onload="this.rel='stylesheet'">` + `<noscript>`. |

---

## 5. Plan de corrección priorizado

Cada bloque es un commit en `audit/fixes`. Tras cada bloque: `npm test` + arranque + prueba manual del flujo afectado.

### Bloque 1 — Datos y dinero (C-01, A-01, A-06, M-03, M-17)
1. **C-01**: compensar por `_id` del pedido creado, no `deleteMany` por usuario. Test: dos pedidos sin `Idempotency-Key` + un 409 → ambos sobreviven.
2. **A-06**: helper `revertirStock()` llamado en `cancelado` **y** `reembolsado`. Test: `entregado → reembolsado` repone stock y decrementa `vendidos`.
3. **M-03**: `if (activo !== undefined) filter.activo = activo`. Test: `?activo=false` devuelve solo inactivos.
4. **M-17**: restaurar `previousEstado` real en la compensación de `cancelOrder`. Test: cancelar un pedido `confirmado` que falla conserva `confirmado`.
5. **A-01**: desglose de envío en el checkout reutilizando `SHIPPING_RULES` (requiere tu decisión sobre el modelo de envío).

### Bloque 2 — Carrito (C-02, M-01, M-02, B-20)
6. **C-02**: regla CSS de `.carrito-item__img` + `width`/`height` en el `<img>`. Prueba visual del panel.
7. **M-01**: control `− N +` por línea, conectando `cambiarCantidad()` que ya existe.
8. **M-02**: mostrar `r.motivo` cuando `agregar()` falla.
9. **B-20**: alinear el id del producto entre carrito local y backend.

### Bloque 3 — Panel admin (A-03, A-04, A-05, M-09, M-23)
10. **A-03**: inicializar la UI del modal antes del `await` + `try/catch` en las cargas.
11. **A-04**: rama `else` con mensaje global; localizar campos de imagen por `querySelector`.
12. **A-05**: rutas absolutas en los enlaces de sesión.
13. **M-09**: `change` solo en `<select>`, `input` solo en `<input>`.
14. **M-23**: `mostrarToast` en los caminos `!response.ok`.

### Bloque 4 — Flujo de compra (A-02, A-08, M-06, M-07)
15. **A-02**: redirección a WhatsApp (o pestaña nueva + sección visible) — requiere tu decisión.
16. **A-08**: leer `data.brands` en `index.js`.
17. **M-06**: wrapper de búsqueda + input en el header con debounce.
18. **M-07**: enlace a `mis-direcciones` en el menú y en `mi-perfil`.

### Bloque 5 — Formularios y accesibilidad (A-09, M-10, M-14, M-08, B-14, B-15, B-16)
19. **A-09**: `closest()` en `limpiarErrorCampo`.
20. **M-10**: no rehabilitar el botón en el camino de éxito.
21. **M-14**: los tres colores de contraste, con ratios verificados.
22. **M-08**: helper único de apertura/cierre de modal con foco.
23. **B-14, B-15, B-16**: confirmación de cancelación, segundo argumento de `apiErrorFromResponse`, `escapeHTML` en `producto.js`.

### Bloque 6 — Backend robusto (A-07, M-05, M-16, M-19, M-20, B-03)
24. **A-07**: store de Redis sin lanzar + reconexión que no se rinde.
25. **M-05**: exigir `TRUST_PROXY_HOPS >= 1` en Vercel.
26. **M-16**: Sentry después de `dotenv`.
27. **M-19**: redactar el `configError` de `/api/health`.
28. **M-20**: centralizar las 7 lecturas de `process.env` en `env.js`.
29. **B-03**: llevar los 14 códigos literales a `ErrorCodes` y emitir `TOKEN_EXPIRED`.

### Bloque 7 — Calidad e infraestructura (M-12, B-05, B-06, B-07, B-09, B-26, B-27)
30. **M-12/B-07**: que `npm audit` funcione en los dos sitios que afirma el CI.
31. **B-06**: ESLint + `checkJs`, con paso en CI.
32. **B-05**: tests jsdom de `carrito.js`, `checkout.js`, `js/api.js`.
33. **B-09, B-26, B-27**: limpieza de índices y cabeceras duplicadas.

### Bloque 8 — Contenido (M-11, M-13, M-21, M-22, M-15, M-23, B-21…B-33)
Lo que depende de decisiones de negocio o de contenido. Ver §6.

---

## 6. Decisiones que necesito de ti antes de corregir

1. **A-01 / M-13 — Envío.** ¿Cobras $15.000 siempre, o gratis desde cierto monto? ¿Y el umbral, cuál es? Ahora mismo está hardcodeado en `orderController.js:50` y el cliente no lo ve.
2. **A-02 — Confirmación de pago.** ¿Redirección automática a WhatsApp (te saca de la web), o pestaña nueva mantendo al usuario en el sitio con su pedido visible?
3. **M-13 — Impuestos.** ¿Los precios del catálogo incluyen IVA? Ahora `total = subtotal + envío` y no hay cálculo de impuestos en ningún sitio.
4. **M-15 — Pasarela de pago.** ¿Seguimos con WhatsApp/transferencia (y entonces documento `estadoPago` como manual con campos de evidencia), o integramos una pasarela? Cambia bastante el alcance del Bloque 8.
5. **M-13 — Cupones.** El campo existe y siempre vale 0. ¿Se implementan o se limpia el campo?
6. **M-01 — Límite de cantidad.** El frontend limita a 99 por item, el backend valida 99 por llamada pero no sobre el acumulado. ¿Cuál es el límite real?
7. **Legal.** Faltan datos de empresa, política de cookies y política de devoluciones/reembolsos. Los modales de términos y privacidad **existen y funcionan**, pero el contenido es de 4 viñetas. ¿Tienes los datos para completarlos, o los dejo marcados como pendientes con la estructura lista?
8. **`backend/.env`.** La `MONGODB_URI` de Atlas responde `bad auth : authentication failed`. ¿La credencial caducó, o la sustituyo por la local para que el repo funcione?

---

## 7. Cobertura de esta auditoría

### Revisado por completo

- **Backend (45 archivos):** `app.js`, `instrument.js`, `config/env.js`, `config/db.js`, los 7 middleware, los 8 modelos, los 7 controladores, las 7 rutas, los 3 servicios, `seeds/seed.js`, `api/index.js`, `vercel.json`.
- **Frontend:** los 25 módulos de `js/` y `js/admin/`, los 22 HTML, las 19 hojas CSS.
- **Ejecutado:** `npm install`, `npm test` (164/164), `npm audit`, build estático, arranque del servidor, seed, y pruebas de API reales con curl autenticado como admin: login, registro duplicado, filtro de usuarios, ciclo de vida de pedido completo (crear → confirmar → procesar → enviar → entregar → reembolsar), cancelación, transiciones de estado, idempotencia (replay y concurrencia), y verificación directa en Mongo de los estados.

### Omitido, y por qué

- **Pruebas en navegador real.** No hay Playwright ni Cypress instalados y no hay display. Las consecuencias visuales (C-02, M-14, M-08) están argumentadas por cálculo y lectura de CSS, no por captura. Propongo añadirlos en el Bloque 7.
- **Revisión de los 17 MB de `img/hero-secuencia/`.** Solo el peso y el número de archivos.
- **Los ~340 paquetes de `node_modules`.** `npm audit` dio 0 vulnerabilidades.
- **Correos reales.** SMTP no está configurado en el entorno local; verifiqué el código y los tests, no el envío.
- **Redis real.** No hay instancia; el análisis de A-07 es lectura de código más verificación de `express-rate-limit@7.5.1`.

### Lo que esta auditoría NO cubre

- Legal y tributario. Revisé que los modales existan y funcionen; no su redacción.
-Accesibilidad con lector de pantalla real. Verifiqué ARIA y contraste por cálculo; no probé con NVDA o VoiceOver.
- Rendimiento en red real. No hay throttling ni métricas Core Web Vitals.
- Los `.html` de `public/` (build generado, se reconstruye en cada `npm start`).

---

## 8. Entorno usado

```
Node      v22.23.3          npm  10.9.9
MongoDB   mongod local standalone (sin réplica), base by-jers-audit
Redis     deshabilitado (REDIS_ENABLED no activo en desarrollo)
Tests     164 en 11 suites, todos pasan
Audit     0 vulnerabilidades en la raíz
Lint      no existe
Rama      audit/fixes, base master @ e19cdba
```

Para reproducir el arranque con la base local:

```bash
MONGODB_URI=mongodb://127.0.0.1:27017/by-jers-audit npm start
```