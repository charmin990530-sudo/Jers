/**
 * validar-subruta.js — la unica forma de reescribir `req.url` en el shim de Vercel.
 * Vive fuera de api/ para que Vercel no lo publique como otra función HTTP.
 *
 * QUE HACE ESTE ARCHIVO Y POR QUE ESTA SEPARADO
 * --------------------------------------------
 * `api/index.js` no se puede importar en un test: al cargarse hace
 * `await import('../backend/src/app.js')`, que valida la configuracion de produccion
 * y arranca la app entera. Para poder comprobar una expresion regular —que es lo
 * unico que hay aqui— no tiene sentido arrastrar todo eso, asi que el patron y el
 * nombre del error viven en un modulo aparte, sin dependencias, que se importa y se
 * prueba en seco.
 *
 * EL PROBLEMA QUE RESUELVE (B-33)
 * -------------------------------
 * Vercel enruta `/api/health` a `/api?path=health`, asi que el shim reconstruye
 * `req.url` con la subruta de la query. Esa subruta llegaba sin validar: la auditoría
 * encontró que `/api/foo/../admin` no Salta la guarda de `%2f` de
 * `security.js` (la URL ya viene reescrita) y `path-to-regexp` lo trata como un
 * literal, asi que el resultado era un 404 en vez de un 400. Sin bypass, pero
 * tampoco ninguna señal de que la peticion estaba mal formada: es el 404 de
 * "no existe", no el de "has pedido algo que no tiene sentido".
 *
 * El patrón acepta los tres segmentos de una subruta real
 * (`health`, `products/:id`, `admin/categorias/:id/check-products`) y rechaza
 * puntos, `..`, barras duplicadas y cualquier cosa que no sea un identificador.
 * Esta en modo estricto a proposito: si mañana se anade una ruta con un guion doble
 * o un punto en el slug, este test avisa y se actualiza el patrón. Prefiere
 * romperse a dejar pasar lo que no debe.
 */

/** Cuatro niveles es el caso más largo que existe hoy (`admin/categorias/:id/check-products`). */
const MAX_SEGMENTOS = 4;

const SUBRUTA_VALIDA = new RegExp(`^[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+){0,${MAX_SEGMENTOS - 1}}$`);

/** Código de error propio, para que el cliente sepa que el fallo es de la ruta y no de auth. */
export const INVALID_API_PATH = 'INVALID_API_PATH';

/**
 * @param {string} subruta - La subruta que llega en `req.query.path`.
 * @returns {{ok: true, ruta: string} | {ok: false, mensaje: string}}
 */
export const validarSubruta = subruta => {
  if (SUBRUTA_VALIDA.test(subruta)) {
    return { ok: true, ruta: `/api/${subruta}` };
  }
  return {
    ok: false,
    mensaje: `Ruta de API no válida. Se admiten hasta ${MAX_SEGMENTOS} segmentos de letras, digitos, guion y guion bajo.`,
  };
};

/** Exportado para el test, que necesita comprobar el patrón sin montar la app. */
export const patronSubruta = SUBRUTA_VALIDA;
