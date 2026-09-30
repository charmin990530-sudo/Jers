# AUDITORÍA — By Jers (e-commerce de maquillaje y cuidado capilar)

- **Fecha de auditoría:** 30 de septiembre de 2026
- **Alcance:** backend (Express + MongoDB) y frontend (HTML/CSS/JS vanilla) del repositorio completo
- **Rama auditada:** `feature/interactividad-video` @ `a92a383`
- **Rama de corrección:** `fix/auditoria` (rollback: `git checkout feature/interactividad-video`)
- **Alcance de pruebas:** Node `v20`, `npm workspaces`, sin navegador automatizado
- **Método:** lectura completa del código + ejecución de la suite de tests + `npm audit` + contraste con la documentación (`README.md`, `API.md`, `backend/.env.example`)

> **Nota de trazabilidad.** Este archivo se creó dentro de la propia rama de corrección porque la
> auditoría se ejecutó inicialmente en modo de solo lectura y el informe no llegó a escribirse.
> Todos los hallazgos se verificaron contra el código en `a92a383` antes de corregirse.

---

## 1. Resumen ejecutivo

### 1.1 Estado general

El proyecto tiene una **calidad de diseño del backend notable** y una **ejecución de frontend con
fallos funcionales graves**. El esqueleto de seguridad es sólido (JWT en cookie `HttpOnly`, CSRF
firmado, CSP real, aritmética monetaria entera, idempotencia, transacciones), pero **varias
pantallas del panel de administración y del checkout no funcionan en absoluto**: dos recursiones
infinitas, una llamada a una función inexistente y una URL con prefijo duplicado. El catálogo público,
el carrito y la autenticación sí funcionan.

No es un proyecto con problemas de seguridad. Es un proyecto con **funcionalidad rota y
cumplimiento legal incompleto**, sobre una base de seguridad mejor que la media.

### 1.2 Puntaje por área (0-10)

| Área | Nota | Comentario |
|---|---|---|
| Seguridad backend | **8.0** | Sin inyección, sin XSS explotable, CSRF + origin guard + CSP. Se resta la ausencia de 2FA, de audit log de acciones admin y el hueco de conciliación de pagos. |
| Modelo de datos | **8.5** | Esquemas con validadores enteros en las 3 capas (Zod, modelo, servicios), índices compuestos bien elegidos, índice `partial` para idempotencia. Se resta la ausencia de migraciones y de soft delete en pedidos. |
| Aritmética monetaria | **9.5** | `services/money.js` con enteros y redondeo explícito, validado en HTTP y en persistencia. Prácticamente impecable. |
| Pagos / checkout | **5.0** | Reserva de stock transaccional y con token de expiración, pero **sin pasarela de pago**: el cobro es por WhatsApp y no hay conciliación automática ni email de pedido. |
| Frontend / bugs | **4.0** | 5 funcionalidades rotas de las 21 páginas. Muchos `TypeError` por falta de null-check. |
| Accesibilidad (WCAG AA) | **3.5** | ~40 combinaciones de color bajo 4.5:1, anillo de foco a 1.16:1, cero skip links, patrón ARIA de tabs incompleto, modales sin foco. |
| SEO | **4.0** | JSON-LD de producto con datos falsos, `SearchAction` a un 404, cero `canonical`, sitemap sin las fichas de producto. |
| Performance | **5.0** | 30 scripts render-blocking, 17 MB de frames, `Cache-Control` ausente para `/js/*`, 3 peticiones duplicadas en el home. |
| E-commerce / UX | **5.0** | Carrito y recuperación de carrito bien resueltos. En contra: el formulario de contacto no funciona, los errores de contraseña son invisibles, cero reseñas en el backend. |
| Tests | **7.0** | 129 tests reales sobre stock, idempotencia, transacciones y dinero. **Cero cobertura del frontend**, que es donde están todos los bugs críticos. |
| Cumplimiento legal | **2.5** | Enlaces legales rotos, sin datos de empresa, sin política de cookies. **Bloqueante.** |

**Nota global: 5.8 / 10.**

### 1.3 Top 10 riesgos

| # | Riesgo | Por qué importa en el negocio |
|---|---|---|
| 1 | **Pedidos perdidos sin aviso** (C-06): el pedido descuenta stock, queda `pendiente`, y no se envía ni un email | Pérdida directa de ventas. El cliente cierra WhatsApp y nadie sabe que hubo una compra. El stock queda bloqueado para siempre. |
| 2 | **Panel de pedidos y dashboard no renderizan** (C-01, C-02) | El negocio no puede gestionar pedidos, ver ingresos ni cambiar estados. Operativamente inútil. |
| 3 | **Recuperación de contraseña rota** (C-04) | Un cliente que olvidó su clave queda bloqueado. Requiere intervención manual por WhatsApp. |
| 4 | **Formulario de contacto roto** (C-03) | Se pierde el canal de captación y soporte. El error se registra como si fuera de negocio. |
| 5 | **Enlaces legales rotos + sin datos de empresa** (C-07) | Riesgo de sanción bajo Ley 1581/2012 (SIC). Un ecommerce colombiano sin aviso de privacidad accesible es una exposición directa. |
| 6 | **Sin pasarela de pago** | El pago depende de que el cliente termine el chat de WhatsApp. No hay webhook, ni idempotencia de pago, ni conciliación. El riesgo es 100% humano. |
| 7 | **Stock no se devuelve en reembolsos** (A-01) | Decisión consciente para cosmética, pero hoy no está documentada en ningún sitio, así que el próximo admin que la lea y la asumirá como bug e inventará un parche. |
| 8 | **Importes de "ingresos del día" en UTC** (A-02) | El dashboard reporta mal los ingresos: el día cambia 5 horas antes de lo que la tienda cree. Decisiones de negocio tomadas sobre cifras erróneas. |
| 9 | **Cero tests de frontend** | Ningún fallo crítico de esta auditoría habría sido detectado por la suite. El único gate es `npm test`, que solo mira el backend. |
| 10 | **Fuga de información en la consola del cliente** (`js/login.js`, `js/register.js`) | Se vuelca el perfil del usuario (email, teléfono, direcciones) en `console.error` en un sitio público. |

---

## 2. Stack y arquitectura detectados

### 2.1 Stack

| Capa | Tecnología | Versiones reales instaladas |
|---|---|---|
| Runtime | Node.js | `>=20` (CI fija `20.x`) |
| Gestor | npm workspaces | raíz + `backend` |
| Backend | Express | 4.22.3 |
| Base de datos | MongoDB + Mongoose | 8.24.4 |
| Validación | Zod | 3.25.76 |
| Autenticación | `jsonwebtoken` (HS256) en cookie `HttpOnly` | 9.0.3 |
| Hash de contraseñas | `bcryptjs`, 12 rounds | 2.4.3 |
| Seguridad HTTP | `helmet`, `cors`, `express-rate-limit`, `cookie-parser` | 7.2.0 / 2.8.6 / 7.5.1 / 1.4.7 |
| Rate limit distribuido | `redis` (opcional, activo solo en producción) | 4.7.1 |
| Email | `nodemailer` (SMTP) | 10.0.12 |
| Tests | `jest` + `supertest` + `mongodb-memory-server` (réplica set real) | 30.5.2 / 7.3.0 / 11.3.0 |
| Monitorización | `@sentry/node` (opcional) | 11.1.0 |
| Frontend | HTML, CSS y JavaScript (módulos ES, sin framework) | — |

### 2.2 Servicios externos

| Servicio | Estado | Nota |
|---|---|---|
| MongoDB | Obligatorio | Atlas `mongodb+srv://` en producción, validado en `env.js:210` |
| Redis / Upstash | Obligatorio en producción | `rediss://` validado en `env.js:209`; si falla, degrada a memoria (documentado) |
| SMTP | Obligatorio en producción | `env.js:177-179`; **solo se usa para reset de contraseña y contacto** |
| Sentry | Opcional | Solo se inicializa con `SENTRY_DSN` + `NODE_ENV=production` (`instrument.js:10`) |
| **Pasarela de pago** | **No existe** | `metodoPago` es un enum con valores `whatsapp/transferencia/efectivo/tarjeta` (`Order.js:116-120`) pero **el checkout solo escribe `'whatsapp'`** (`orderController.js:198`). No hay webhooks, ni firma, ni idempotencia de pago. |
| Cloudinary | Configurado pero **no usado** | Variables en `.env.example`, `cloudinary` no está en `dependencies` |
| CDN | jsDelivr (GSAP) | Solo en `bienvenida.html:73-74`, declarado en la CSP |
| Analytics | **No existe** | Sin GA, Sin Plausible, sin Sentry en el cliente. Cero medición de conversión. |

### 2.3 Flujo crítico trazado

```
catálogo (index/maquillaje/cabello)
  → GET /api/products, /featured, /promociones, /categoria/:slug     [público, optionalAuth]
  → producto (producto.html?id=)
  → GET /api/products/:id                                           [público]
  → carrito   POST/GET/PATCH/DELETE /api/cart                        [authenticate]
  → checkout  POST /api/orders                                       [authenticate]
  → token de checkout + bulkWrite de stock + Order.create + Cart.delete  [transacción]
  → respuesta con whatsappUrl
  → redirección a wa.me (cobro manual)
  → ✗ hueco: sin email de pedido, sin aviso al admin, sin webhook de pago
  → admin   GET/PATCH /api/admin/pedidos                             [authenticate + authorize('admin')]
  → email   ✗ no se envía ninguno en el flujo de pedido
```

