/**
 * config.js - Configuración del frontend
 *
 * ORIGEN ÚNICO
 * ------------
 * La API y el sitio se sirven desde el mismo Express (ver backend/src/app.js), asi
 * que el navegador solo habla con un origen. Por eso la URL de la API se deriva
 * de `window.location.origin` y NO hay ningun puerto escrito en el codigo.
 *
 * Antes estaba `http://localhost:3000/api` fijo para desarrollo y
 * `${origin}/api` para produccion, guardado en una condicion segun el hostname.
 * Eso era una fuente de fallos silenciosos: si el backend arrancaba en otro
 * puerto, el sitio no se enteraba y cada fetch fallaba con "No se puede conectar
 * con el servidor" sin decir por que. Ahora funciona en cualquier puerto porque
 * no hay ninguno escrito.
 *
 * Se mantiene el override manual (variable global o meta tag) por si alguien
 * sirve el frontend desde otro host a proposito.
 */

const normalizar = valor => {
    try {
        const url = new URL(valor);
        // Si alguien pega "https://host/api" se respeta; si pega "https://host"
        // se le anade /api.
        const ruta = url.pathname.replace(/\/+$/, '');
        if (ruta !== '/api' && !ruta.endsWith('/api')) url.pathname = `${ruta}/api`;
        return url.toString().replace(/\/$/, '');
    } catch {
        return null;
    }
};

const obtenerApiBaseUrl = () => {
    // 1) Variable global seteada antes de cargar este modulo.
    if (typeof window !== 'undefined' && window.API_BASE_URL) {
        const desdeGlobal = normalizar(window.API_BASE_URL);
        if (desdeGlobal) return desdeGlobal;
    }
    // 2) Meta tag en el HTML.
    if (typeof document !== 'undefined') {
        const meta = document.querySelector('meta[name="api-base-url"]');
        if (meta?.content) {
            const desdeMeta = normalizar(meta.content);
            if (desdeMeta) return desdeMeta;
        }
    }
    // 3) Origen actual. Funciona igual en desarrollo y en produccion.
    if (typeof window !== 'undefined' && window.location?.origin) {
        return `${window.location.origin}/api`;
    }
    // Ultimo recurso (scripts fuera del navegador, pruebas en Node).
    return 'http://localhost:3000/api';
};

export const API_BASE_URL = obtenerApiBaseUrl();

/** Moneda de la tienda: pesos colombianos, sin decimales. */
const formateadorPesos = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
});

/**
 * Formatea un importe como pesos colombianos.
 *
 * Existe por un motivo concreto: el catalogo y el carrito se pintaban con
 * `$${precio.toLocaleString('es-CO')}`, y si `precio` llegaba como undefined o
 * como texto desde una respuesta parcial, la pagina mostraba "$undefined" o
 * "$NaN" al cliente. Aqui se normaliza antes de formatear y SIEMPRE se devuelve
 * un texto valido.
 *
 * @param {number|string|null|undefined} valor
 * @returns {string} p.ej. "$58.000"
 */
export const formatearPrecio = valor => {
    const numero = typeof valor === 'string' ? Number(valor) : valor;
    if (typeof numero !== 'number' || !Number.isFinite(numero)) return '—';
    return formateadorPesos.format(Math.round(numero));
};

export const CONFIG = {
    SESSION_EXPIRY_MS: 7 * 24 * 60 * 60 * 1000,

    // Número de WhatsApp para contacto (mismo criterio: valor por defecto y
    // override explícito).
    WHATSAPP_NUMBER: (typeof window !== 'undefined' && window.WHATSAPP_NUMBER)
        ? window.WHATSAPP_NUMBER
        : (typeof document !== 'undefined' && document.querySelector('meta[name="whatsapp-number"]')?.content)
            ? document.querySelector('meta[name="whatsapp-number"]').content
            : '573114333561',
};
