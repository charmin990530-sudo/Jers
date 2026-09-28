# By Jers — E-commerce

Tienda online de maquillaje y cuidado capilar. Proyecto de bootcamp de desarrollo web.

## Stack

- **Frontend:** HTML, CSS, JavaScript (Vanilla JS con módulos ES)
- **Backend:** Node.js, Express, MongoDB (Mongoose)
- **Autenticación:** JWT en cookies HttpOnly + CSRF
- **Despliegue:** Vercel
- **Tests:** Jest + Supertest + MongoDB Memory Server

## Requisitos

- Node.js >= 20
- MongoDB local o MongoDB Atlas
- npm

## Inicio rápido

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp backend/.env.example backend/.env
# Editar backend/.env con tus valores

# 3. Cargar datos iniciales (desarrollo)
npm run seed

# 4. Arrancar
npm start
# http://localhost:3000
```

## Scripts

| Script | Descripción |
|--------|-------------|
| `npm start` | Reconstruye `public/` y arranca el servidor |
| `npm run dev` | Desarrollo con recarga automática |
| `npm run build:static` | Solo regenera `public/` |
| `npm run seed` | Carga datos iniciales (desarrollo) |
| `npm test` | Ejecuta 127 tests |

## Estructura

```
├── admin/              # Panel de administración (HTML)
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
│   └── tests/          # 127 tests (Jest)
├── css/                # Estilos
├── data/               # Datos estáticos
├── img/                # Imágenes (WebP)
├── js/                 # Lógica del frontend
├── public/             # Build generado (no editar)
├── scripts/            # Scripts de build
└── *.html              # Páginas del sitio
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

Ver `API.md` para el contrato completo.

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

127 tests en 7 suites:
- `money.test.js` — Aritmética monetaria
- `financial.test.js` — Totales, stock, idempotencia
- `auth.test.js` — Autenticación
- `cart-orders.test.js` — Carrito y pedidos
- `products.test.js` — Catálogo
- `security-middleware.test.js` — CSRF, validación
- `security-flows.test.js` — Flujos de seguridad

## Despliegue

El proyecto está configurado para Vercel:

1. Conectar el repositorio a Vercel
2. Configurar variables de entorno en Vercel
3. Desplegar

Ver `backend/.env.example` para la checklist de producción.

## CI/CD

GitHub Actions ejecuta automáticamente los tests en cada push a `main`/`master`:

```yaml
# .github/workflows/ci.yml
- Instala dependencias
- Ejecuta npm test (127 tests)
- Genera build estático
```

## Monitoreo

Sentry está integrado para capturar errores en producción:

1. Crear cuenta en [sentry.io](https://sentry.io)
2. Crear un proyecto Node.js
3. Configurar `SENTRY_DSN` en las variables de entorno de Vercel

## Licencia

ISC
