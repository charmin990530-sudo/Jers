# CONTINUAR — auditoría By Jers

**Para quien retome esto dentro de uno o varios días.** Está todo el contexto que
hace falta para seguir sin tener que releer 15.000 líneas de código.

- **Fecha de corte:** 2 de octubre de 2026, al final de una sesión de trabajo.
- **Rama:** `audit/fixes` (creada desde `master` @ `e19cdba`, árbol limpio al inicio).
- **Base de datos:** `mongodb://127.0.0.1:27017/by-jers` (local, sin réplica).
- **Estado:** 196 tests pasan, el backend está corriendo y sirve la web.

Si solo puedes leer una sección, lee **§1**. Si solo vas a hacer una cosa, haz **§4.1**.

---

## 1. En una pantalla: qué se hizo y qué falta

### Resuelto (12 commits, 63 archivos)

| Commit | Qué arregla |
|---|---|
| `841e12b` | Informe de auditoría: 60 hallazgos verificados (`AUDITORIA.md`) |
| `9d3ce1a` | `backend/.env` apunta a la base local (Atlas estaba activa y caducada) |
| `d686019` | Servicio systemd de usuario: el backend se levanta solo en local |
| `623fdb9` | **C-01**: el checkout borraba todo el historial de pedidos del usuario |
| `9aea01e` | **A-01**: el checkout mostraba un total distinto del que se cobraba |
| `09917b6` | **C-02**: el carrito no dejaba quitar artículos (imagen desbordada) |
| `efb8261` | **IVA** calculado en servidor + eliminado el campo `descuento` |
| `625bcaf` | Panel admin: no se queda muerto ni falla en silencio |
| `e3d1c9c` | Buscador en el encabezado, marcas reales, SEO de ficha |
| `76f1b3e` | Accesibilidad: mensajes que no se borraban, foco en modales, contraste AA |
| `7009f36` | Redis degrada en vez de tumbar la API; contrato de errores auditable |
| `15959a3` | Índices de Mongo que las consultas del catálogo usan de verdad |

### Los dos críticos, explicados en dos líneas

- **C-01**: la compensación del checkout hacía
  `Order.deleteMany({usuario, idempotencyKey: idempotencyKey || null})`. En Mongo,
  `{campo: null}` matchea también los documentos donde el campo **no existe**, así que
  sin cabecera `Idempotency-Key` (el caso normal) borraba todos los pedidos del
  usuario. Reproducido antes del arreglo: 3 pedidos → 1.
- **C-02**: `carrito.js` emitía `class="carrito-item__img"` y **no existía ninguna
  regla con ese nombre** en las 19 hojas CSS. La rejilla era `1fr auto auto`, y el
  mínimo `auto` de una imagen sin ancho es su tamaño intrínseco (900×1350 px), así
  que el botón `×` de quitar quedaba fuera del panel de 390 px.

### Falta

Nada bloqueante. Queda por delante:

| Bloque | Qué incluye |
|---|---|
| **4.1** | Linter + `npm audit` funcionando en CI · bloque 8 del §4 |
| **4.2** | CSP duplicada, `STATIC_DENY` real, lows varios · bloque 9 del §4 |
| **4.3** | **Verificación final**: recorrer el flujo de compra a mano y actualizar `AUDITORIA.md` |

Y una decisión de negocio tuya que sigue abierta: **la pasarela de pago** (§5).

---

## 2. El backend se levanta solo

Un servicio systemd de **usuario** (no de sistema): no pide sudo, se detiene al
cerrar sesión, y `Restart=always` lo levanta solo si el proceso muere.

```bash
npm run autostart          # instalar y arrancar (solo la primera vez)
npm run autostart:status   # ver estado
npm run autostart:stop     # detener y desinstalar

systemctl --user status by-jers-dev    # estado
journalctl --user -u by-jers-dev -f   # logs en vivo
```

Antes de arrancar regenera `public/`, igual que `npm start`. Si el proceso muere,
vuelve solo en ~6 s (verificado con un `kill -9`).

**Reemplaza** a un `byjers-backend.service` que ya estaba instalado en `~/.config`
y que quedó desactivado y borrado. Ese apuntaba solo a `backend/src/app.js`, sin
regenerar `public/`.

