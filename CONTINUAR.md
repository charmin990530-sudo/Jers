# CONTINUAR — auditoría By Jers

**Para quien retome esto dentro de uno o varios días.** Está todo el contexto que
hace falta para seguir sin tener que releer 15.000 líneas de código.

- **Fecha de corte:** 3 de octubre de 2026, tras la segunda sesión (cerró los bloques 8 y 9).
- **Rama:** `audit/fixes` (creada desde `master` @ `e19cdba`, árbol limpio).
- **Base de datos:** `mongodb://127.0.0.1:27017/by-jers` (local, sin réplica).
- **Estado:** 295 tests pasan (252 backend + 43 frontend), lint y type-check en
verde, el backend corre y sirve la web.

Si solo puedes leer una sección, lee **§1**. Si solo vas a hacer una cosa, haz **§4.1**.

---

## 1. En una pantalla: qué se hizo y qué falta

### Resuelto (18 commits)

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
| `c037c39` | **B-06**: ESLint 10 + `checkJs` como paso de CI, y 87 avisos de deuda limpia |
| `a37357f` | **M-12/B-07**: `npm audit` ya no intentaba auditar `backend/` con ENOLOCK |
| `9e3c6d3` | **B-26**: las dos CSP alineadas directiva por directiva |
| `a45079b` | **B-27**: la barrera de archivos estáticos llega por fin a `express.static` |
| `af8d2a2` | **B-35**: las tipografías se sirven desde el repo, sin Google Fonts |
| `e8d11df` | La compensación de stock usaba una variable fuera de alcance |

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

Nada bloqueante. Los bloques 8 y 9 del §4 están cerrados, y `AUDITORIA.md` §9
tiene el estado hallazgo por hallazgo.

Queda por delante, todo de prioridad baja:

| Qué | Detalle |
|---|---|
| **B-05** | Tests de frontend. Sigue siendo lo más rentable que queda, y ahora hay un camino mejor que jsdom: un test de integración con Firefox headless, que es como se encontró el `ReferenceError` de `config.js` (§4.3) |
| **B-02** | `EMAIL_EXISTS` confirma la existencia de un email en un endpoint público |
| **B-21, B-22** | Formularios con `method="post"` sin `action`; el de contacto no cambia el texto del botón |
| **B-32** | `redact()` en los mensajes de los drivers de Redis/Mongo |
| **B-33** | El shim serverless no valida la subruta antes de reescribir `req.url` |
| **B-01** | Quedan algunos 400 donde 409 sería lo correcto |

Y dos decisiones tuyas: **la pasarela de pago** (§5) y **B-25**, las reseñas de
`resenas.html` que presentas como opiniones de clientas y son seis escritas a mano.
Esta última es la única con riesgo legal, y decidiste dejarla (AUDITORIA.md §9.5).

### Cerrado por decisión tuya, sin tocar código

`B-23` (iconos del pie a perfiles inexistentes), `B-24` (doble splash en
`bienvenida.html`) y `B-25` (reseñas). Ninguno rompe nada; están anotados en
`AUDITORIA.md` §9.5 para que no se pierdan.

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
npm test                    # backend (252) + frontend (43), ~95 s
npm run test:frontend       # solo los 43 del frontend, ~2 s
npm run test:backend        # solo los del backend, ~90 s
npm run check               # lint + type-check, lo que corre el CI
npm run lint                # ESLint 10 sobre todo el repo
npm run typecheck           # tsc -p jsconfig.json (checkJs del núcleo del front)
npm run build:static        # regenera public/ (258 archivos)
npm audit                   # 0 vulnerabilidades; NO con --prefix backend (§4.1)
curl -s localhost:3000/api/health
```

Para cargar el sitio en un navegador y leer los errores de JavaScript, que es como
se detectan los fallos que los tests no ven:

```bash
firefox --headless --window-size=1280,900 --screenshot /tmp/pagina.png \
  "http://localhost:3000/producto"
```

Firefox escribe los errores JS en stderr, así que esto sirve como comprobación
rápida de que una página no reventó:

```bash
firefox --headless --screenshot /tmp/x.png "http://localhost:3000/login" 2>&1 \
  | grep -i "JavaScript error" | grep -v XPIDatabase
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

Lo que sigue es lo único abierto. Todo lo de los bloques 8 y 9 está cerrado; el
estado completo, hallazgo por hallazgo, está en `AUDITORIA.md` §9.

### 4.1 B-05 — ampliar los tests de frontend

Hay suite: 43 tests sobre `js/api.js` (el contrato de red), `js/carrito.js` (la
lógica que decide cuánto se cobra, incluida la defensa contra el envenenamiento y
el invariante que rompió C-02) y `setBtnLoading`. Corre con `npm run test:frontend`
y la arranca `npm test` también.

Lo que **no** está cubierto:

