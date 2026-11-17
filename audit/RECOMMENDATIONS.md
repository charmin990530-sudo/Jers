# Recomendaciones a mediano plazo

Ordenadas por reducción de riesgo/beneficio después de las decisiones de salida.

## Prioridad alta

1. **Durabilidad de pedidos y notificaciones:** outbox Mongo dentro de transacción, worker y reintentos idempotentes; añadir expiración de pedidos pendientes según política aprobada y recuperación de stock auditada.
2. **Mejor cobertura de reglas monetarias:** elevar cobertura de backend desde 26.66% de líneas; priorizar concurrencia de último artículo, errores/timeout de proveedor, permisos admin, cancelación/reembolso, límites de descuentos y fixtures de zona horaria.
3. **Toolchain segura:** resolver 34 advisories high del árbol Jest y 19 del Angular build/test; migrar en ramas pequeñas, mantener lockfiles, publicar resultados `npm audit --omit=dev` y full audit en CI.
4. **Operación verificable:** readiness, métricas p95, trazas con request ID, alertas, runbooks, backup/restore y rollback probado en staging. Hacer load test del checkout/ratelimit antes de campañas.
5. **Precio y catálogo:** representar impuestos por producto, asegurar importe final exhibido, gestionar precio promocional y cambios de moneda como reglas explícitas en servidor.

## Prioridad media

6. **Core Web Vitals:** localizar las fuentes de CLS de producto (0.202) y admin (0.188) en grabación de producción; reservar espacio para imágenes/estados asíncronos, luego contrastar p75 de campo. El LCP local rápido no es garantía de campo.
7. **SEO e indexación:** SSR/prerender de páginas de producto, metadata/canonical/OG únicos, Product/Offer/Breadcrumb JSON-LD, sitemap dinámico, y respuestas 404/301 para productos retirados.
8. **UX del catálogo/admin:** ofrecer los filtros y orden ya soportados por API; paginar tablas de administración en lugar de limitar el cliente a la página inicial.
9. **Accesibilidad:** auditoría WCAG 2.2 AA con teclado y lector de pantalla, estados live de formularios/stock, contraste y zoom; la revisión automatizada/responsive de esta auditoría es parcial.
10. **Privacidad:** calendario de retención y borrado/anonimización coherente con obligaciones contables, separación de datos de analítica y registro de consentimientos.

## Prioridad baja / según producto

11. Carrito abandonado, seguimiento promocional y analítica únicamente después de definir consentimiento, retención y proveedor.
12. Variantes (tono/tamaño) si el catálogo las necesita; no tratar imágenes o URL como sustituto de una variante con precio/stock propio.
13. Revisar dependencias obsoletas/cambios mayores trimestralmente; no actualizar automáticamente Express/Mongoose/Angular sin pruebas y notas de migración.
14. Afinar lint de TypeScript/formato, subir cobertura de plantillas y eliminar warning de fuente de Karma copiando assets o mockeando `document.fonts`.