> ⚠️ El servicio corre `npm run build:static` en cada arranque. Si estás
> trabajando con cambios sin commitear en `public/`, no se pierde nada (se
> reconstruye desde el fuente), pero `public/` no se versiona y se regenera.

---

## 3. Comandos de verificación

```bash
npm test                    # 196 tests, 12 suites, ~100 s
npm run build:static        # regenera public/
npm audit                   # 0 vulnerabilidades
curl -s localhost:3000/api/health
```

Para las pruebas que tocan `backend/.env`, no se imprimen secretos:

```bash
# base local
MONGODB_URI=mongodb://127.0.0.1:27017/by-jers npm start
```

El `backend/.env` real tiene la **línea de Atlas comentada** y la local activa.
Si algún día hay que volver a Atlas: descomentar la de Atlas y comentar la local.

---

## 4. Lo que queda, con detalle

### 4.1 Bloque 8 — calidad e infraestructura

De `AUDITORIA.md` §4.4 y §5. Concretamente:

- **B-06 (el más valioso):** no hay linter ni type-check en el proyecto. Añadir
  ESLint con `checkJs` y un paso en CI. Varios bugs de esta auditoría (A-03,
  A-08) eran de ese tipo: cosas que el navegador descubre en runtime y ningún
  paso previo avisa. Es el bloque que más previene.
- **B-05:** cero tests de frontend. `js/carrito.js`, `js/checkout.js` y
  `js/api.js` son los que más lo necesitan. Requiere decidir si entra `jsdom`.
- **M-12 / B-07:** `npm audit --prefix backend` falla con `ENOLOCK` (el lockfile
  vive en la raíz por ser workspace), pero el CI afirma ejecutarlo en los dos
  sitios. Arreglar el workflow o el comando.
- **B-26:** dos cabeceras CSP en Vercel (la de `vercel.json` y la de `helmet`),
  que hoy no divergen en nada pero divergirán.
- **B-09:** ya hecho en `15959a3`; aquí solo queda confirmar que `syncIndexes()`
  no lo vuelve a crear en el próximo arranque.

Archivos Involved: `.github/workflows/ci.yml`, `package.json`, raíz.

### 4.2 Bloque 9 — limpieza y SEO

- **B-27:** `STATIC_DENY` solo se aplica a la ruta de HTML abreviado
  (`app.js:382`), no a `express.static`. El comentario afirma que `package.json`
  nunca se sirve y eso solo es cierto por `dotfiles:'deny'` y porque `public/` es
  build generado.
- **B-25 / B-33 / B-35:** doble splash en `bienvenida.html` (dos loaders
  compitiendo, 17 MB de frames); iconos del pie apuntando a `facebook.com/tu-tienda`;
  Google Fonts render-blocking en las 22 páginas.
- **B-32:** `config/db.js` ya enmascara el hostname en producción; queda lo de
  redactar los mensajes de los drivers de Redis/Mongo en los logs.
- **B-01 / B-19 / B-02:** códigos HTTP. Varios conflictos de estado devuelven 400
  donde 409 sería lo correcto. Es cosmético para el frontend actual, pero mejora
  el contrato. **B-19 ya se resolvió** (resaltado del enlace activo con
  `cleanUrls`).
- **B-25 legal:** `resenas.html` dice "opiniones reales de quienes ya compraron" y
  son seis reseñas escritas a mano. Es práctica comercial engañosa en Colombia.
  O se conecta a un modelo `Review` con moderación, o se cambia el encabezado.

### 4.3 Verificación final (obligatoria antes de cerrar)

1. Recorrer **a mano** el flujo completo: navegación → búsqueda → producto →
   carrito → checkout → pago → confirmación → mis pedidos. Con el navegador.
2. Comprobar en `mis-pedidos.html` que un pedido nuevo muestra el desglose con IVA.
3. Comprobar el panel admin: productos, categorías, marcas, pedidos, usuarios.
4. **Actualizar `AUDITORIA.md`**: marcar cada hallazgo como resuelto, pendiente o
   decisión pendiente. Hoy la columna de estado describe el estado *antes* de
   esta ronda de correcciones.

