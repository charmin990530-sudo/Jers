# Continuar By Jers — estado del 11 de noviembre de 2026

## Encargo activo y decisiones del usuario

Continuar en esta misma carpeta:

`/home/juandagamer/Escritorio/Desarollo 2026-20260903T192909Z-1-001/Desarollo 2026`

1. Retirar las contraseñas expuestas/antiguas y revocar sus accesos.
2. Entregar al usuario un email y una contraseña de administrador comprobados para entrar a su dashboard.
3. Integrar un juego de maquillaje completo sobre el rostro del avatar aprobado, con especial cuidado en celulares.
4. Premios **autorizados expresamente por el usuario**:
   - 10% en **labiales**, por jugar.
   - 10% en **toda la tienda**, por jugar y ganar, para compras **superiores** a $150.000 COP. No debe aplicarse a un subtotal exactamente igual a $150.000.
5. Guardar este documento para que otra sesión retome sin perder contexto.

El usuario entregó un prompt que **se leyó completo**:

`/home/juandagamer/Documents/Codex/2026-11-10/dame-x20/outputs/prompt-integracion-juego-maquillaje.txt`

Volver a leerlo si hace falta. Exige adaptación verificable de DollMaker, MIT/atribución, tres retos, modo libre, capas, deshacer/reiniciar/comparar/PNG/guardado local validado, catálogo y carrito reales, pruebas relevantes y navegador real móvil/escritorio. **No publicar ni desplegar esta integración**. Probar compras con MongoDB temporal, sin tocar pedidos/clientes reales. No cámara ni fotografías personales, no imágenes de la demo ni iframe remoto.

Se comunicó al usuario que el juego vivirá en **`/estudio`**, accesible desde el menú y desde la tienda. Se conservan `/` (bienvenida 3D), `/tienda` y las redirecciones antiguas de `/maquillaje` al catálogo. No se altera el avatar de la portada.

## Precauciones del repositorio

- Rama actual: `audit/fixes`.
- HEAD observado: `53eefbd` (`fix(tienda): la CSP dejaba la pagina en blanco y se rompian compra y stock`). Hay 122 commits alcanzables; Gitleaks contabilizó 120 commits analizados.
- **El árbol y el índice ya tenían muchísimos cambios de sesiones anteriores**, algunos `MM`, `MD`, `AD` y archivos borrados. NO hacer reset, checkout masivo, clean ni restaurar esas eliminaciones.
- `CONTINUAR.md` mayúsculas estaba eliminado en el árbol antes de esta sesión. Este `continuar.md` es nuevo y se crea a pedido del usuario.
- No hay AGENTS.md aplicables encontrados en los ancestros ni en backend/scripts/frontend.
- No se han hecho commits, pushes, reescritura de historial ni despliegues en esta sesión.
- La entrega académica sigue siendo local; no contratar servicios.

## Credenciales: trabajo YA REALIZADO

La base real configurada en `backend/.env` es MongoDB **local**, `127.0.0.1:27017`, base `by-jers`. Tenía tres usuarios, un admin activo. NO se hizo seed ni se reiniciaron datos reales.

- Se renovó el administrador **`admin@byjers.com`**, conservando su cuenta, catálogo y pedidos.
- Se incrementó `tokenVersion` del admin y se eliminaron sus recuperaciones anteriores: las sesiones antiguas quedan revocadas.
- Se renovó también la cuenta de demostración afectada `cliente@byjers.com`; su nueva contraseña aleatoria se descartó y no se conservó en texto plano. Se revocaron sus sesiones.
- Se comprobó bcrypt contra **70 candidatos históricos** en las tres cuentas actuales: ninguno seguía siendo aceptado tras la operación.
- Se retiraron `backend/.env.cuentas-renovadas.json`, `backend/.env.presentacion-accesos.json` y `.env.local` (este último solo contenía un token Vercel ya expirado).
- El acceso nuevo del admin quedó **únicamente** en `backend/.env.admin-acceso.json`, privado `0600`, ignorado por Git. **NO copiar su contraseña aquí, al README, al código, a argumentos del shell ni a informes**.
- El usuario sí solicitó expresamente que al finalizar se le entregue ese email y contraseña. Aún falta entregárselos y comprobar login/dashboard con el servicio definitivo.
- Dashboard: `http://127.0.0.1:3000/admin`; login con retorno: `http://127.0.0.1:3000/login?redirect=%2Fadmin`.
- La tercera cuenta personal no fue modificada.
- `backend/.env.atlas-provisioning.json` se conservó como archivo privado; no es la base utilizada. El metadato de aprovisionamiento indicaba vencimiento 2026-11-12. No se gestionó Atlas remoto.