### 2.4 Arquitectura de despliegue

Un solo dominio y un solo proceso: Express sirve la API **y** el sitio estático desde `public/`
(`app.js:370`). En Vercel el sitio lo sirve el CDN desde `outputDirectory: public`
(`vercel.json:4`) y la API corre como serverless function en `api/index.js`, que reescribe la
subruta desde la query (`api/index.js:66-70`). La CSP está definida en **dos sitios**:
`app.js:139-152` (Express) y `vercel.json:24` (CDN).

---

## 3. Resultados de build / lint / tests / audit

### 3.1 `npm test` (backend) — PASSA

```
Test Suites: 8 passed, 8 total
Tests:       129 passed, 129 total
Time:        74.016 s
```

| Suite | Cubre |
|---|---|
| `money.test.js` | Aritmética entera, redondeo de descuentos |
| `financial.test.js` | Totales, umbral de envío, snapshot de precio, **carrera por la última unidad**, integridad de importes, ingresos pagados, numeración de pedido, transacciones |
| `auth.test.js` | Registro, login, `/me`, logout |
| `cart-orders.test.js` | Carrito completo, creación de pedido, **autorización cruzada de carritos** |
| `products.test.js` | Catálogo, destacados, promociones, categorías, marcas |
| `security-middleware.test.js` | CSRF, validación, cabeceras |
| `security-flows.test.js` | Flujos de seguridad |
| `env-production.test.js` | Validación de configuración en producción |

### 3.2 `npm audit`

| Ámbito | Resultado |
|---|---|
| `backend` | **`found 0 vulnerabilities`** |
| raíz | **`found 0 vulnerabilities`** |

> **Descartado durante la corrección (D-01).** En la primera pasada `npm audit` en la raíz falló con
> `400 Bad Request — Invalid package tree`. Se investigó y se determinó que era **transitorio**: el
> registry de npm estaba retirando su endpoint `audits/quick`. Reejecutado en la misma rama da 0
> vulnerabilidades, y `npm install --package-lock-only --dry-run` responde `up to date`. El
> `package-lock.json` (lockfileVersion 3, 540 paquetes) está íntegro. **No se modificó.**

### 3.3 Lint / typecheck / formateo — NO EXISTEN

```
$ grep -nE '"(lint|typecheck|tsc|eslint|format)"' package.json backend/package.json
(vacío)
$ ls .eslintrc* eslint.config* tsconfig* .prettierrc*
ls: no se puede acceder a '.eslintrc*': No existe el archivo o el directorio
[...idem para eslint.config*, tsconfig*, .prettierrc*, backend/*]
```

**No hay linter, ni type checker, ni formateador.** El único gate de calidad es `npm test`, que solo
cubre el backend. Esto explica por qué 5 bugs críticos de frontend llegaron a `main`: ningún proceso
podía detectarlos.

### 3.4 CI (`.github/workflows/ci.yml`)

- Se ejecuta en push/PR a `main` y `master`. **No se ejecuta en otras ramas** (la corrección vive en
  `fix/auditoria`, así que sus commits no disparan CI salvo PR).
- `npm ci` → `npm test` → `npm run build:static`.
- **`npm audit` no está en el pipeline.** No hay puerta de seguridad de dependencias.
- El paso `build:static` fija `NODE_ENV: production` con `JWT_SECRET: build-secret-for-static-generation-only`,
  que contiene la subcadena `secret` y sería rechazado por `env.js:185`. **Verificado que no es un
  problema:** `scripts/preparar-estatico.mjs` solo importa `node:fs`, `node:path` y `node:url`
  (líneas 13-15) y nunca carga `config/env.js`. El build estático es independiente de la config.
- El backend no tiene pipeline propio; hereda el de la raíz por el workspace.

### 3.5 Build estático

`npm run build:static` → `scripts/preparar-estatico.mjs` copia 15 páginas, las carpetas `css`, `js`,
`img`, `data`, `admin`, `video` a `public/`. Verificado: falla con código 1 si falta alguna fuente
(líneas 74-77), y limpia `public/` antes de reconstruir (línea 55). Correcto.

---

## 4. Tabla de hallazgos

**Severidad:** Crítica (rompe función, seguridad o cumplimiento) · Alta (pérdida de ingresos, datos o
accesibilidad grave) · Media (degradación clara) · Baja (mantenibilidad, código muerto).

> Los hallazgos marcados `DESCARTADO` se investigaron, se refutaron con evidencia y se conservan para
> que no se vuelvan a reportar. Los marcados `DECISIÓN` fueron resueltos por el propietario.

### 4.1 Críticos

| ID | Severidad | Área | Archivo:línea | Descripción | Evidencia | Impacto en el negocio | Corrección recomendada | Esfuerzo | Estado |
|---|---|---|---|---|---|---|---|---|---|
| C-01 | Crítica | Frontend | `js/admin/pedidos.js:344-349` | `formatearFecha` se llama a sí misma con un `Date` (truthy): recursión infinita | `return formatearFecha(fecha, 'hora')` donde `fecha` es `new Date(...)` | La tabla de pedidos **nunca se renderiza**; el `catch` de `cargarPedidos` muestra siempre "No se pudieron cargar los pedidos" | Importar `formatearFecha` de `js/config.js` y borrar la función local | S | **CORREGIDO** |
| C-02 | Crítica | Frontend | `js/admin/dashboard.js:171-176` | Misma recursión infinita que C-01 | `return formatearFecha(fecha)` | El dashboard **nunca carga**; siempre "Error al cargar el dashboard". Ingresos, pedidos y estados invisibles | Igual que C-01 | S | **CORREGIDO** |
| C-03 | Crítica | Frontend | `js/app.js:505` | Se llama `api.post('/contact', …)` pero el objeto `api` **no tiene método `post`** | `grep -nE "^\s*(post|put|patch)\s*[:(]" js/api.js` → 0 resultados | Formulario de contacto **roto al 100 %**. `TypeError` capturado y reportado como fallo de negocio, así que nadie lo detecta | Usar el helper existente `api.createContact` (`js/api.js:348`) | S | **CORREGIDO** |
| C-04 | Crítica | Frontend | `js/reset-password.js:133,141` | Prefijo `/api` duplicado: la base ya termina en `/api` | `endpoint = '/api/auth/reset-password'` + `js/config.js:56` `` return `${origin}/api` `` | Petición real a `/api/api/auth/reset-password` → 404. **Ningún cliente puede recuperar su contraseña** | Usar los helpers `forgotPassword()` / `resetPassword()` de `js/api.js:286-287` | M | **CORREGIDO** |
| C-05 | Crítica | Frontend | `js/reset-password.js:147-196` | El `catch` es **código muerto** y se lee `data.message` de un sobre que no lo tiene | `js/api.js:26` documenta "nunca lanzan"; el sobre es `{ok, msg, data}` | Un token inválido muestra literalmente `undefined` en un recuadro **verde de éxito** y redirige a `index.html`. El cliente cree que cambió su contraseña | Comprobar `data.ok`, leer `data.msg` / `data.data.message`, eliminar el `try/catch` muerto | M | **CORREGIDO** |
| C-06 | Crítica | Backend | `backend/src/services/emailService.js`, `backend/src/controllers/orderController.js` | **No existe email de confirmación de pedido ni aviso al admin** | `grep -rn "sendOrderEmail" backend/src/` → 0 resultados. `emailService.js` solo exporta `sendPasswordResetEmail` (41) y `sendContactEmail` (48) | El pedido descuenta stock, queda `pendiente`, y si el usuario cierra WhatsApp **nadie se entera**. Stock bloqueado, venta perdida | Plantillas transaccionales al cliente y aviso al admin, envío no bloqueante | M | **CORREGIDO** |
| C-07 | Crítica | Ambos | `index.html:340-343` | Los 4 enlaces legales del footer apuntan a páginas inexistentes | `<a href="terminos.html">`… y `ls terminos.html` → No existe. El texto real vive en modales de `register.html:216-249` | 404 en el punto de conversión. Incumplimiento de la Ley 1581/2012 (SIC) | Apuntar a modales existentes; quitar Envíos y Devoluciones (sin texto) | M | **CORREGIDO** |

### 4.2 Altos

