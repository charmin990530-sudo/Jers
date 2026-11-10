# By Jers — E-commerce

Tienda online de maquillaje y cuidado capilar. Proyecto de bootcamp de desarrollo web.

## Stack

- **Frontend:** Angular 20, TypeScript y SCSS (versión anterior conservada en `frontend/pages`, `frontend/js` y `frontend/css`)
- **Backend:** Node.js, Express, MongoDB (Mongoose)
- **Autenticación:** JWT en cookies HttpOnly + CSRF
- **Despliegue:** Vercel
- **Tests:** Jest + Supertest + MongoDB Memory Server + Jasmine/Karma en navegador

## Requisitos

- Node.js >= 20
- MongoDB local o MongoDB Atlas
- npm

## Inicio rápido

```bash
# 1. Instalar dependencias
npm ci
npm ci --prefix frontend/angular

# 2. Configurar variables de entorno
cp backend/.env.example backend/.env
# Editar backend/.env con tus valores

# 3. Cargar datos iniciales (desarrollo)
npm run seed

# 4. Arrancar
npm start
# http://localhost:3000
```

> **MongoDB local.** `backend/.env.example` trae comentada la `MONGODB_URI` de Atlas.
> Con Atlas activa la API responde 503 en todo `/api/*` (`bad auth`) si la credencial
> caducó. Para trabajar en local, descomenta la de `127.0.0.1` y deja Atlas comentada;
> MongoDB Compass se conecta a esa misma base.

> **Un solo puerto: 3000.** El sitio y la API los sirve el mismo proceso de Express, así que
> el puerto de `backend/.env` (`PORT`) tiene que ser el mismo desde el que abres el navegador.
> `frontend/js/config.js` deriva la URL de la API de `window.location.origin` sin escribir ningún puerto,
> así que si mueves `PORT` a otra cosa, ábrelo también en ese puerto. En Vercel no hay puerto:
> `origin` ya es el dominio y no hay nada que configurar.

## Desarrollo con Angular

`npm start` compila Angular y sirve la tienda y la API en http://127.0.0.1:3000/.
Para editar con recarga en vivo, deja el backend encendido y ejecuta en otra terminal
`npm run dev:frontend`. Abre http://localhost:4200/; `/api` se reenvía al backend
por `frontend/angular/proxy.conf.json`. Si cambias el puerto del backend, ajusta ese archivo.
Las imágenes y videos se incluyen tanto en desarrollo como en producción.

`npm run check` comprueba también los tipos de Angular. Las 43 pruebas del frontend
anterior se complementan ahora con 28 pruebas de Angular. `npm test` ejecuta las tres suites.
Para presentar el proyecto, consulta `docs/ENTREGA.md`.

En este equipo Linux con NVIDIA, `npm run preview:gpu` abre la tienda con un perfil
separado de navegador y selección NVIDIA mediante PRIME. Requiere el servidor iniciado.
Para Angular en vivo: `npm run preview:gpu -- http://localhost:4200/`.
Esto selecciona la GPU para el navegador, no convierte las compilaciones o MongoDB en tareas CUDA.

## Scripts

| Script | Descripción |
|--------|-------------|
| `npm start` | Reconstruye `frontend/public/` y arranca el servidor |
| `npm run dev` | Desarrollo con recarga automática |
| `npm run build:static` | Solo regenera `frontend/public/` |
| `npm run seed` | Carga datos iniciales (desarrollo) |
| x |
| `npm run autostart` | Instala y arranca el servicio systemd de usuario que deja el backend encendido y lo reinicia si se cae |
| `npm run autostart:status` | Estado del servicio |
| `npm run autostart:stop` | Lo detiene y lo desinstala |

### Backend siempre encendido en local

```bash
npm run autostart        # instala y arranca
systemctl --user status by-jers-dev   # ver estado
journalctl --user -u by-jers-dev -f  # ver logs
```

El servicio es de usuario (no de sistema), así que **no pide sudo** y se detiene
al cerrar sesión. Levanta el sitio y la API en `http://localhost:3000` y se
reinicia solo si el proceso muere. Antes de arrancar regenera `frontend/public/`,
que es lo mismo que hace `npm start`.