Herramienta puntual, ignorada por Git: `output/security/revoke-and-verify.mjs`.

**NO volver a ejecutarla con `--apply` solo para consultar el resultado**: volvería a rotar el admin. El resultado ya está en `output/security/access-cleanup.json` (sin valores de contraseñas). Sin `--apply` realiza solo análisis local.

Se descargó Gitleaks 8.30.1 y se verificó SHA-256 contra el valor del CI. Está en `output/security/tools/gitleaks`.

- `gitleaks git . --redact --no-banner --log-opts=--all`: **sin hallazgos**.
- El análisis adicional comparó secretos privados vigentes con **876 objetos de texto del historial/índice**: **cero coincidencias**.
- No se ha reescrito el historial Git. Las contraseñas históricas quedaron inválidas, pero eso no elimina sus textos de commits antiguos.
- Pendiente: repetir escaneo del árbol entregable/build y revisar que ninguna copia privada se sirva por HTTP. Considerar el índice antiguo antes de cualquier commit: hay documentos eliminados todavía presentes en versiones preparadas. No incluir documentos sensibles antiguos por accidente.

## Juego: implementación local YA ESCRITA

### Procedencia

Se clonó e inspeccionó **sin ejecutar scripts ajenos**:

- Repo: https://github.com/wolfderechter/DollMaker
- Commit exacto: **`4fd5adcf48640e238401bb2b4dd75c3702be644c`**.
- Licencia MIT, `Copyright 2024 wolfderechter`.
- Fuente inspeccionada: `output/dollmaker-source/js/canvas.js`, README y LICENSE.
- Se adaptó `Doll`/`Option`: lista de capas, reemplazo de categoría, eliminación con recorrido inverso y composición ordenada en Canvas.
- No se reutilizó ningún gráfico de DollMaker ni Lil-DressUp; las máscaras/efectos son código original By Jers sobre `frontend/img/avatar-jers/neutral.webp` (960×877).
- Avisos ya copiados: `third_party/dollmaker/LICENSE.md`, `third_party/dollmaker/source-excerpt.txt`, `frontend/angular/public/licenses/dollmaker.txt`.
- **Falta escribir `THIRD_PARTY_NOTICES.md`** y actualizar README con la integración y sus límites.

### Frontend

Archivos nuevos: `frontend/angular/src/app/estudio/`:

- `estudio.ts`, `.html`, `.scss`: sección standalone, lazy, en español; modo libre y retos Natural de día, Noche y Editorial; cuatro herramientas, paletas e intensidad; aplicar tocando la zona del rostro o con botón/Enter; progreso por reglas, finalización, productos relacionados y premios.
- `makeup-state.ts`: adaptación tipada de capas, snapshots para deshacer, reiniciar, validación estricta de guardado.
- `makeup-canvas.ts`: render 2D del avatar y máscaras originales de labios/sombras/rubor/delineado; comparación antes/después; exportación PNG en canvas independiente; limpieza de recursos.
- `studio.types.ts`: interfaces de productos y premios.
- `makeup-state.spec.ts`, `estudio.spec.ts`: pruebas significativas de estado, retos, errores e integración de carrito.