| ID | Severidad | Área | Archivo:línea | Descripción | Evidencia | Impacto | Corrección | Esfuerzo | Estado |
|---|---|---|---|---|---|---|---|---|---|
| A-01 | Alta | Backend | `adminController.js:257` vs `:324-329` | `entregado → reembolsado` no restituye el stock | `transitions.entregado = ['reembolsado']` cae en el `else`, que solo hace `Object.assign` + `save()` | En cosmética un producto devuelto suele ser invendible, pero hoy la decisión **no está escrita en ningún sitio** | Documentar la decisión de negocio (no cambiar código) | S | **DECISIÓN: documentado** |
| A-02 | Alta | Backend | `adminController.js:367-368` | `revenueToday` usa `new Date().setHours(0,0,0,0)` → **hora del servidor**, que en Vercel es UTC | Dos `new Date(new Date().setHours(0,0,0,0))` | El "ingreso del día" cambia a las **19:00 hora Colombia**. Cifras de negocio erróneas 5 horas al día | Calcular con `America/Bogota` + test de frontera | S | **CORREGIDO** |
| A-03 | Alta | Backend | `userController.js:143` vs `validation.js:274-276` | El esquema acepta `activo` explícito "para que un cliente pueda fijar el valor" pero el controlador **lo ignora** y siempre alterna | `user.activo = !user.activo;` | API engañosa: un cliente que manda `{activo:false}` en un usuario ya inactivo lo **activa**. (Verificado: hoy el frontend no manda el campo, así que no explota) | Honrar `req.body.activo` si viene, con test | S | **CORREGIDO** |
| A-04 | Alta | Backend | `userController.js:9,154-176`, `adminController.js:56-68` | El JSDoc dice **"hard delete"** pero el código hace soft delete (`activo = false`) | `* DELETE /api/users/:id -> deleteUser (hard delete)` vs `user.activo = false; await user.save()` | Mantenimiento engañoso: un developer "corrige" el doc y rompe la lógica, o al revés. El mensaje de respuesta dice "Usuario desactivado" (correcto), el doc no | Corregir el JSDoc | S | **CORREGIDO** |
| A-05 | Alta | Backend | `apiError.js:54` | Dos claves distintas con el **mismo valor**: `PASSWORDS_MISMATCH: 'INVALID_RESET_TOKEN'` | `PASSWORDS_MISMATCH: 'INVALID_RESET_TOKEN',` | El cliente que ramifique por `code` recibe `INVALID_RESET_TOKEN` al pedir contraseñas coincidentes, activando la rama equivocada | Valor único por clave | S | **CORREGIDO** |
| A-06 | Alta | Frontend | `js/admin/productos.js:379,389` | `cargarProductoParaEditar(id)` se llama **sin `await`** y sin cancelación | `cargarProductoParaEditar(productoId);` (línea 379) y `async function cargarProductoParaEditar` (389) | Clic en "Editar" A y luego en B: la respuesta de A puede llegar última y rellenar el formulario con A mientras el `productoId` guardado es **B**. Al guardar, `PATCH /admin/productos/B` con datos de A → **corrupción silenciosa del catálogo** (precios, imágenes) | Token de secuencia: solo el último `await` pinta | M | **CORREGIDO** |
| A-07 | Alta | Frontend | `js/mis-pedidos.js:154,302,318,328,332,337,342` | Doble símbolo de moneda: el `$` literal antecede a un valor ya formateado | `` `$${escapeHTML(formatearMonto(pedido?.total))}` `` y `formatearMonto` → `formatearPrecio` → `Intl` que ya devuelve `"$ 58.000"` | El cliente ve **`$ $ 58.000`** en total, subtotal, envío y descuento. Visible en 7 puntos de la página de pedidos | Quitar el `$` literal | S | **CORREGIDO** |
| A-08 | Alta | Frontend | `js/producto.js:165-166,234,240,298` | Cuando el producto no trae `stock`, la variable queda `null` y `Math.min(99, null)` → `0` | `const stock = stockConocido ? Number(producto.stock) \|\| 0 : null;` → `max="${Math.max(1, Math.min(99, stock))}"` | El selector queda **limitado a 1 unidad** aunque haya existencias, y el texto muestra literalmente **"Máximo null unidades disponibles"**. El cliente no puede comprar 2 | Separar el caso "stock desconocido" | S | **CORREGIDO** |
| A-09 | Alta | Frontend | `js/auth.js:99-105` | `mostrarErrorCampo` busca `.campo-error` con `input.parentElement`, pero el `<span>` es hermano del wrapper, no hijo | `const errorSpan = input.parentElement.querySelector('.campo-error');` con `login.html:99-115` | **"Las contraseñas no coinciden" es invisible.** El usuario pulsa Continuar, el foco salta al campo, no pasa nada. Afecta a login, register y reset-password | Usar `input.closest('.campo, .form-grupo')` | S | **CORREGIDO** |
| A-10 | Alta | Frontend | `js/admin/productos.js:430-436` | El `<select>` de `object-position` solo ofrece 5 valores fijos, pero el modelo acepta posiciones relativas (`30% 75%`) | 5 `<option>` fijos vs `js/sanitize.js:32` que valida `center\|top\|bottom\|left\|right [valor]` | Si una imagen tiene `posicion: '30% 75%'`, al abrir y guardar el producto se envía `center`: **el encuadre de la foto se pierde sin aviso** | Incluir la opción de porcentaje / conservar el valor original | M | **CORREGIDO** |
| A-11 | Alta | Ambos | `.carrito-panel` en 17 HTML (p.ej. `index.html:321`) | El panel se oculta solo con `right: -420px`; nunca se toca `aria-hidden` ni `inert` | `css/base.css:707-721` y `js/carrito.js:159-166` (solo `classList.add/remove('abierto')`) | El contenido del carrito (h2, botón cerrar, botón "Finalizar pedido") queda **en el árbol de accesibilidad y en el orden de tabulación** estando 420 px fuera de pantalla. WCAG 1.3.2 y 2.4.3 | `aria-hidden` + `inert` alternados desde `js/carrito.js` | M | **CORREGIDO** |
| A-12 | Alta | Frontend | `auth.css:91-97`, `mi-perfil.css:86-90`, `mis-direcciones.css:227-231`, `contacto.css:49-54`, `base.css:1159-1162`, `admin-categorias.css:38-43`, `admin-productos.css:227-233` | `outline: none` + `box-shadow: 0 0 0 3px rgb(201 123 130 / 15%)` → **contraste 1.16:1** | Calculado con la fórmula de luminancia relativa WCAG: `#f7ebec` sobre `#ffffff` | **WCAG 2.4.7 (AA) falla** en login, registro, reset, perfil, direcciones, contacto y los 6 formularios del admin. En `contacto.css` y `base.css` no hay ni `box-shadow`: sin indicador ninguno | `outline: 2px solid` (11.08:1) o `box-shadow` sin alfa (3.16:1) | S | **CORREGIDO** |
| A-13 | Alta | Frontend | `cabello.html:89,95,101`, `contacto.html:111,117,123`, `login.html:161,166,171`, `maquillaje.html:88,94,100`, `mi-perfil.html:204,209,214`, `mis-direcciones.html:179,184,189`, `mis-pedidos.html:113,119,125`, `producto.html:113,119,125`, `register.html:253,258,263`, `resenas.html:123,129,135`, `reset-password.html:147,152,157`, `admin/dashboard.html:169,174,179` | 33 enlaces sociales solo con SVG, sin nombre accesible (solo `index.html:346,352,358` lo tienen) | `<a href="https://facebook.com/tu-tienda">` + `<svg …>` sin `aria-label` ni `<title>` | **WCAG 4.1.2 y 1.1.1**: el lector de pantalla anuncia la URL del SVG | Añadir `aria-label` | S | **CORREGIDO** |
| A-14 | Alta | Frontend | `mi-perfil.html:57-64` | `id="tab-datos"` y `aria-labelledby="tab-datos"` apuntan **al mismo elemento**, y los `<button role="tab">` no tienen `id` | `<div class="perfil-panel activo" role="tabpanel" id="tab-datos" aria-labelledby="tab-datos">` | Nombre accesible del panel resuelto a sí mismo (circular, inválido). Faltan `aria-controls`, `tabindex` roving y navegación con flechas | IDs separados, `aria-controls`, `tabindex` | M | **CORREGIDO** |
| A-15 | Alta | Frontend | `js/checkout.js:185-187` | `finally { submitButton.disabled = false }` rehabilita el botón **después** de crear el pedido con éxito | `setMessage('Pedido … creado correctamente', 'exito')` y después `submitButton.disabled = false` con el carrito ya vacío | Un segundo clic manda un `Idempotency-Key` **nuevo** (renovado en la línea 171) y recibe `EMPTY_CART`, **borrando el mensaje de éxito** | No rehabilitar tras el éxito | S | **CORREGIDO** |
| A-16 | Alta | Frontend | `producto.html:27-39` | JSON-LD `Product` **estático y falso**: `name: "By Jers Producto"`, **sin `offers.price`**, `availability: InStock` siempre | `grep "ld+json" js/**/*.js` → 0 resultados: nunca se actualiza. La página real puede mostrar "Agotado" (`producto.css:209`) | `Offer` sin `price` es inválido para rich results. Declarar `InStock` con stock 0 es **structured data engañoso**: riesgo de acción manual de Google. `name` genérico duplicado en todas las fichas | Generar el JSON-LD desde el producto real en `js/producto.js` | M | **CORREGIDO** |
| A-17 | Alta | Frontend | `index.html:40-44` | `SearchAction` apunta a `https://byjers.com/buscar?q=…` y **`buscar.html` no existe**; `vercel.json` no lo enruta | `ls buscar.html` → No existe. `vercel.json:11-13` solo mapea `/api/:path*` | Sitelinks Search Box apuntando a un 404 | Eliminar el bloque hasta que exista el buscador | S | **CORREGIDO** |
| A-18 | Alta | Ambos | Las 21 páginas HTML | **Cero `<link rel="canonical">`**, y conviven URLs con y sin `.html` | `grep 'rel="canonical"' *.html` → 0. `sitemap.xml` usa `/maquillaje.html`, `404.html:89-90` usa `/maquillaje`, `js/carrito.js:433` navega a `/checkout`, con `cleanUrls: true` (`vercel.json:14`) | Contenido duplicado: `/maquillaje` y `/maquillaje.html` sirven lo mismo y **compiten por el PageRank**. Impide consolidar las señales de las fichas de producto | `canonical` absoluto en las 21 + unificar la forma de URL | M | **CORREGIDO** |
| A-19 | Alta | Ambos | `sitemap.xml` | Faltan 9 páginas reales (incluida **`/producto.html`**, la de mayor valor SEO) y ningún `<url>` tiene `<lastmod>` | Solo 7 URLs declaradas; `lastmod` ausente | Las fichas de producto —que generan el tráfico de cola larga— no se declaran | Regenerar el sitemap | S | **CORREGIDO** |
| A-20 | Alta | Ambos | `vercel.json:16-45` | No hay regla de `Cache-Control` para `/js/*` | Reglas solo para `/img/` (inmutable, 1 año), `/css/` (7 días) y `*.html`. Nada para `/js/` | Los scripts se revalidan siempre mientras las hojas se cachean 7 días y las imágenes 1 año. Política incoherente | Regla para `/js/` | S | **CORREGIDO** |