## Estructura

```
├── api/                # Serverless function para Vercel
├── backend/            # API Express + tests
│   ├── src/
│   │   ├── config/     # Configuración (env, db)
│   │   ├── controllers # Lógica de negocio
│   │   ├── middleware/ # Auth, CSRF, validación, errores
│   │   ├── models/     # Modelos Mongoose
│   │   ├── routes/     # Rutas de la API
│   │   ├── seeds/      # Datos iniciales
│   │   └── services/   # Transacciones, emails, dinero
│   └── tests/          # 285 tests (Jest + MongoDB Memory Server)
├── frontend/           # Frontend (HTML, CSS, JS, imágenes)
│   ├── pages/          # Páginas del sitio (HTML)
│   ├── css/            # Estilos
│   ├── js/             # Lógica del frontend
│   ├── admin/          # Panel de administración (HTML)
│   ├── img/            # Imágenes (WebP)
│   ├── font/           # Fuentes tipográficas
│   ├── video/          # Video hero
│   ├── data/           # Datos estáticos (JSON)
│   └── public/         # Build generado por npm run build:static (no editar, no versionado)
├── scripts/            # Scripts de build
└── docs/               # Documentación (auditoría técnica)
```

## Variables de entorno

Ver `backend/.env.example` para la lista completa.

### Mínimo para desarrollo

```env
PORT=3000
HOST=127.0.0.1
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/by-jers
JWT_SECRET=cualquier-cosa-en-desarrollo
```

### Obligatorias en producción

- `JWT_SECRET` (64+ caracteres aleatorios)
- `MONGODB_URI` (mongodb+srv:// con TLS)
- `REDIS_URL` (rediss:// con TLS)
- `COOKIE_SECURE=true`
- `TRUST_PROXY_HOPS=1`
- `SECRETS_FROM_ENV=true`
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`

## API

Ver `docs/API.md` para el contrato completo.

### Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/products` | Listar productos |
| GET | `/api/products/:id` | Detalle de producto |
| POST | `/api/orders` | Crear pedido |
| GET | `/api/orders` | Mis pedidos |
| POST | `/api/auth/register` | Registro |
| POST | `/api/auth/login` | Login |

## Tests

```bash
npm test
```

**356 pruebas: 285 backend + 43 frontend anterior + 28 Angular** (suites verificadas por separado):

Backend (`backend/tests/`):
- `money.test.js` — Aritmética monetaria
- `financial.test.js` — Totales, stock, idempotencia
- `auth.test.js` — Autenticación
- `user-activation.test.js` — Activación y revocación de cuentas
- `cart-orders.test.js` — Carrito y pedidos
- `order-email.test.js` — Correos de pedido
- `products.test.js` — Catálogo
- `error-codes.test.js` — Contrato de códigos de error
- `env-production.test.js` — Variables de entorno en producción
- `security-middleware.test.js` — CSRF, validación
- `security-flows.test.js` — Flujos de seguridad

Frontend (`frontend/tests/`):
- `api.test.js` — Contrato de la capa de red
- `carrito.test.js` — Lógica del carrito y defensa contra envenenamiento
- `setbtnloading.test.js` — Helper de estado de carga de botones

## Despliegue

El proyecto está configurado para Vercel:

1. Conectar el repositorio a Vercel
2. Configurar variables de entorno en Vercel
3. Desplegar

Ver `backend/.env.example` para la checklist de producción.

## CI/CD

GitHub Actions ejecuta automáticamente los tests en cada push y PR a `main`/`master`, `fix/**`,
`chore/**` y `feat/**`:

```yaml
# .github/workflows/ci.yml
- Instala dependencias
- Ejecuta npm test dos veces: en UTC y en TZ=America/Bogota (356 tests)
- npm audit en la raíz (cubre el workspace backend)
- Genera el build estático
```

## Monitoreo

Sentry está integrado para capturar errores en producción:

1. Crear cuenta en [sentry.io](https://sentry.io)
2. Crear un proyecto Node.js
3. Configurar `SENTRY_DSN` en las variables de entorno de Vercel

## Licencia

ISC