Guardado explícito local: clave `by-jers.studio.look.v1`, solo `{version, mode, options}`; no imágenes, credenciales ni premios. Opción de borrar guardado. Se manejan JSON corrupto y almacenamiento bloqueado.

Ruta `/estudio` agregada a `app.routes.ts`. Menú principal ahora incluye «Estudio»; «Looks» sigue accesible en pie de página y su ruta se conserva. Botón secundario de la portada comercial: «Crea tu look y gana descuentos».

`angular.json` copia licencia TXT a `/licenses`; `tsconfig.json` habilita `resolveJsonModule` para compartir reglas. No se añadieron motores ni dependencias al proyecto.

`ApiService`: métodos de estudio y `getCart(rewardId?)`.

Checkout: selector de un premio, cotización pedida al servidor, descuento visible y envío de `rewardId` + `expectedTotal`. Se impide confirmar mientras se recalcula. Si un premio falla, se conserva la cotización anterior y se corrige el selector. Se añadieron pruebas.

### Backend y premios

- `shared/makeup-rules.json`: fuente común de paletas y reglas de los tres retos, consumida por Angular y Node.
- Nuevos modelos `GameReward.js`, `GameAttempt.js`, exportados desde `models/index.js` e incluidos en sincronización de índices de arranque.
- `GameReward`: índice único `(usuario, kind)`, tipos `play-lips` y `win-store`; reserva/consumo condicionado para impedir uso doble.
- `GameAttempt`: propietario, reto, pasos correctos, revisión, participación y finalización; caduca tras 24 h con TTL. **No almacena colores, imagen ni look completo**.
- `services/gameRules.js`: validación Zod de eventos, reglas compartidas y mapeo explícito por nombre de cosmético. Solo productos cuyo nombre empieza con «Labial» reciben premio de labiales; gloss y delineadores de labios se excluyen.
- `services/gameRewards.js`: concesión idempotente y cotización en enteros COP con precios vigentes, pertenencia y disponibilidad.
- `routes/studio.js`, montado en `/api/studio`:
  - `GET /products`: público, productos reales relacionados.
  - `GET /rewards`: autenticado, premios propios.
  - `POST /attempts`: abre un reto autenticado.
  - `PATCH /attempts/:id/step`: evento mínimo de aplicación/retirada, revisión y elecciones verificadas; guarda solo los pasos cumplidos. Emite el premio de jugar tras la primera aplicación válida.
  - `POST /attempts/:id/complete`: verifica pasos en servidor y emite el premio de ganar.
- Se puede jugar anónimamente sin llamadas de progreso; iniciar sesión es necesario para guardar/canjear premios. No se envían imágenes ni un documento de look completo. Se envían eventos mínimos de elecciones al servidor para verificar premios; esto debe documentarse con claridad.
- `cartController`: `GET /api/cart?rewardId=...` cotiza; no consume premio.
- `orderController`: vuelve a calcular el descuento; reserva premio dentro de la transacción de pedido/stock/carrito. El camino standalone tiene compensación condicionada al token de este intento. El reintento idempotente conserva el pedido y descuento.
- `Order`: nuevo snapshot `descuento` y `premio`; `orderResponse` devuelve desglose.
- IVA sobre subtotal descontado + envío. El umbral del premio usa subtotal de productos **antes de envío e impuestos** y exige `> 150000`. Envío sigue usando reglas previas y subtotal de productos.
- Nuevos códigos de error centralizados.
- Exportación de datos personales agrega premios propios y metadatos mínimos de sesiones activas.

Decisiones implementadas y comunicadas: **un premio de cada tipo por cuenta, un uso por premio, no se acumulan entre sí**. Sin vencimiento comercial configurado. Se consumen al crear el pedido, incluso si luego se cancela; el texto de condiciones del juego lo dice explícitamente. No se prometió un sistema avanzado contra bots; el servidor valida eventos/reglas y consumo, no una prueba criptográfica de interacción humana.

## Pruebas y verificaciones: distinguir HECHO de PENDIENTE