### 4.3 Medios

| ID | Severidad | Área | Archivo:línea | Descripción | Impacto | Corrección | Esfuerzo | Estado |
|---|---|---|---|---|---|---|---|---|
| M-01 | Media | Frontend | `checkout.html:4-12` | Única de las 21 páginas **sin `meta description`** y sin Google Fonts | Snippet arbitrario en la página de conversión; checkout renderiza con la tipografía del sistema, distinta al resto del sitio | `meta description` + `<link>` de fuentes | S | **CORREGIDO** |
| M-02 | Media | Frontend | `index.html:114→132` | Salto de jerarquía `h1 → h3` y `h1 → h4`; igual en `mi-perfil.html:51→166` | WCAG 1.3.1: rompe la navegación por encabezados | Convertir los contadores del hero a `<p>` | S | **CORREGIDO** |
| M-03 | Media | Frontend | `producto.html` | **Sin `<h1>` en el HTML** (lo inyecta `js/producto.js:202`) | Sin JS, ni los buscadores ni la red neuronal identifican el título del producto | `<h1>` real de placeholder que el JS reemplaza | S | **CORREGIDO** |
| M-04 | Media | Frontend | Las 21 páginas | **Cero skip link** | WCAG 2.4.1: ~8 paradas de tabulación hasta el contenido en cada página | `<a class="skip-link">` + `id="contenido"` | M | **CORREGIDO** |
| M-05 | Media | Frontend | 19 de 21 páginas | Sin Open Graph / Twitter Card. `og:url` ausente **en las 21**. `og:image` **relativo** (`index.html:14,19`) | Al compartir en WhatsApp (canal principal en Colombia) 19 páginas se ven sin imagen. Las rutas relativas no las resuelven los crawlers sociales | OG/Twitter con URLs absolutas | M | **CORREGIDO** |
| M-06 | Media | Ambos | `robots.txt:1-6` | Solo excluye `/admin/` y `/api/`. No excluye `/mi-perfil`, `/mis-pedidos`, `/mis-direcciones`, `/checkout`, `/reset-password`; ninguna tiene `noindex` | Un crawler sin sesión indexa páginas de área privada con contenido vacío (*thin content*) y puede indexar `reset-password.html?token=` | `Disallow` + `meta robots noindex` | S | **CORREGIDO** |
| M-07 | Media | Frontend | 15 HTML (`index.html:47-48` y 13 más) | 30 scripts **render-blocking síncronos** en `<head>` sin `defer` | 2 round-trips extra en el camino crítico del parseo en 15 de 21 páginas | `defer` (seguro: `loader-boot.js:90-92` se auto-inyecta si no hay body) | S | **CORREGIDO** |
| M-08 | Media | Frontend | ~40 combinaciones en 12 CSS | Contraste < 4.5:1. El peor: `admin-categorias.css:77` a 1.33:1. **`--color-mauve` (`base.css:12`) da 3.16:1 con blanco** y es el color de todos los botones primarios y precios | **WCAG 1.4.3 (AA) falla en 40 sitios**, incluido el sistema de color de marca | Oscurecer `--color-mauve` y `--color-gray-medium` | M | **CORREGIDO** |
| M-09 | Media | Frontend | 22 casos en 9 CSS | Bordes de formulario < 3:1. El peor: `admin-productos.css:180` = 1.00:1, **borde crema sobre fondo crema** | WCAG 1.4.11: en baja visión el formulario del admin es inutilizable | `border` a ≥3:1 | S | **CORREGIDO** |
| M-10 | Media | Frontend | 19 campos `.campo-error` (p.ej. `login.html:89`) | El `<span>` de error no tiene `id` y el input no declara `aria-describedby` | WCAG 3.3.1: el error se anuncia pero **no se asocia al campo** | `id` + `aria-describedby` + `aria-invalid` | M | **CORREGIDO** |
| M-11 | Media | Frontend | `admin/productos.html:206,207,208,229,230` | 5 controles sin `<label>` ni `aria-label` (los únicos del proyecto). `admin/productos.html:203,226` usan `<label>` huérfano | WCAG 1.3.1 y 4.1.2; con `required` en 2 de ellos el usuario no sabe qué es obligatorio | `id` + `<label for>` | S | **CORREGIDO** |
| M-12 | Media | Frontend | `auth.js:277-280` y 7 archivos más | Modales sin trampa de foco ni devolución del foco al cerrar | WCAG 2.4.3: el `Tab` escapa del modal al contenido de fondo | Guardar `activeElement` y restaurarlo | M | **CORREGIDO** |
| M-13 | Media | Frontend | `js/carrito.js:159-166`, `index.html:80` | El botón del carrito no tiene `aria-expanded`/`aria-controls` y **no hay listener de `Escape`**: de teclado se abre y no se cierra | Bloqueo para usuario de teclado en 17 pantallas | `aria-expanded` + `Escape` | S | **CORREGIDO** |
| M-14 | Media | Frontend | `js/admin/usuarios.js:48-55` | El modal de rol **no cierra con `Escape`**, a diferencia de los otros 3 modales del admin, pese a declarar `aria-modal="true"` (`admin/usuarios.html:113`) | Inconsistencia de teclado dentro del mismo panel | Copiar el bloque `keydown` de `admin/pedidos.js:89-94` | S | **CORREGIDO** |
| M-15 | Media | Frontend | `js/carrito.js:110-117,199` | El carrito de invitado persiste solo `{id,nombre,precio,cantidad}`: **descarta `imagen`** | Tras cualquier recarga el carrito de invitado muestra los productos **sin foto**, sin miniatura de respaldo | Incluir `imagen` en los 3 `map` y en `leerLocal` | S | **CORREGIDO** |
| M-16 | Media | Frontend | `js/mis-pedidos.js:398-419` | El array `estados` no incluye `cancelado` ni `reembolsado`, así que `estadoIdx` vale `-1` y la rama de la línea 418 es **inalcanzable** | La línea de tiempo de un pedido cancelado o reembolsado no marca ningún hito | Añadir los 2 estados | S | **CORREGIDO** |
| M-17 | Media | Frontend | `js/admin/productos.js:220-229` | `change` + `input` con debounce disparan **dos** `GET /admin/productos` idénticos, sin secuenciación | Requests duplicados en los filtros del admin (patrón repetido en `usuarios.js:30`, `pedidos.js:65`) | Solo `input` con debounce + secuencia | S | **CORREGIDO** |
| M-18 | Media | Frontend | `js/cabello.js:104-108`, `js/maquillaje.js:105-108` | `mostrarCategoria` es `async` sin `AbortController` ni token de secuencia | Clic rápido entre pestañas: la respuesta lenta pinta la categoría que el usuario ya abandonó | Contador de petición | S | **CORREGIDO** |
| M-19 | Media | Frontend | `js/register.js:188-193` | Los errores de los checkboxes de términos/privacidad se descartan: el input está en `.checkbox-campo`, que no contiene `.campo-error` | El usuario no ve por qué se rechaza el registro | Añadir el `<span class="campo-error">` | S | **CORREGIDO** |
| M-20 | Media | Frontend | `js/mis-direcciones.js:169,220,256,266` | `getElementById` sin null-check, en un archivo que **sí** usa optional chaining en otras líneas (`143`, `146`) | `TypeError` en 4 rutas de la página de direcciones | Guardas `if (!modal) return` | S | **CORREGIDO** |
| M-21 | Media | Frontend | `js/login.js:61-62`, `js/register.js:136-142`, `js/reset-password.js:58,68,78` | Se protege el `addEventListener` con `?.` pero **no** el acceso a `.value` | Un `id` renombrado deja el botón en loading **para siempre** (no hay `try/finally`) | Validar el objeto de inputs al inicio + `try/finally` | M | **CORREGIDO** |
| M-22 | Media | Frontend | `js/index.js:48,51` | **3 peticiones idénticas** a `/api/products/promociones` por carga del home (`rotarPromos`, `cargarPromociones`, `cargarBannerPromo`) + 2 para contadores | Desperdicio de cuota de rate limit en la página más visitada | Una llamada compartida | S | **CORREGIDO** |
| M-23 | Media | Frontend | `js/promos-rotativas.js:55-57` | No comprueba `respuesta.ok` | Un 500 produce `[]` y **oculta la cinta de ofertas** como si no hubiera ninguna, sin log | Comprobar `ok` / usar `handleApiError` | S | **CORREGIDO** |
| M-24 | Media | Frontend | `js/checkout.js:133-139` | `api.getMe()` en cada `change` del selector de direcciones | Request extra: las direcciones ya están en `user.direcciones` (línea 130) | Usar el array local | S | **CORREGIDO** |
| M-25 | Media | Frontend | `js/api.js:67,79` | La bandera `redirigiendo` nunca vuelve a `false` | Si la redirección se cancela, `irAlLogin()` queda inerte el resto de la sesión | Restablecer en el `catch` o usar `location.replace` | S | **CORREGIDO** |
| M-26 | Media | Frontend | `mis-pedidos.css`, `mi-perfil.css`, `auth.css`, `admin.css` | 4 hojas con animaciones `infinite` y **cero** bloque `prefers-reduced-motion` local; dependen del bloque global de `base.css:1592-1605` | Frágil: si `base.css` no carga, 4 hojas con animación infinita ignoran la preferencia del usuario | Bloque local o `css/motion.css` | S | **CORREGIDO** |
| M-27 | Media | Frontend | `admin-categorias.css:211-221`, `admin-productos.css:284-294` | `.modal` redefine `align-items: center`, **reintroduciendo el bug que `base.css:812-814` documenta como corregido** | En iOS la parte superior del formulario de productos (el más largo, `admin/productos.html:133-274`) queda **inalcanzable por scroll** | Heredar la definición de `base.css` | S | **CORREGIDO** |
| M-28 | Media | Frontend | `base.css:816-834`, `auth.css:390-412`, `admin-categorias.css:211`, `admin-productos.css:284` | `.modal`, `.modal-contenido` y `.modal-cerrar` definidos **4 veces** con valores contradictorios (`.modal-cerrar` en admin **no tiene `width`/`height`** → cae a ~16×23 px) | 4 estilos distintos para el mismo componente; el botón de cierre del admin es diminuto | Una sola definición en `base.css` | M | **CORREGIDO** |
| M-29 | Media | Frontend | `admin-categorias.css` vs `admin-productos.css` | **86.5 % idénticos** (verificado con `SequenceMatcher`). `.tabla-imagen` tiene 3 tamaños distintos: 50 px, 50 px y **40 px** en `admin-marcas.css:1-6` | El logo de marca se ve a 40 px mientras el de categoría a 50 px | Extraer a `css/admin-base.css` | M | **CORREGIDO** |
| M-30 | Media | Frontend | `.carrito-panel` en 17 HTML, `nav.menu` en 12, `footer.site-footer` en 19 (**6 variantes**) | Duplicación manual de bloques. Los enlaces legales solo existen en `index.html:339-344`; los `aria-label` de redes solo en `index.html`; el copyright tiene 2 versiones; `admin/pedidos.html:162-164` es el único footer sin redes | Cada fix hay que replicarlo 17-19 veces (ya se ve en A-13). Mantenimiento inviable | Web components o paso de build | L | **PENDIENTE (documentado)** |
| M-31 | Media | Frontend | `img/demo/hero-poster.png` (145 KB), `img/hero-secuencia/` (153 WebP, **17 MB**) | El poster del vídeo de fondo es un PNG de 145 KB probable LCP en 15 páginas, y 17 MB de frames que solo usa `bienvenida.html` | LCP penalizado; despliegue de 17 MB | `hero-poster.webp` + mover los frames fuera del build | M | **PENDIENTE (documentado)** |
| M-32 | Media | Frontend | `js/api.js:353,362,367,378,254` | 5 helpers exportados sin ningún uso: `getDashboard`, `checkCategoryProducts`, `checkBrandProducts`, `getCsrfToken`, `getUser` | Código muerto que sugiere capacidades inexistentes | Usarlos o borrarlos | S | **CORREGIDO** |
| M-33 | Media | Frontend | 5 archivos: `mis-direcciones.js:454`, `admin/categorias.js:326`, `admin/marcas.js:308`, `admin/pedidos.js:351`, `admin/productos.js:586` | **5 copias idénticas** de `mostrarToast` (25 líneas con `cssText` inline) | Cualquier ajuste de estilo hay que hacerlo 5 veces | Extraer a `js/ui.js` | S | **CORREGIDO** |
| M-34 | Media | Frontend | `admin/usuarios.js:220-226`, `admin/productos.js:609-615` | 2 copias de `debounce`; 2 copias de los catálogos de estado de pedido (`admin/dashboard.js:7-35`, `admin/pedidos.js:10-43`); `@keyframes fadeIn` con **dos cuerpos distintos** (`index.css:164` vs `producto.css:341`) | La misma animación se comporta distinto según la página | Módulos compartidos | S | **CORREGIDO** |
| M-35 | Media | Frontend | `js/carrito.js:322-336` | La fusión usa `Math.max(item.cantidad, enServidor.cantidad)` con `item.cantidad` coming de `localStorage` | El cliente puede **inflar su carrito a 99 unidades** de cualquier producto con stock. (Verificado: el backend protege con `cartController.js:80,136` y `validation.js:168`, así que no hay manipulación de precio ni sobreventa) | Tomar siempre la cantidad del servidor | S | **CORREGIDO** |
| M-36 | Media | Frontend | `js/carrito.js:105,149` | `desdeApi` no acota `cantidad` (los otros 3 caminos usan `Math.max(1, Math.min(99, …))`) ni escapa el valor al pintarlo | Hoy el backend limita a 99, así que no es explotable; si se relajara, sería XSS | Acotar y escapar | S | **CORREGIDO** |
| M-37 | Media | Frontend | `js/admin/productos.js:272-279` | `event.target.matches('.btn-eliminar-imagen')` en vez de `closest()` | Si el botón tiene un hijo, el clic **no borra nada** | `closest()` | S | **CORREGIDO** |
| M-38 | Media | Frontend | `js/admin/pedidos.js:204-205` | `$('pedidoEstado').value = normalizarEstado(...) \|\| 'pendiente'` sin verificar que la `<option>` exista | Si falta la opción, `value` queda `''` en silencio y el `PATCH` manda un estado inválido | Validar contra `select.options` | S | **CORREGIDO** |
| M-39 | Media | Frontend | `js/index.js:56-66` | `contadorProductos.textContent` sin null-check, y `if (productosRes.ok && productosRes.data?.total)` falla con `total: 0` (falsy) | Un catálogo vacío deja el **"+300" falso** del HTML; un cambio de markup lanza `TypeError` absorbido por un `catch` silencioso | Null-checks + `Number.isFinite` | S | **CORREGIDO** |
| M-40 | Media | Frontend | `js/bienvenida.js:100-102,246-247,366-370` | Si falta `#product-name`, el `catch` externo llama a `hideLoader()`, que a su vez lanza un **segundo `TypeError` dentro del `catch`** | Splash screen eterno en `bienvenida.html` | Validar el mapa de `elements` | S | **CORREGIDO** |

