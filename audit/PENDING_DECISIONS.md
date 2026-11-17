# Decisiones pendientes antes de producción

No se aplicaron cambios que impliquen alterar contratos comerciales, información fiscal/legal, disponibilidad del inventario, cuentas externas o datos persistidos. Recomendación marcada por tema; el responsable del negocio debe resolverlos.

| ID | Qué falta | Recomendación y opciones | Por qué no se aplicó |
|---|---|---|---|
| SEC-01 / SEC-02 | Dos contraseñas literales históricas de la colección de prueba; validez/reuso no verificados. | Identificar titular y sistemas donde pudieron reutilizarse; rotarlas y revocar sesiones si siguen activas. Si solo eran fixtures, dejar evidencia del dueño y fecha de revocación. | Rotar cuentas externas o cambiar historia Git afecta usuarios/equipos y no hay acceso/autorización ni prueba de titularidad. Los valores se omitieron. |
| PAY-01 | Método de pago es WhatsApp; no hay gateway/webhooks. | A) Mantener pago manual con conciliación documentada y comprobante auditado. B) Elegir adquirente y desarrollar su flujo sandbox antes de activar cobros. | No se puede inventar proveedor, credenciales, contrato ni política de cancelación. |
| LEG-01 / TAX-01 | El precio de catálogo es pre-impuestos; tasa y obligación fiscal por producto/vendedor no confirmadas. | Consultar contador sobre RUT/responsabilidad, bienes gravados/exentos, inclusión de impuestos en precio exhibido, factura electrónica y tratamiento de descuento/envío; luego fijar reglas SKU por SKU. | Cambiar totales, históricos o precios publicados puede afectar dinero y cumplimiento. Referencias en el informe; no es dictamen legal. |
| PRIV-01 | Faltan política de datos, términos, devoluciones/envíos y canal de derechos; no se conoce responsable/encargados/retención. | Responsable aprueba textos, finalidades, contacto, derechos, retención, proveedores y consentimiento antes de capturar clientes. | No redactar compromisos comerciales o legales a nombre del negocio sin datos del responsable. |
| INV-01 | Pedido pendiente descuenta stock indefinidamente. | Definir TTL, expiración, pago tardío, reserva/reversión y notificación. Luego implementar con transacción/job, prueba de concurrencia, ensayo de migración/rollback sobre copia. | Cambio afecta stock/pedidos reales y requiere regla de negocio y despliegue con datos. |
| DATA-01 | `precioAnterior` decimal podría pasar validación de modelo directa. | Auditar snapshot de datos y export/backup; normalizar inválidos en copia; corregir validador y desplegar con validación/rollback. | Corregir solo el validador podría descubrir/romper datos existentes. |
| MAIL-01 | Envío de correo posterior al commit no durable. | Añadir outbox transaccional, worker con backoff/idempotencia/alertas y prueba de caída; alternativamente declarar correo best-effort y monitorear. | Requiere proceso persistente y elección de servicio/operación. |
| ADMIN-01 | `estadoPago` puede ser cambiado por admin; sin historial contable detallado/MFA. | Separar rol y acción de conciliación, registrar actor/fecha/evidencia inmutable; definir MFA para cuentas admin. | Requiere flujo de aprobación y acceso real de operadores. |
| DEV-01 | 53 vulnerabilidades altas solo en dependencias dev/test de npm. | Plan de actualización mayor: Jest 29→30 y Angular CLI/build tooling compatible; revisar todos los `fixAvailable`, locks, pruebas, CI y eventual cambio Angular. | Cambios mayores pueden romper builders/specs; no fue seguro actualizar automáticamente en auditoría general. Runtime audit de ambos paquetes da 0. |
| OPS-01 | Infraestructura externa y recuperación no comprobadas. | Proveer evidencia de dominio/TLS, Vercel variables/rewrites, Mongo replica set, backups cifrados, restore probado, alertas, limitador compartido, logs y rollback. | No hay acceso a cuenta productiva, configuración ni backup; no se fingió una verificación. |
| MAIL-02 | SMTP no configurado/validado; recuperación depende de correo. | Habilitar y probar envío, entrega, recuperación, TLS y alertas o documentar soporte manual seguro. | No hay credenciales ni autorización para enviar correos reales. |

## Secuencia recomendada de desbloqueo

1. Resolver/verificar rotación de credenciales históricas y activar MFA de admin.
2. Confirmar responsable legal/fiscal, políticas públicas, precio final e impuestos.
3. Decidir forma de pago y política de pedidos no pagados; seleccionar pasarela solo si aplica.
4. Aprobar cambios de datos/inventario con backup verificable, ensayo de restore y plan de rollback.
5. Validar gateway/SMTP/hosting en sandbox/cuenta real bajo control del responsable; después considerar lanzamiento limitado.