### Resultados observados

- Backend completo: **29 suites, 383 pruebas aprobadas**. Incluye `backend/tests/studio-rewards.test.js` (17 casos) sobre MongoDB temporal con replica set. Condiciones de $150.000, labiales, pertenencia, colores inválidos, revisiones, tres retos, modo libre, unicidad, idempotencia, rollback e integración real de pedidos.
- Angular completo: **90 pruebas aprobadas** en ChromeHeadless 157. Incluye las nuevas del juego y checkout.
- Total observado: **473 pruebas automatizadas**.
- `npm run check` pasó tras corregir un `let` a `const`. Hubo después cambios pequeños en la recuperación de errores de premios y selector de checkout; hacer la verificación final de tipos/lint al cerrar.
- Compilaciones `npm run build:static` aprobadas. Última observada: 2026-11-11 23:00 UTC; carga inicial **329,44 kB**, chunk lazy del estudio **53,23 kB**. El build actual contiene los cambios recientes de selector/errores.
- Hubo fallos iniciales de pruebas exclusivamente por el sandbox (`listen EPERM`); se repitieron fuera del aislamiento y pasaron. No tratar esos intentos como resultados funcionales.
- Una captura inicial de escritorio ya existe y fue inspeccionada: `output/playwright/estudio-desktop-inicial.png`. El diseño se renderiza con el avatar, controles y premios. Las imágenes de productos usan lazy loading; en la captura de página completa inicial aparecían en blanco al no haberse desplazado hasta ellas. **Verificar su carga al entrar al viewport**.
- En la consola de invitado solo se observó por ahora el 401 esperado de `/api/auth/me`; todavía falta una comprobación sistemática de errores de JavaScript.

### Verificación de navegador AÚN PENDIENTE

No afirmar que el juego está terminado o que toda la prueba de navegador pasó todavía.

1. Flujo invitado: aplicar tocando labios/ojos/mejillas, cambios de color e intensidad visuales, quitar, deshacer, reiniciar, comparar, guardar/recuperar/borrar, PNG real, retos incompletos/completos.
2. Móvil real emulado con tacto: 320, 360, 390, 430 px; tablet y escritorio; sin desbordamientos, controles utilizables, foco y scroll; idealmente Chromium y WebKit.
3. Estados de error: almacenamiento bloqueado/corrupto, fallo del avatar, catálogo caído; descarga PNG validada y carga lazy de productos.
4. Flujo de compra completo en **fixture temporal**: tienda → estudio → jugar → ganar → producto real relacionado → añadir → carrito → checkout → elegir premio → pedido; verificar descuento y consumo. Probar ambos tipos de premio, el rechazo en $150.000 y su aplicación por encima.
5. Capturas finales útiles de escritorio, móvil y resultado. Revisar errores de consola/página.
6. El `orderController` tiene compensación standalone para reserva del premio, pero la nueva prueba de rollback usa replica set; conviene agregar un caso específico de rollback sin transacción si se modifica ese camino.

## Entorno de navegador temporal disponible

Se creó **solo para pruebas**, sin escribir datos comerciales reales:

- Script: `output/playwright/start-studio-fixture.mjs`.
- Escucha en **`http://127.0.0.1:3100`** con MongoMemoryReplSet temporal.
- Copia por GET solamente categorías, marcas y productos públicos de la API real en puerto 3000. Crea una cuenta ficticia aislada.
- Credenciales ficticias aleatorias en `output/playwright/.env.fixture.json` (`0600`, ignorado); no son el admin real. El script las borra al terminar por SIGINT/SIGTERM.
- Se corrigió el script para conectar Mongoose **antes** de importar la app, evitando una carrera de `createCollection` con `bufferCommands=false`.
- Sesión exec actualmente viva del fixture: **54693**. Puede perderse al cambiar de sesión; consultar salud antes de asumir que sigue activo.
- No dejar corriendo el fixture al acabar: pararlo limpiamente para que borre su archivo privado y Mongo temporal.