### 4.4 Bajos

| ID | Severidad | Área | Archivo:línea | Descripción | Impacto | Estado |
|---|---|---|---|---|---|---|
| B-01 | Baja | Frontend | `js/app.js:137` | `enlace.getAttribute('href').split('#')` sin optional chaining | `TypeError` si un `.menuitem` no tiene `href` | **CORREGIDO** |
| B-02 | Baja | Frontend | `js/app.js:58,133-144` | `obtenerPaginaActual()` devuelve `checkout` con `cleanUrls`, pero los `href` llevan `.html` | Se pierde el resaltado de sección activa en `/checkout` | **CORREGIDO** |
| B-03 | Baja | Frontend | `js/admin/categorias.js:306`, `admin/marcas.js:288`, `admin/productos.js:566` | `apiErrorFromResponse(response, 'mensaje')` con 2 argumentos; la función (`js/api.js:387`) acepta 1 | El mensaje por defecto nunca se ve | **CORREGIDO** |
| B-04 | Baja | Frontend | `js/mis-pedidos.js:332` | `Number(pedido?.costoEnvio) === 0` → `Number(null) === 0` | Un pedido sin `costoEnvio` se muestra como **"Envío: Gratis"** | **CORREGIDO** |
| B-05 | Baja | Frontend | `js/producto.js:170-179` vs `:159` | La miniatura 0 se marca activa aunque la principal sea otra | El indicador de galería miente | **CORREGIDO** |
| B-06 | Baja | Frontend | `js/producto.js:372` | Compara `nuevaImg` (relativa, de `data-img`) con `imgPrincipal.src` (absoluta) | Siempre distintas → la imagen se reasigna con parpadeo en cada clic | **CORREGIDO** |
| B-07 | Baja | Frontend | `js/producto.js:386-391` | Listener `keydown` que replica lo que `<button>` ya hace de forma nativa | Código muerto con `preventDefault` que cancela el click nativo | **CORREGIDO** |
| B-08 | Baja | Frontend | `js/carrito.js:95` | `const avisar = () => pintar()` | Alias sin sentido | **CORREGIDO** |
| B-09 | Baja | Frontend | `js/carrito.js:349` | `fusionados: local.length` cuenta también los saltados por `continue` y los descartados; ningún llamador lo usa | Recuento engañoso | **CORREGIDO** |
| B-10 | Baja | Frontend | `js/cabello.js:12`, `js/maquillaje.js:12` | `demoActivado` se importa y nunca se usa | Import muerto | **CORREGIDO** |
| B-11 | Baja | Frontend | `js/mis-direcciones.js:253-258` | El parámetro `alias` se recibe y se descarta | `data-alias` del HTML no se usa | **CORREGIDO** |
| B-12 | Baja | Frontend | `js/mis-direcciones.js:500-507` y 4 archivos más | Inyecta `@keyframes slideUp` en `<head>` a nivel de módulo, duplicado 5 veces | CSS en JS, 5 copias | **CORREGIDO** |
| B-13 | Baja | Frontend | `js/fondo-textura.js:160` | Listener `resize` sin throttle que hace `querySelector` en cada evento | trabajo de más en cada redimensionado | **CORREGIDO** |
| B-14 | Baja | Frontend | `js/fondo-textura.js:128`, `js/app.js:565-567` | `setTimeout` sin guardar ni limpiar | Temporizadores huérfanos | **CORREGIDO** |
| B-15 | Baja | Frontend | `js/bienvenida.js:207,358` | 2 promesas flotantes sin `.catch` | `unhandledrejection` en consola | **CORREGIDO** |
| B-16 | Baja | Frontend | `js/bienvenida.js:178` | `const frames` **shadowea** la variable de módulo `let frames = []` (línea 40) | Trampa de mantenimiento | **CORREGIDO** |
| B-17 | Baja | Frontend | `js/bienvenida.js:38` | Se consulta `motionPreference.matches` pero nunca se registra `change` | La animación de 153 frames no se detiene si la preferencia cambia a mitad de página | **CORREGIDO** |
| B-18 | Baja | Frontend | `js/login.js:96`, `js/register.js:210` | `console.error('Error login:', response)` vuelca el perfil completo (email, teléfono, direcciones) | **PII en la consola de un sitio público** | **CORREGIDO** |
| B-19 | Baja | Frontend | `js/admin/dashboard.js:93-99` | `marcarCargando()` definida y **nunca llamada** (0 referencias) | El estado de carga prometido en el comentario no existe | **CORREGIDO** |
| B-20 | Baja | Frontend | `js/mis-pedidos.js:52-63` | `mostrarSinSesion()` con 2 `getElementById` sin null-check y **0 llamadas** | Función muerta que explotaría con `TypeError` si se resucitara | **CORREGIDO** |
| B-21 | Baja | Frontend | `js/admin/pedidos.js:370-379` | `mostrarError()` muerta (0 llamadas) | Código muerto | **CORREGIDO** |
| B-22 | Baja | Frontend | `js/carrito.js:417-434` | Listeners ligados a `.carrito-lista` presentes en el instante del `iniciarCarrito()` | Un panel inyectado después queda inerte | **CORREGIDO** |
| B-23 | Baja | Frontend | `js/auth.js:24-26,195-202,207-214` | Bloques JSDoc huérfanos de funciones que ya no están en el archivo | Documentación que confunde sobre qué mantener | **CORREGIDO** |
| B-24 | Baja | Frontend | `admin/productos.html:124,126`, `admin/usuarios.html:104,106` | 4 botones de paginación sin `type` | Riesgo de submit implícito si alguien los mete en un `<form>` | **CORREGIDO** |
| B-25 | Baja | Frontend | `admin/categorias.css:1-6` / `admin-marcas.css:1-6` | `.tabla-imagen` con 3 tamaños distintos | Inconsistencia visual (ver M-29) | **CORREGIDO** |
| B-26 | Baja | Frontend | `cabello.html:59-63`, `maquillaje.html:58-62`, `mis-pedidos.html:57-65` | Controles de filtro/tab sin `role`/`aria-selected`/`aria-pressed` | WCAG 4.1.2: no se anuncia qué filtro está activo | **CORREGIDO** |
| B-27 | Baja | Frontend | `js/producto.js:411-427`, `js/mi-perfil.js:97-123` | Patrón ARIA de tabs incompleto (sin `aria-controls`, `tabindex` roving ni flechas) | Lectores de pantalla sin contexto de pestaña | **CORREGIDO** |
| B-28 | Baja | Frontend | `js/app.js:710-791` | `.chatbot-mensajes` sin `role="log"`/`aria-live`; el `<aside>` sin `role="dialog"`; `Escape` no lo cierra | Las respuestas del bot no se anuncian | **CORREGIDO** |
| B-29 | Baja | Backend | `productController.js:60-62` y `adminController.js:168-175` | Búsqueda admin con `$regex` + `$options:'i'` sobre 2-3 campos (con `escapeRegex`, correcto frente a ReDoS de metacaracteres) pero **sin índice utilizable** | COLLSCAN en cada búsqueda del admin a partir de unos miles de usuarios | **PENDIENTE (documentado)** |
| B-30 | Baja | Backend | `adminController.js:347-348` | `User.countDocuments()` y `Product.countDocuments()` **sin filtro `activo`** | El dashboard cuenta productos y usuarios desactivados como si existieran | **CORREGIDO** |
| B-31 | Baja | Backend | `Order.js:153` | Sufijo del número de pedido con `Math.random().toString(36)` | Colisión teóricamente posible; hay test que garantiza los 6 caracteres | **PENDIENTE (aceptado)** |
| B-32 | Baja | Backend | Todo el backend | **No hay audit log** de acciones administrativas (quién cambió qué y cuándo) | Sin trazabilidad para auditoría ni investigación de incidentes | **PENDIENTE (documentado)** |
| B-33 | Baja | Backend | `authController.js:106,130,177-179,214-219` | Sin 2FA, sin lista de contraseñas comprometidas, solo `min(8)` | Un usuario que reutilice una contraseña filtrada queda expuesto | **PENDIENTE (documentado)** |
| B-34 | Baja | Ambos | Todo el proyecto | **No hay `docker`/`Dockerfile`** ni `.nvmrc`; `engines.node` es `>=20` sin fijar | Versiones de Node variables entre entornos | **PENDIENTE (documentado)** |
| B-35 | Baja | Ambos | Los 13 HTML con redes sociales | `href="https://facebook.com/tu-tienda"` (y Twitter, Instagram) | **Placeholders de marca** en producción | **PENDIENTE (decisión de marca, no tocar)** |

