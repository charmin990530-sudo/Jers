# Demo de portafolio de By Jers

Esta variante sirve el frontend sin publicar Express, MongoDB ni secretos. El catálogo usa únicamente los 14 productos del seed público. `demo.js` atiende las consultas de lectura en el navegador y rechaza operaciones de escritura. No se transmiten formularios a una API ni se crean usuarios o pedidos.

## Compilar

Desde la raíz, con Node.js 22:

```sh
npm ci
npm ci --prefix frontend/angular
npm run build:demo
```

La salida está en `frontend/public`. Incluye rutas físicas para abrir directamente la tienda, los catálogos y los productos en hosts estáticos. Publicar solamente esa carpeta; no publicar la raíz del repositorio ni ejecutar `api/index.js` en este despliegue visual.

La demo publicada está en https://by-jers-demo-juan-david.brightmanta3.chatgpt.site.

## Vercel como alternativa

Después de compilar, se puede importar la carpeta generada como sitio estático con Vercel CLI, ejecutando `vercel` dentro de `frontend/public`. Utilizar un proyecto de demo separado, sin variables de entorno de producción. No hace falta contratar un plan para preparar los archivos; cualquier condición económica que presente el proveedor debe revisarse antes de aceptarla.

El `vercel.json` de la raíz corresponde al proyecto completo y permanece sin cambios. `npm run build:static` sigue generando la tienda normal sin la capa de demostración.

## Límites visibles

- Bienvenida, tienda, catálogo con búsqueda, fichas y estudio interactivo disponibles.
- Sin registro, inicio de sesión, contacto, administración, carrito operativo ni checkout.
- Sin pasarela de pagos. Se conserva el código original de pedidos por WhatsApp.
- Los looks pueden guardarse localmente en el navegador, según el comportamiento existente del estudio.

Las capturas de `docs/media` muestran esta variante. El GIF se generó a partir del MP4 original del repositorio; no sustituye una grabación de pantalla del checkout.
