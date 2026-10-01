/**
 * config.js - Configuración del frontend
 *
 * ORIGEN ÚNICO, UN SOLO PUERTO
 * -----------------------------
 * La API y el sitio se sirven desde el mismo Express (ver backend/src/app.js), asi
 * que el navegador solo habla con un origen y un puerto. Por eso la URL de la API
 * se deriva de `window.location.origin` y NO hay ningun puerto escrito en el codigo.
 *
 * El puerto de desarrollo es 3000, el mismo en `README.md`,
 * `backend/.env.example` y `backend/.env`. En Vercel no hay puerto: `origin` ya
 * es el dominio, y por eso esta regla no necesita un caso especial para
 * produccion.
 *
 * Antes había `http://localhost:3000/api` fijo para desarrollo y
 * `${origin}/api` para produccion, guardado en una condicion segun el hostname,
 * y otra condicion mas que mandaba a un 3001. Eso era una fuente de fallos
 * silenciosos: si el backend arrancaba en otro puerto, el sitio no se enteraba y
 * cada fetch fallaba con "No se puede conectar con el servidor" sin decir por
 * que. Ahora funciona en cualquier puerto porque no hay ninguno escrito.
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
    //
    // AQUÍ NO HAY NINGÚN PUERTO ESCRITO, y esa es la regla del proyecto: el
    // sitio y la API se sirven desde el mismo Express (backend/src/app.js), así
    // que el puerto de desarrollo es el mismo en los dos. En producción es
    // todavía más simple, porque en Vercel no hay puerto: `origin` ya es
    // `https://byjers.com`.
    //
    // Antes había una excepción aquí: si el origen era :3000, :5173 o :5500 se
    // mandaba todo a `http://localhost:3001/api`. Venía de la arquitectura de
    // dos procesos, y era una trampa: con el backend en el 3001 y el sitio en
    // el 3000 era lo único que hacía que la tienda funcionara, pero en cuanto
    // el backend se movía al 3000 (que es lo que dicen el README y
    // `backend/.env.example`) la web pedía al 3001 y no encontraba nada, sin
    // más rastro que un "No se puede conectar con el servidor". Con el puerto
    // unificado en 3000, `${origin}/api` acierta siempre y no hay nada que
    // mantener sincronizado.
    if (typeof window !== 'undefined' && window.location?.origin) {
        return `${window.location.origin}/api`;
    }
    // Último recurso: scripts fuera del navegador (Node, pruebas). Solo aplica
    // cuando no hay `window`, así que no puede desincronizarse del navegador.
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

// ---------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------
const FECHA_LARGA = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
const FECHA_CORTA = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Formatea una fecha sin arriesgar "Invalid Date" en pantalla.
 *
 * Antes cada pantalla hacía `new Date(algo).toLocaleDateString('es-CO')`. Si el
 * backend devolvía `createdAt: null` o un formato inesperado, el resultado era
 * literalmente "Invalid Date" o "NaN de NaN de NaN" en la tabla de pedidos.
 * Aquí se valida antes de formatear y, si no hay fecha usable, se devuelve "—".
 *
 * @param {string|number|Date|null|undefined} valor
 * @param {'larga'|'corta'|'hora'} [estilo]
 * @returns {string}
 */
export const formatearFecha = (valor, estilo = 'corta') => {
    if (valor === null || valor === undefined || valor === '') return '—';
    const fecha = valor instanceof Date ? valor : new Date(valor);
    if (Number.isNaN(fecha.getTime())) return '—';
    if (estilo === 'larga') return FECHA_LARGA.format(fecha);
    if (estilo === 'hora') return FECHA_HORA.format(fecha);
    return FECHA_CORTA.format(fecha);
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