### 4.5 Hallazgos nuevos descubiertos durante la corrección

| ID | Severidad | Área | Archivo:línea | Descripción | Estado |
|---|---|---|---|---|---|
| N-01 | Alta | Ambos | `README.md:34,78` vs `backend/.env:1` vs `js/config.js:53-55` | **Conflicto de puertos en 3 sitios**: README dice 3000, `.env` dice `PORT=3001`, y `config.js` manda a `localhost:3001` si la página está en `:3000` — lo que **rompe `npm start`**, que sirve sitio y API en el mismo puerto. El propio docblock de `config.js:6-15` dice que ya no debe haber puertos escritos | **CORREGIDO** |
| N-02 | Media | Ambos | `README.md:45,61,116` | El README dice **"127 tests"** y **"7 suites"**; la realidad es **129 tests y 8 suites** | **CORREGIDO** |
| N-03 | Media | Frontend | `index.html:346,352,358` y 12 HTML más | Los enlaces sociales apuntan a `tu-tienda` (placeholder). Sin datos de empresa (NIT, razón social, dirección) en ningún footer | **PENDIENTE (decisión de marca)** |
| N-04 | Media | Frontend | `bienvenida.html` | Página **no enlazada desde ningún sitio** del proyecto | **PENDIENTE (documentado)** |
| N-05 | Baja | Ambos | `.github/workflows/ci.yml:1-5` | El CI solo corre en `main`/`master`. `feature/interactividad-video` y `fix/auditoria` **nunca disparan CI** | **PENDIENTE (documentado)** |
| N-06 | Baja | Backend | `userController.js:139-141` | `LastAdmin` es **código muerto**: el guard `activeAdminCount(user._id) === 0` no puede cumplirse. Para llegar al endpoint el actor es obligatoriamente admin **activo** (`authenticate` rechaza cuentas inactivas, `authorize('admin')` exige el rol). Si el objetivo es el actor, salta antes `SELF_DEACTIVATE`; si es otro, el actor sigue contando como admin activo, luego el conteo es ≥ 1. La garantía real la aporta `SELF_DEACTIVATE` | **PENDIENTE (documentado, sin tocar por seguridad)** |
| N-08 | Baja | Frontend | `admin/categorias.html:156`, `admin/marcas.html:165`, `admin/usuarios.html:139` | El panel del carrito está en el HTML de estas 3 páginas del admin **pero no hay ningún botón que lo abra** (`carrito-icono` = 0 ocurrencias): es markup muerto. `admin/pedidos.html` no lo tiene, así que el panel sí es inconsistente dentro del mismo panel | **PENDIENTE (documentado; quitar el markup o añadir el botón es decisión del dueño)** |
| N-07 | Media | Ambos | `public/` en `.gitignore` ausente | **`public/` está versionado en git** (249 archivos) pese a ser artefacto de build: el README lo marca "no editar" y `.vercelignore:6` lo excluye del build de Vercel, que lo regenera desde el fuente. Quien edite `public/` a mano pierde el cambio en el siguiente `npm start`, y un merge puede dejar el sitio servido desfasado del código | **PENDIENTE (decisión: ignorar la carpeta o sacarla del control de versiones)** |

### 4.6 Descartados (falsos positivos, con evidencia)

| ID | Afirmación | Por qué se descarta |
|---|---|---|
| D-01 | `npm audit` de la raíz falla con "Invalid package tree" | **Transitorio.** El registry estaba retirando el endpoint `audits/quick`. Reejecutado: `found 0 vulnerabilities`. `npm install --package-lock-only --dry-run` → `up to date`. El lock (v3, 540 paquetes) está íntegro. **No se modificó nada** |
| D-02 | Los modales legales de `register.html` no abren (no hay handler `data-modal` en esa página) | **Falso positivo.** `js/register.js:28` llama `inicializarAuthComun()` → `js/auth.js:298` llama `inicializarModales()`, que usa delegación en `document` (`auth.js:242-245`). Funcionan. Sí es cierto que `inicializarModales()` **no** se ejecuta en `index.html` (relevante para C-07) |
| D-03 | El CI falla en `build:static` por usar un `JWT_SECRET` que contiene "secret" | **Falso positivo.** `scripts/preparar-estatico.mjs` solo importa `node:fs`, `node:path` y `node:url` (líneas 13-15); nunca carga `config/env.js`, así que la validación de producción no se ejecuta |
| D-04 | Los 17 MB de `img/hero-secuencia/` se pueden excluir del build | **Falso positivo.** `js/bienvenida.js:6` los usa en el scrollytelling (`carpetaFrames: 'img/hero-secuencia'`). Excluirlos rompe `bienvenida.html`. Pasa a M-31 como recomendación |
| D-05 | Un admin puede marcar como pagado un pedido cancelado | **Falso positivo.** `adminController.js:264` bloquea precisamente eso y `financial.test.js:371` lo cubre. No hay bug |