- Los controladores de página: `producto.js`, `checkout.js`, `mis-pedidos.js`,
  `mi-perfil.js` y el resto. Son unos 25 módulos de DOM.
- `js/api.js` contra la API de verdad: los tests usan un `fetch` simulado, así que
  un cambio en el contrato del backend no lo detecta esa suite (lo detectan los
  tests de backend, pero no el vínculo entre ambos).
- El pago, que además depende de M-15.

La vía para seguir es un test de integración con Firefox headless, no jsdom: el
arnés ya funciona (receta en §3), carga la página de verdad y escribe los errores
de JavaScript en stderr, así que un test puede afirmar "el flujo de compra
completo carga sin errores y pinta el total", que es lo que de verdad falta.

### 4.2 Lo demás que queda abierto

- **B-02, y este es el único que queda abierto de verdad:** `EMAIL_EXISTS`
  confirma la existencia del email en un endpoint público, lo que permite construir
  un listado de clientes. La mitigación ya existe en el mismo archivo
  (`forgotPassword` responde siempre lo mismo) y no se aplica en `register`.
  Arreglarlo **cambia lo que ve el usuario al registrarse**, así que es decisión
  tuya y está pendiente.
- **B-01:** quedan algunos conflictos de estado que devuelven 400 donde 409 sería
  lo correcto. Cosmético para el frontend actual, mejora el contrato.

Cerrados en la tercera sesión, con su commit en `AUDITORIA.md` §9: B-05 (a medias,
ver §4.1), B-21, B-22, B-32 y B-33.

---

## 4bis. Verificación final — qué se hizo y qué no

Hecho en la segunda sesión, con Firefox headless:

| Qué | Resultado |
|---|---|
| Las 20 páginas (14 públicas + 6 de admin) | Cero errores de JavaScript |
| Tipografías servidas desde `/font/` | Playfair Display en títulos, Poppins en texto |
| **C-02, el layout del carrito** | **Verificado**, que era lo único que faltaba de verdad |
| `AUDITORIA.md` §9 | Estado de los 69 hallazgos con su commit |

Lo del carrito: con dos artículos dentro, la miniatura se queda en 64×64, el botón
`×` de quitar cae dentro del panel de 390 px y un nombre largo se trunca sin
empujar nada. La regla que lo arregla es `.carrito-item__img` en `base.css:1012`.

**Lo que NO se pudo verificar aquí**, y sigue abierto:

- El pago. `estadoPago` lo cambia un admin a mano y no hay pasarela (§5), así que
  el tramo "pago → confirmación" no se puede recorrer de punta a punta.
- El desglose con IVA de un pedido nuevo en `mis-pedidos.html`: se cubre por API en
  los tests, pero no se ha visto en pantalla.
- Core Web Vitals. Sin throttling de red no hay cifras, y en particular los 17 MB
  de `img/hero-secuencia/` (B-24) no están medidos.
- Lector de pantalla real. El ARIA se verificó por cálculo, no con NVDA.

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

`AUDITORIA.md` §9 es la fuente: estado de los 69 hallazgos con su commit. Las
tablas de §4 de ese archivo describen lo que se encontró, no lo que queda.

| Severidad | Estado |
|---|---|
| CRÍTICO | Los 2 resueltos. C-02 además verificado en navegador |
| ALTO | Los 9 resueltos |
| MEDIO | Todos menos **M-04** (oráculo de tiempo en el login) y **M-15** (pasarela, decisión de negocio) |
| BAJO | Resueltos: B-03 … B-20, B-26, B-27, B-28 … B-31, B-35. **Aceptados por decisión tuya:** B-23, B-24, B-25. **Abiertos:** B-02, B-05, B-21, B-22, B-32, B-33, y B-01 parcial |

Una nota sobre `M-24`: la segunda sesión no volvió a mirarlo y no aparece en las
tablas de `AUDITORIA.md` §9 porque no figura como hallazgo con tabla propia. Si
alguien lo menciona, comprobar primero si existe en §4.3 o §4.2 del informe.

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
- **Una página "se queda en blanco" o no carga nada en el navegador:** mirar los
  errores de JavaScript que Firefox escribe en stderr (receta en §3). Así se
  encontró el `ReferenceError` de `js/config.js` que dos commits llevaba vivo
  con los tests en verde.
- **`npm run lint` falla con `no-use-before-define`:** esa regla existe para cazar
  `const` usadas antes de declararse, que es la causa de que un módulo entero
  reviente en el navegador. Se arregla moviendo la declaración por encima del
  primer uso, no con un disable.
- **`npm run typecheck` falla:** el alcance de `checkJs` está en `jsconfig.json` y
  es deliberado; solo cubre el núcleo sin DOM del frontend. Los errores de
  estrechamiento DOM de los controladores de página son ruido, no bugs.