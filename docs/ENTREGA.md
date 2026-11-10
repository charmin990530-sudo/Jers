# By Jers — versión para demostración académica

## Ejecutar

1. Instalar Node.js y MongoDB local. La versión comprobada de Node.js fue 22.23.4.
2. En la raíz: `npm ci` y `npm ci --prefix frontend/angular`.
3. Copiar `backend/.env.example` a `backend/.env` y configurar MongoDB y una clave JWT propia.
4. En una base nueva de demostración, ejecutar `npm run seed`. Este paso es para una base de prueba: no ejecutarlo sobre datos que se quieran conservar.
5. Ejecutar `npm start` y abrir http://127.0.0.1:3000/.

En el equipo donde se desarrolló, el servicio ya sirve la tienda en ese puerto.

## Recorrido para presentar

- Mostrar la portada: fotografía original, labial y polvera tridimensionales, luces y movimiento. El botón permite pausar la animación. Al ocultar la pestaña o salir de la portada, se detiene el renderizado.
- Abrir Maquillaje y Cabello. Ambos agrupan las categorías reales de MongoDB.
- Buscar un producto y abrir su detalle.
- Crear una cuenta de demostración, iniciar sesión y añadir un producto al carrito.
- Cambiar la cantidad y pasar al checkout.
- Confirmar el pedido, mostrarlo en Mis pedidos y cancelarlo. La cancelación devuelve el stock cuando corresponde.
- Entrar en `/admin` con una cuenta de administrador: cambiar el stock o el precio de un producto y guardar. El cambio se ve en el catálogo de inmediato.

## Arquitectura

Angular 20 con componentes standalone y rutas de carga diferida; Three.js para la portada. Express expone la API y sirve el build de Angular desde el mismo origen. MongoDB guarda usuarios, productos, carritos y pedidos. La sesión utiliza una cookie HttpOnly y las peticiones de escritura requieren CSRF. Los pedidos llevan clave de idempotencia y control de inventario.

## Verificación del 10 de noviembre de 2026

- Backend: 285 pruebas en 20 suites aprobadas.
- Angular: 28 pruebas aprobadas en navegador.
- Frontend anterior: 43 pruebas aprobadas.
- Compilación de producción y `npm run check`: aprobados.
- Recorrido con navegador real (Chromium) y MongoDB temporal: registro, catálogo, carrito, cambio de cantidad, checkout, creación de un único pedido, historial, cancelación con devolución de stock, edición de stock en el panel. 17/17 comprobaciones, sin errores de JavaScript.
- Recorrido por API contra MongoDB temporal: 52/52 comprobaciones.
- `npm audit --omit=dev`: sin avisos conocidos en las dependencias de producción de la raíz/backend y de Angular. Esto no sustituye una auditoría completa de seguridad; las dependencias de desarrollo tienen avisos pendientes.

El detalle de la auditoría y de las correcciones está en `docs/AUDITORIA-2026-11-10.md`.

## Alcance pendiente

El pago actual se confirma por WhatsApp; no se integró una pasarela de cobro. La modelo sigue siendo una fotografía original acompañada de objetos 3D; no se generó un nuevo video de su rostro. El panel administrativo de Angular permite consultar y editar precio, stock y visibilidad de los productos y cambiar el estado de los pedidos, pero **no** permite dar de alta productos, categorías ni marcas. Tampoco hay pantallas propias de perfil, direcciones ni contacto: sus rutas antiguas redirigen a «Mis pedidos», aunque la API las soporta. Esas áreas requieren otra iteración antes de usar la tienda en producción.