---

## 5. Detalle de los hallazgos críticos y altos corregidos

> Los hallazgos de esta sección se documentan con el código **problemático** y la **solución
> propuesta**. Por política de esta corrección, **ninguna de estas correcciones se aplica desde este
> documento**: están todas implementadas en la rama `fix/auditoria` con su commit correspondiente.

### C-01 / C-02 — Recursión infinita en el panel de administración

**Código problemático** (`js/admin/pedidos.js:344-349` y `js/admin/dashboard.js:171-176`,
idénticos salvo el segundo argumento):

```js
function formatearFecha(fechaStr) {
    if (!fechaStr) return 'N/A';
    const fecha = new Date(fechaStr);
    if (Number.isNaN(fecha.getTime())) return 'N/A';
    return formatearFecha(fecha, 'hora');   // ← se llama a SÍ MISMA con un Date (truthy)
}
```

`new Date(fecha)` donde `fecha` ya es un `Date` es válido, así que la función vuelve a entrar sin
tope. El `catch` de `cargarPedidos` (`js/admin/pedidos.js:134`) captura el `RangeError` y muestra
"No se pudieron cargar los pedidos", **aunque la API funcione**.

**Solución propuesta (aplicada)**: borrar la función local e importar la de `js/config.js`, que ya
valida `Invalid Date` y devuelve `'—'`:

```js
import { formatearPrecio, formatearFecha as fmtFecha } from '../../js/config.js';
```

### C-03 — El formulario de contacto llama a una función inexistente

**Código problemático** (`js/app.js:504-506`):

```js
const { api } = await import('./apiClient.js');
const response = await api.post('/contact', { nombre, telefono, email: correo, mensaje: texto, website });
```

Verificado: el objeto `api` de `js/api.js` no tiene `post` (`grep` → 0 resultados). El `TypeError` cae
en el `catch` de la línea 509 y se reporta como "No se pudo enviar el mensaje", indistinguible de un
fallo de negocio real.

**Solución propuesta (aplicada)**: usar el helper que ya existe con el payload idéntico
(`js/api.js:348`, y el esquema Zod `schemas.contact` en `validation.js:242-248`):

```js
const response = await api.createContact({ nombre, telefono, email: correo, mensaje: texto, website });
```

### C-04 / C-05 — Recuperación de contraseña: URL rota y errores mostrados como éxito

**Código problemático** (`js/reset-password.js:129-150`):

```js
let endpoint, body;
if (token) {
    endpoint = '/api/auth/reset-password';   // ← prefijo /api duplicado
} else {
    endpoint = '/api/auth/forgot-password';
}
const data = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body) });
mostrarMensajeGlobal(form, data.message, 'exito');   // ← data.message es siempre undefined
```

`js/config.js:56` ya devuelve una base terminada en `/api`, así que la petición real va a
`/api/api/auth/reset-password`. Y el `catch` de las líneas 167-196 es inalcanzable porque
`js/api.js:26` documenta que el cliente **nunca lanza excepciones**; además se lee `data.message`
de un sobre `{ok, msg, data}`.

**Solución propuesta (aplicada)**: delegar en los helpers de `js/api.js:286-287` y comprobar `ok`:

```js
const response = token
    ? await api.resetPassword({ token, password, confirmPassword })
    : await api.forgotPassword(email);
if (!response.ok) { /* mensaje de error, no de éxito */ return; }
```

### C-06 — No existe email de confirmación de pedido

**Evidencia**: `grep -rn "sendOrderEmail" backend/src/` → 0 resultados. `emailService.js` solo
exporta `sendPasswordResetEmail` (línea 41) y `sendContactEmail` (línea 48). `orderController.js`
termina en `res.status(201).json({...})` (línea 260) sin ninguna notificación.

**Solución propuesta (aplicada)**: dos plantillas en `emailService.js` siguiendo el patrón de
`sendContactEmail` (escapeo con `escapeHtml`, `normalizeHeader` en los subjects), disparadas desde
`orderController.js` **fuera** de la transacción y sin bloquear la respuesta, envueltas en un
`try/catch` que solo registra. Al ser `sendEmail` un no-op sin `SMTP_HOST`
(`emailService.js:36`) y solo exigido en producción (`env.js:177`), los tests no se ven afectados.

### A-02 — Ingresos del día calculados en UTC

**Código problemático** (`adminController.js:367-368`):

```js
createdAt: {
    $gte: new Date(new Date().setHours(0, 0, 0, 0)),
    $lt:  new Date(new Date().setHours(0, 0, 0, 0) + 24 * 60 * 60 * 1000),
}
```

`setHours` usa la zona horaria **del servidor**, que en Vercel es UTC. Bogotá es UTC-5, así que el
"día" del negocio cambia a las 7:00 p. m.

**Solución propuesta (aplicada)**: calcular el inicio del día en `America/Bogota` y comparar contra
UTC, con un test de frontera que fije una hora donde ambas fechas difieren.

### A-06 — Carrera al editar un producto

**Código problemático** (`js/admin/productos.js:375-379` y `:389`):

```js
if (productoId) {
    document.getElementById('productoId').value = productoId;   // síncrono
    cargarProductoParaEditar(productoId);                        // async, sin await
}
```

**Solución propuesta (aplicada)**: contador de secuencia; cada invocación toma su número y, tras
cada `await`, aborta si ya no es la última.

---

## 6. Sospechas por verificar (no confirmadas con evidencia)

| # | Sospecha | Por qué no se pudo confirmar |
|---|---|---|
| S-01 | La CSP de `vercel.json:24` (`connect-src 'self'`) y la de `app.js:139-152` divergen; la del CDN no incluye `API_ORIGIN` ni los orígenes de frontend | Requiere un despliegue real y una petición desde el navegador. `js/config.js:53-55` lo hacía más probable; se resolvió quitando el caso especial de puerto (N-01) |
| S-02 | `financial.test.js:450` ("pedidos del 31 y del 1 no se mezclan en el ingreso del día") puede depender de la zona horaria del runner | Requiere ejecutar el suite en dos zonas horarias. Al corregir A-02 el test se ajustó a Colombia de forma explícita, lo que reduce el riesgo |
| S-03 | El pool de MongoDB (`maxPoolSize: 5`, `db.js:30`) puede ser insuficiente en Vercel con varias instancias serverless | Requiere métricas de producción |
| S-04 | `rediss://` y Upstash pueden no ser compatibles con el `eval` de Lua de `redisRateLimitStore.js:19-35` | Requiere una instancia real de Redis. El fallback a memoria está implemented y documentado |
| S-05 | El número de pedido (`Order.js:153`) podría colisionar con suficiente volumen | Hay test que garantiza los 6 caracteres, pero la probabilidad acumulada no está medida |
| S-06 | `admin/productos.html:230` y `js/admin/productos.js` podrían no enviar nunca los ingredientes si el `FormData` se arma por índice fijo | Requiere trazar el flujo completo del formulario en el navegador |

---

## 7. Plan de corrección (orden y dependencias)

| Ola | Contenido | Depende de |
|---|---|---|
| **Wave 0** | Rama `fix/auditoria`, este informe | — |
| **Wave 1** | C-01, C-02, C-03, C-04, C-05, C-06, C-07 | — |
| **Wave 2** | A-02, A-03, A-04, A-05 (+ test de zona horaria) | Wave 1 |
| **Wave 3** | A-06, A-07, A-08, A-09, A-10, A-11, A-12, A-13, A-14, A-15 | Wave 1 |
| **Wave 4** | A-16, A-17, A-18, A-19, A-20, M-01, M-02, M-03, M-04, M-05, M-06, M-07 | Wave 3 |
| **Wave 5** | M-08 a M-40 (contraste, ARIA, null-checks, código muerto) | Wave 4 |
| **Wave 6** | B-01 a B-28 (limpieza) | Wave 5 |
| **Verificación** | Suite completa, `npm audit` en ambos ámbitos, revisión manual de los 8 flujos críticos | todas |

**Dependencias no obvias:**
- A-16 (JSON-LD) necesita el objeto de producto ya cargado, así que va después de C-01/C-02.
- M-04 (skip link) necesita un `id` de destino en cada `<main>`; se hace junto a M-03.
- A-11 (carrito) toca los mismos 17 HTML que A-13 (redes) y M-05 (OG): se agrupan en un commit.
- A-12 (contraste de foco) y M-08/M-09 (contraste) se pueden hacer juntos, pero A-12 es independiente
  porque cambia `:focus`, no los tokens de color.
- C-07 (footer legal) requiere que `inicializarModales()` se ejecute en `index.html`, que es un
  cambio de cableado en `js/index.js`.

---

## 8. Lo que está bien hecho

Esto merece preservarse en cualquier refactorización:

1. **JWT en cookie `HttpOnly`, nunca en web storage.** Verificado con grep en los 33 JS: no hay
   `localStorage`/`sessionStorage` con token. Solo el carrito de invitado y una ruta de retorno.
2. **CSRF double-submit firmado con HMAC** (`security.js:15-32`), con comparación en tiempo constante
   (`security.js:19-23`) y clave derivada del secreto JWT.
3. **`originGuard` en dos capas** (`security.js:111-131`): `sec-fetch-site: cross-site` primero, luego
   `Origin`/`Referer` contra la lista y contra el propio host. Y `Content-Type: application/json`
   obligatorio en mutaciones (`security.js:83-86`), que es un CSRF gate de facto.
4. **`services/money.js` es un módulo de verdad.** Enteros, `Number.isSafeInteger` en cada paso,
   redondeo half-up explícito del porcentaje explicados por qué se divide al final y no al principio.
5. **Enteros en tres capas de validación**: Zod (`minorAmount`), modelo Mongoose (validadores
   `isMinorAmount`) y servicios. Un decimal no llega ni a la base de datos, y hay test de ello
   (`financial.test.js:106-163`).
6. **Precios recalculados siempre en el servidor.** `addToCart` solo acepta `{productoId, cantidad}`:
   el `data-precio` del DOM **no es manipulable**. `createOrder` vuelve a leer el precio de la BD
   (`orderController.js:109`).
7. **Idempotencia de compra bien resuelta**, incluida la trampa de Mongo: un índice `partial` en vez
   de `sparse`, con el motivo escrito en `Order.js:177-191`.
8. **Token de checkout con TTL** (`orderController.js:142-165`) que impide que dos clics
   simultáneos pasen los dos, con compensación explícita solo cuando no hay réplica set
   (`orderController.js:211-231`).
9. **`transaction.js` documenta por qué no usa `connection.transaction()`**, con la evidencia
   empírica de que no propaga la sesión, y degrada de forma **explícita y visible** cuando el
   despliegue no admite transacciones, en vez de fingir éxito.
10. **`tokenVersion` para revocación de sesiones** (`User.js:93`, `auth.js:66-68`), incrementado en
    logout, cambio de contraseña y reset.
11. **Anti enumeración de usuarios** en `forgotPassword` (`authController.js:341-365`): siempre 200.
12. **Protección contra el último admin** (`userController.js:38-42,109-111,139-141,168-170`) con una
    cola de mutaciones serializadas (`:25-36`) para que dos admins no se quiten el rol a la vez.
13. **`js/sanitize.js` escapa de verdad** (5 caracteres, incluida `"`) y `safeAssetUrl` /
    `safeExternalUrl` usan lista blanca de protocolos y rechazan `//evil.com`. En 63 `innerHTML`, 61
    interpolan con `escapeHTML`.
14. **`sendEmail` es un no-op sin `SMTP_HOST`**, lo que hace que los tests no dependan de SMTP.
15. **`app.js` degrada con elegancia**: con Mongo caído, el sitio estático se sigue sirviendo y la API
    responde 503 con un código concreto, en vez de un 500 opaco.
16. **`api/index.js` convierte un fallo de import en un 503 accionable**, con una lista de "pistas"
    que traduce el mensaje técnico a la variable de entorno concreta que revisar.
17. **Un sobre de error único** (`apiError.js`) que hace auditable el contrato leyendo un archivo.
18. **Tests de concurrencia reales** sobre una réplica set de verdad: "dos usuarios compitiendo por la
    última unidad: el stock nunca queda negativo" y "un fallo a mitad del checkout no deja stock
    descontado".
19. **`prepare-static` falla ruidosamente** si falta un archivo fuente (`:74-77`) en vez de publicar un
    sitio incompleto.
20. **`.gitignore` y `.vercelignore` están bien hechos**: `.env` nunca se ha commiteado
    (`git log --all -- backend/.env` → vacío) y el `.env` local tiene permisos `600`.

---

## 9. Cobertura

### 9.1 Revisado por completo

**Backend (37 de 37 archivos):** `app.js`, `instrument.js`, `config/db.js`, `config/env.js`,
`middleware/apiError.js`, `middleware/auth.js`, `middleware/errorHandler.js`,
`middleware/index.js`, `middleware/redisRateLimitStore.js`, `middleware/security.js`,
`middleware/validation.js`, `models/Brand.js`, `models/Cart.js`, `models/Category.js`,
`models/Contact.js`, `models/Order.js`, `models/Product.js`, `models/User.js`, `models/index.js`,
`routes/admin.js`, `routes/auth.js`, `routes/cart.js`, `routes/contact.js`, `routes/index.js`,
`routes/orders.js`, `routes/products.js`, `routes/users.js`, `controllers/adminController.js`,
`controllers/authController.js`, `controllers/cartController.js`,
`controllers/contactController.js`, `controllers/orderController.js`,
`controllers/productController.js`, `controllers/userController.js`, `services/emailService.js`,
`services/money.js`, `services/transaction.js`, `seeds/seed.js`.

**Tests (8 suites leídas íntegras):** `auth`, `cart-orders`, `env-production`, `financial`, `money`,
`products`, `security-flows`, `security-middleware`, `run.js`, `setup.js`.

**Frontend — JS (33 de 33):** `app.js`, `api.js`, `apiClient.js`, `auth.js`, `bienvenida.js`,
`cabello.js`, `carrito.js`, `checkout.js`, `config.js`, `contacto.js`, `estados.js`,
`fallbackCatalog.js`, `fondo-textura.js`, `index.js`, `loader-boot.js`, `login.js`, `maquillaje.js`,
`mi-perfil.js`, `mis-direcciones.js`, `mis-pedidos.js`, `producto.js`, `promos-rotativas.js`,
`register.js`, `resenas.js`, `reset-password.js`, `rutas.js`, `sanitize.js`, y los 6 de `js/admin/`.

**Frontend — HTML (21 de 21):** los 15 de raíz + los 6 de `admin/`.

**Frontend — CSS (18 de 18):** todos los de `css/`.

**Infraestructura:** `package.json` (raíz y `backend`), `package-lock.json`, `.gitignore`,
`.vercelignore`, `vercel.json`, `.github/workflows/ci.yml`, `scripts/preparar-estatico.mjs`,
`api/index.js`, `README.md`, `API.md`, `backend/README.md`, `backend/.env.example`,
`backend/jest.config.js`, `robots.txt`, `sitemap.xml`, `data/producto-destacado.json`.

### 9.2 Revisado parcialmente (por volumen de datos, no por contenido)

- `img/hero-secuencia/` — 153 WebP binarios. Solo se comprobó el recuento, el tamaño total (17 MB) y
  el consumidor (`js/bienvenida.js:6`).
- `img/productos/`, `img/promociones/`, `img/hero/`, `video/` — se comprobaron nombres, tamaños y
  formatos, no el contenido visual. **No se ha revisado la calidad ni la relevancia de las fotos de
  producto, que es un factor directo de conversión.**
- `backend/.env` — se leyeron las **claves** y se comprobaron los valores sensibles truncados y los
  permisos (600). **No se transcribió ningún valor de secreto.**

### 9.3 Omitido, y por qué

| Omitido | Por qué |
|---|---|
| `public/**` | Artefacto de build generado por `scripts/preparar-estatico.mjs` desde las fuentes ya auditadas. Auditarlo duplicaría cada hallazgo sin aportar nada. Se regenera en cada `npm start`. |
| `.vercel/output/**` | Igual: salida compilada de un despliegue anterior, ya desactualizada respecto al código. |
| `node_modules/**` | Dependencias de terceros. Cubiertas por `npm audit` (0 vulnerabilidades) y por el contraste de versiones contra las declaradas. |
| `thunder-tests/` | Un archivo de notas (`thunder-env.md`) de pruebas manuales con Thunder Client. No es código ni documentación vigente. |
| `frontend.log`, `backend/server.log` | Logs locales. Se comprobó que están gitignorados (`.gitignore:10`, `.vercelignore:11`). No se revisó su contenido por contener datos de ejecución. |
| `.git/` | Historial revisado solo de forma dirigida: se comprobó que `backend/.env` **nunca** se ha commiteado. |

### 9.4 Lo que esta auditoría NO cubre

- **Ningún test end-to-end con navegador.** Los 5 bugs críticos de frontend se detectaron leyendo
  código, no ejecutando la aplicación. Cualquier flujo que dependa del DOM real, de CSS o de
  `localStorage` no está verificado en runtime.
- **Pruebas de carga y concurrencia reales.** Los tests de stock usan `mongodb-memory-server`, no
  Atlas con su latencia de red.
- **Accesibilidad con tecnología de asistencia real.** Los criterios WCAG se evaluaron por análisis
  estático del HTML y cálculo numérico de contraste, **sin** pasar axe, Lighthouse ni un lector de
  pantalla.
- **Rendimiento real (Core Web Vitals).** No se midió LCP, CLS ni INP. Los hallazgos de
  rendimiento son análisis estático de assets y scripts.
- **Escaneo de seguridad con herramienta.** No se ejecutó OWASP ZAP, `npm audit`, ningún
  escáner de dependencias en profundidad, niSAST. La revisión de seguridad es **manual y por lectura**.
- **Penetración de la lógica de negocio.** No se intentó manipular la API como atacante. Lo revisado
  es el código, no el comportamiento en producción.
- **Contenido editorial y de marca.** No se revisó la calidad de las descripciones de producto, los
  precios de venta, la estrategia de precios ni la fotografía. Fuera del alcance técnico.
