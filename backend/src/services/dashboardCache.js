/**
 * dashboardCache.js - Cache en memoria de las estadísticas del panel admin
 *
 * Las estadísticas del dashboard son agregaciones pesadas (5 viajes de red incluida
 * una agregación $facet sobre toda la colección de pedidos). El panel se reabre
 * cada pocos segundos y, sin caché, cada visita martillaba la base aunque nadie
 * hubiera tocado un pedido desde la anterior.
 *
 * La caché se invalida en CADA mutación de pedidos (crear, marcar pagado,
 * cancelar, cambiar estado) desde los controllers correspondientes, así que los
 * valores siempre reflejan el último cambio y los tests que leen el dashboard
 * antes/después de un cambio ven los números correctos.
 */

const TTL_MS = 45_000;

let cache = { expiresAt: 0, payload: null };

/** Devuelve las stats cacheadas si aún son válidas, o null. */
export const leerCacheDashboard = () => {
  if (cache.payload && Date.now() < cache.expiresAt) {
    return cache.payload;
  }
  return null;
};

/** Guarda las stats y reinicia el TTL. */
export const escribirCacheDashboard = stats => {
  cache = { expiresAt: Date.now() + TTL_MS, payload: stats };
};

/** Invalida la caché. Llamar en cada creación/actualización/cancelación de pedido. */
export const invalidarCacheDashboard = () => {
  cache = { expiresAt: 0, payload: null };
};