> Lo único que no se pudo verificar de verdad es el **layout**: C-02 se resolvió
> por cálculo del CSS (la imagen medía 900 px en una pista `1fr`) y no con un
> navegador. Vale la pena mirar el panel del carrito con productos dentro antes de
> dar el trabajo por cerrado.

---

## 5. Decisiones de negocio que siguen abiertas

Ya decidiste estas tres (están implementadas):

- ✅ Envío: `SHIPPING_COST=15000`, `SHIPPING_FREE_FROM=200000`, en `.env`.
- ✅ Confirmación de pago: **aviso + WhatsApp en pestaña nueva**, sin sacar al
  usuario de la web.
- ✅ IVA: **19%** (`TAX_RATE_BP=1900`), calculado en servidor sobre
  `subtotal + envío`, congelado en cada pedido como `tasaImpuestosBp`.
- ✅ Cupones: **eliminados** (el campo `descuento` y `applyDiscountPercentage`).

Queda una:

> **Pasarela de pago.** Ahora `estadoPago` lo cambia un admin a mano, sin evidencia
> ni webhook. Si se cobra por WhatsApp/transferencia, lo razonable es documentarlo
> como operable-manualmente y añadir campos de evidencia (`pagoConfirmadoPor`,
> `pagoConfirmadoEn`, comprobante). Si se integra una pasarela, hay que añadir
> `POST /api/webhooks/:provider` con verificación HMAC sobre el cuerpo crudo
> (`express.raw`), protección de replay y tabla de eventos procesados.

Sin pasarela, la reconciliación depende de una persona. Con más de ~10 pedidos
semanales conviene decidirlo.

### Detalles técnicos de la base imponible del IVA

Se aplica sobre `subtotal + envío`, no solo sobre el subtotal: cuando la tienda
cobra el flete por separado, la entrega también es una prestación sujeta a
gravamen. Si prefieres excluir el envío, el cambio es de **una línea**:
`taxFor(subtotal + costoEnvio, TAX_RATE_BP)` → `taxFor(subtotal, TAX_RATE_BP)`,
en `backend/src/controllers/orderController.js:140`.

---

## 6. Mapa de los hallazgos

`AUDITORIA.md` tiene la tabla completa con `archivo:línea` y evidencia. Resumen de
IDs ya resueltos, por si hay que consultarlos:

| Severidad | IDs resueltos | Cuándo |
|---|---|---|
| CRÍTICO | C-01, C-02 | `623fdb9`, `09917b6` |
| ALTO | A-01 … A-09 | `9aea01e`, `623fdb9`, `625bcaf`, `e3d1c9c`, `7009f36`, `76f1b3e` |
| MEDIO | M-01 … M-23 | casi todos; quedan M-04 (oráculo de tiempo en login), M-15 (pasarela), M-24 |
| BAJO | B-01 … B-35 | B-06, B-05, B-26, B-27, B-25 pendientes |

---

## 7. Reglas que se siguieron en cada commit

Por si hay que continuar en la misma línea:

1. **Un commit por problema.** El mensaje explica el porqué con el `archivo:línea`
   y, si el bug estaba reproducido, cómo se reprodujo.
2. **Nada de secretos impresos ni versionados.** `backend/.env` está en
   `.gitignore`; los comandos que lo leen usan `set -a && . ./backend/.env`.
3. **Ningún hallazgo se da por cerrado sin evidencia**: o se ejecutó contra el
   servidor, o el test lo cubre, o el comentario dice por qué no se pudo.
4. **El que está pendiente de tu criterio se pregunta**, no se asume.

---

## 8. Si algo no cuadra

- **El servidor no arranca:** `journalctl --user -u by-jers-dev -n 50`. Lo más
  probable es la `MONGODB_URI`; mongod local debería estar activo
  (`systemctl status mongod`).
- **Falla un test de `indices.test.js`:** necesita que los índices se hayan creado,
  y el `beforeEach` llama a `syncIndexes()` por eso. Si se añade un modelo nuevo,
  añadirlo ahí.
- **Algo del frontend parece roto tras un commit:** `npm run build:static` sirve
  una versión antigua hasta que se reconstruye. `npm start` lo hace solo.
- **Dudas sobre una decisión de diseño:** los comentarios del código explican el
  porqué original casi siempre. Buscar el `ID` del hallazgo en `AUDITORIA.md`.