# Checklist de salida a producción

No marcar como completado por inferencia: este repositorio no da acceso al panel del hosting ni a las cuentas externas.

## Código y build

- [x] Rama aislada `audit/full-review`; snapshot inicial `49a2f94`; cambios en commits atómicos.
- [x] Lint, type-check, build, 391 tests backend, 94 frontend.
- [x] Checkout valida precio y stock desde servidor; suite con Mongo replica set efímero.
- [x] Bundle producción: 329.87 kB inicial bruto / 91.26 kB estimado comprimido; 80 assets.
- [x] Auditoría runtime npm: 0 vulnerabilidades reportadas en root y frontend, al 17-11-2026.
- [ ] Resolver toolchain: 34 vulnerabilidades altas backend + 19 Angular en dependencias dev/test.
- [ ] Integrar E2E Chromium en CI con navegador/versión reproducible; WebKit no se pudo verificar: binario ausente.

## Cuentas, secretos y seguridad

- [ ] Revisar contraseñas antiguas de la colección de pruebas con sus titulares; rotar/revocar donde aplique y comprobar MFA admin.
- [ ] Crear secretos productivos nuevos por gestor de secretos: `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, `MONGODB_URI`, `FRONTEND_ALLOWED_ORIGINS`, configuración de cookies/CSRF y limitador compartido; verificar sin copiar valores a Git/logs.
- [ ] Confirmar `NODE_ENV=production`, `SECRETS_FROM_ENV=true`, HTTPS, `COOKIE_SECURE=true`, dominio/orígenes exactos y `TRUST_PROXY` de acuerdo con hosting.
- [ ] Verificar que health público no entregue token/configuración; preparar probe de readiness de DB restringido.
- [ ] Configurar rate limit persistente compartido para todas las instancias. No usar almacenamiento en memoria en multi-instancia.
- [ ] Probar headers, CORS, CSP y cookies en dominio de staging real.
- [ ] Auditoría runtime cero no reemplaza monitoreo periódico; ejecutar `npm audit --omit=dev` en CI por lockfile.

## Producto, dinero y datos

- [ ] Contador/responsable legal confirma IVA por SKU, precio total exhibido, envío/descuento, obligaciones y facturación DIAN.
- [ ] Publicar y enlazar términos, privacidad, devoluciones y envíos desde footer, alta y checkout; validar Ley 1581/consentimiento.
- [ ] Elegir flujo de pago. Si es pasarela: sandbox, firma de webhook, replay/idempotencia, pago duplicado/fallido, expiración, reembolso y pruebas de extremo a extremo antes de activar credenciales live.
- [ ] Definir caducidad de pedidos pendientes y devolución de stock; ensayar bajo concurrencia.
- [ ] Inspeccionar `precioAnterior` y registros con decimales en copia de producción antes de corregir validación.
- [ ] Confirmar emails SMTP y recuperación de cuenta, o procedimiento alternativo; evaluar cola/outbox y alertas.

## Plataforma y operación

- [ ] Verificar MongoDB productivo replica set, índices, acceso mínimo, TLS y límites de conexión.
- [ ] Configurar backups automáticos cifrados, retención, RPO/RTO y ensayar restore completo en entorno aislado.
- [ ] Configurar alertas para error/API, latencia, DB, límites, entrega de correo y fallo de checkout; revisar saneamiento de datos de logs.
- [ ] Verificar dominio, DNS, certificado, redirección HTTPS, rewrites Vercel, assets y rutas SPA desde el dominio real.
- [ ] Probar sandbox con pedido de extremo a extremo; confirmar que no entra en ambiente de cobro live.
- [ ] Acordar rollback: redeploy del artefacto anterior/commit estable, confirmar compatibilidad de esquema; evitar revertir datos financieros automáticamente.
- [ ] Hacer smoke test real autorizado: registro, búsqueda, carrito, descuento, checkout, confirmación, historial y panel. La auditoría local no sustituye esta prueba.
- [ ] Medir RUM/Core Web Vitals en usuarios reales; revisar CLS en producto/admin (fixture local >0.1) y accesibilidad con teclado/lector de pantalla.

**Estado:** lanzamiento condicionado. El flujo local está probado, pero pago/tributos/políticas, rotación de credenciales, stock pendiente e infraestructura real deben cerrarse primero.
