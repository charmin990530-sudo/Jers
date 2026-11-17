# Cambios aplicados

Todos los cambios se realizaron en `audit/full-review`. El commit inicial de respaldo es `49a2f94` (árbol inicial limpio). No se subieron commits ni se tocó una base de datos de producción.

| Commit | Grupo | Cambio | Verificación |
|---|---|---|---|
| `efa0138` | `fix(checkout)` | Revalida precio antes de reservar stock; conflicto responde 409 y no crea pedido ni descuenta inventario. | Regresión del cambio entre cotización y claim; suite backend. |
| `dcf028d` | `fix(admin)` | Excluye pagos reembolsados/cancelados del ingreso del dashboard. | Regresión para pedido pagado y luego reembolsado. |
| `800ef3e` | `fix(orders)` | Incluye nombre, monto y etiqueta de descuento en emails HTML/texto. | Tres pruebas de plantillas. |
| `e86ad32` | `fix(deploy)` | Rewrite directo de `/estudio` y revalidación de imágenes editables. | Dos pruebas del Vercel config. |
| `795f6b3` | `fix(security)` | Respuesta pública de configuración incompleta ya no filtra nombres/detalles internos. | Prueba de proceso en modo producción con entorno ficticio. |
| `629fb4e` | `fix(frontend)` | Timeout de 15 s incluye lectura del body; error de pedido aconseja revisar historial. | Dos pruebas Angular con conexión/body suspendidos. |
| `83ec4a1` | `fix(admin)` | Refresca resumen y listados al volver a tabs del panel. | Dos pruebas Angular. |
| `4726b5d` | `fix(ux)` | Precio de producto aclara que IVA/envío se desglosan en checkout. | Build y E2E de producto; pendiente cumplimiento de precio final. |
| `ece0333` | `test(e2e)` | Fixture Mongo replica efímera y recorrido Playwright de registro, catálogo, recompensa, checkout, pedido, conciliación manual, admin y viewport. | Chromium: 84 checks, 0 excepciones. No usa gateway real. |
| pendiente de commit | `fix(deps)` | Actualiza lock Angular dentro del rango compatible: CLI/build/devkit 20.3.42→20.3.43 y dependencias transitivas compatibles. Sin `--force`; no cambia `package.json`. | Lint/type-check/build pasan, Angular 94/94 pasa. Angular full audit 19→18 high; runtime audit sigue 0. |

## Cambios de verificación

- Base: 383 backend / 90 Angular aprobados. Final: 391 backend / 94 Angular aprobados.
- `npm run lint`, `npm run typecheck`, `npm run build:static`: pasan tras cambios; bundle inicial 329.87 kB bruto, estimado 91.26 kB transferido; build genera 80 archivos.
- Auditoría npm final: 0 vulnerabilidades en dependencias runtime (root y frontend); 34 + 18 vulnerabilidades altas en herramientas dev/test (Jest/Angular/Karma) pendientes de remediación.
- No se instalaron dependencias nuevas ni se cambiaron variables reales. No se ejecutó pago real, correo real, migración, seed o escritura a Mongo persistente.
- Auditoría de secretos: gitleaks 0 hallazgos en 132 commits; inspección estructurada adicional detectó 2 contraseñas literales en objeto histórico de prueba. No se copian los valores a este documento.
