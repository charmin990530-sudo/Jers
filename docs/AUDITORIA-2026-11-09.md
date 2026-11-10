# Auditoría inicial — 9 de noviembre de 2026

Alcance: revisión inicial de arranque, integración de Angular, catálogo y ejecución de las pruebas existentes. No equivale a una auditoría completa de seguridad ni a una validación manual de todos los flujos de compra.

## Verificado

- Angular compila en producción: carga inicial de aproximadamente 299 kB sin comprimir.
- `npm run check` pasa, incluyendo ahora la comprobación de tipos de la aplicación Angular y sus especificaciones.
- Backend: 17 suites, 268 pruebas aprobadas con MongoDB temporal en replica set. No se utilizó la base del usuario para las pruebas.
- Frontend anterior: 3 suites, 43 pruebas aprobadas. No cubren Angular.
- Servidor local: `/api/health` informa MongoDB conectado; `/api/products/featured` responde con 8 productos.
- La imagen de portada, los videos existentes y el índice de Angular están en la salida preparada.

## Problemas corregidos en esta revisión

1. El preparador copiaba un `dist` anterior sin recompilar. Si no encontraba el build, podía publicar silenciosamente el frontend anterior. Ahora compila Angular antes de reemplazar la salida y se detiene si falla la compilación.
2. El servidor de desarrollo de Angular no incluía las imágenes y videos heredados. Ahora los recursos están en la configuración de assets de Angular tanto para build como para pruebas.
3. Angular en el puerto 4200 llamaba a su propio `/api` sin proxy. Se añadió `proxy.conf.json` para reenviar a Express en 127.0.0.1:3000.
4. CI y Vercel no instalaban las dependencias independientes de Angular. Se añadió su instalación con el lockfile correspondiente.
5. La comprobación de tipos raíz no incluía Angular. Se añadió `check:angular`.

## Gráfica

Equipo en modo híbrido: Intel UHD 630 y NVIDIA GTX 1050 de 4 GB. OpenGL de NVIDIA respondió correctamente con PRIME. Se añadió `npm run preview:gpu`, que solicita NVIDIA en un navegador con perfil independiente. La solicitud no garantiza qué renderizador elegirá cada navegador. El panel separado de seguimiento muestra el renderizador WebGL y la telemetría de NVIDIA.

## Pendiente

- Portada de maquillaje: actualmente sigue siendo una imagen fija. No se ha generado un video nuevo ni implementado una modelo 3D.
- El lookbook actual usa imágenes y transiciones; no contiene una escena Three.js aunque las notas anteriores lo describían como 3D.
- Completar cobertura de flujos Angular: sesión, carrito, checkout y administración.
- El panel Angular de administración lista productos; faltan los formularios de gestión que sí existían en el frontend anterior.
- Perfil, direcciones, contacto y recuperación de contraseña requieren revisar la migración: algunas rutas antiguas redirigen a otras pantallas.
- Revisar carreras de conexión/reconexión MongoDB en `connectDB`, paginación del catálogo y respuestas HTTP 200 que no contienen JSON en el cliente Angular.
- Auditoría de dependencias y revisión completa de autorización, configuración de producción y recuperación ante fallas.

## Arranque

Desde la raíz: `npm start`. Para desarrollo Angular con recarga: mantener Express encendido y ejecutar `npm run dev:frontend`, luego abrir http://localhost:4200/.

Panel de seguimiento separado: `/home/juandagamer/Escritorio/by-jers-en-vivo`, `npm start`, http://127.0.0.1:4317/. No cambia el diseño de la tienda.


## Actualización del 10 de noviembre: correcciones y portada

Se corrigió la consulta de grupos maquillaje/cabello, que antes devolvía 404. El catálogo tiene paginación y búsqueda en el servidor, e ignora respuestas antiguas al cambiar de categoría. El carrito respeta stock y límite 99 y evita escrituras simultáneas. Checkout evita dobles envíos y mantiene el formulario visible ante errores. El cliente rechaza HTML con HTTP 200, preserva la sesión si falla el logout e ignora respuestas de sesión antiguas.

MongoDB espera el intento compartido de conexión y vuelve a intentar tras una desconexión. Se actualizaron las dependencias compatibles, se migró Zod a 4.6.7 adaptando sus errores y se verificaron 278 pruebas del backend y 18 de Angular. La auditoría npm de producción quedó en cero avisos conocidos; quedan avisos en herramientas de desarrollo.

La portada ya incluye la fotografía original con cosméticos 3D procedurales en Three.js, movimiento de cámara, iluminación y control de pausa. Se comprobó en NVIDIA, escritorio y móvil. El video nuevo y la reconstrucción 3D de la persona siguen pendientes.

Ver docs/ENTREGA.md para el alcance final y el recorrido de demostración. Las listas de pendientes anteriores describen el estado inicial y se actualizan con este apartado.