Playwright CLI:

`/home/juandagamer/.agents/skills/playwright/scripts/playwright_cli.sh`

- Se leyó la skill Playwright y referencias CLI.
- Hace falta ejecución escalada por los puertos/procesos del navegador; existe prefijo aprobado para ese wrapper.
- Chrome de Google no está instalado; usar **Brave** mediante `output/playwright/studio-cli.config.json` (executablePath `/opt/brave.com/brave/brave`). No instalar Chrome innecesariamente.
- Sesión de navegador abierta: **`studio-qa`**, ya en `http://127.0.0.1:3100/estudio`.
- Comando de apertura válido: `.../playwright_cli.sh -s=studio-qa open http://127.0.0.1:3100/estudio --config=output/playwright/studio-cli.config.json`.
- `run-code --filename=...` está soportado: archivo con función `async (page) => { ... }`, sin crear tests de @playwright/test.
- Tomar snapshot antes de usar refs o selectores nuevos. Snapshot inicial ya leído: `.playwright-cli/page-2026-11-11T23-01-46-855Z.yml`.
- Un `run-code` con `console.log` no mostró el objeto de salida; retornar un objeto directamente para obtener resultados.
- **Último comando de navegador aún por recoger**, sesión exec **17122**: devuelve `{nodeRequire: typeof require, nodeProcess: typeof process, ready: ...}`. Sirve para saber si se puede leer la credencial ficticia desde el archivo dentro del snippet, sin incrustarla en comandos/logs.
- No usar cookies/token real del administrador en logs, traces ni snapshots de almacenamiento.

## Cierre pendiente de la tarea general

1. Completar las verificaciones y corregir problemas reales que aparezcan.
2. Escribir `THIRD_PARTY_NOTICES.md` con commit y módulos adaptados, arte original y licencia MIT; ya existen copias de licencia y excerpt.
3. Actualizar README con ruta, controles, privacidad del juego, reglas comerciales, API, procedencia y resultados verdaderos.
4. Repetir `npm run check` y pruebas relevantes si hay cambios. No repetir toda la suite sin motivo: la completa ya pasó.
5. Hacer build final si cambian fuentes de Angular y comprobar que la salida incluye la licencia.
6. **Reiniciar el servicio real `by-jers-dev`** para cargar las nuevas rutas backend. Hasta ahora **NO se ha reiniciado**: puerto 3000 puede servir el build actualizado, pero su proceso backend todavía tiene el código anterior al juego.
7. Verificar que ese reinicio arranca bien, que salud/catálogo siguen funcionando y que el admin nuevo accede al dashboard. Verificar rechazo de sesión anterior; no escribir pedidos de prueba reales.
8. Repetir escaneo de secretos y bloqueos HTTP de archivos privados. Mantener privados los archivos `.env*`, no incluir claves en documentación.
9. Cerrar fixture temporal y navegadores de QA.
10. Actualizar este documento con el estado final.
11. Entregar al usuario: URL local comprobada del juego, acceso de admin solicitado (leer archivo privado únicamente para esa entrega explícita), resumen de premios, pruebas verdaderas, enlaces a capturas y límites que queden. No publicar/desplegar.

## Herramientas y permisos

Skills ya leídas/aplicadas en esta sesión: `security-best-practices`, `playwright`; OpenAI Docs se usó solo en el turno anterior para recuperar contexto de conversación.

Sandbox bloquea localhost y procesos de navegador/Mongo temporal. Ante `EPERM` o resolución DNS bloqueada hay que repetir mediante `sandbox_permissions: require_escalated`, con justificación en la herramienta. Se aprobaron prefijos de `npm run test:backend`, `npm run test:angular`, wrapper Playwright y scripts temporales mencionados.

No hay autorización para mensajes/email a terceros. No publicar en Sites/GitHub/Vercel. No se han usado subagentes y no hay instrucción aplicable que los solicite.
