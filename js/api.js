/**
 * api.js - ÚNICA capa de comunicación con el backend
 *
 * POR QUÉ UN SOLO MÓDULO
 * ----------------------
 * Antes había dos implementaciones de `request()` casi idénticas (apiClient.js
 * y auth.js), cada una con su propio manejo del sobre de error, del CSRF y de
 * la sesión caducada. Eso producía tres síntomas distintos según qué importaba
 * la página:
 *
 *  - unas leían `data.message` y otras `data.error.message`;
 *  - unas trataban un 401 como "no hay sesión" y otras solo como error genérico,
 *    así que una sesión caducada dejaba la interfaz medio rota;
 *  - y el CSRF se reimplementaba en js/csrf.js con otro `fetch`.
 *
 * Aquí no hay nada de eso: una sola función de red, un solo formato de respuesta
 * y una sola política ante la expiración de sesión.
 *
 * CONTRATO DE RESPUESTA
 * ---------------------
 * Todas las funciones devuelven `{ ok, msg, data }`:
 *   - `ok: true`  -> `data` es el cuerpo de la respuesta.
 *   - `ok: false` -> `msg` es el mensaje de `error.message` y `data` trae
 *                    `{ code, details, errors, status, requestId }`.
 *
 * Nunca lanzan: una pantalla no debería romperse por un fallo de red.
 */

import { API_BASE_URL } from './config.js';

// ---------------------------------------------------------------
// Estado de sesión en el cliente
// ---------------------------------------------------------------
let usuarioActual = null;
let expirada = false;
const oyentesSesion = new Set();

/** Suscríbete a los cambios de sesión. Devuelve la función para desuscribirse. */
export const alCambiarSesion = fn => {
    oyentesSesion.add(fn);
    return () => oyentesSesion.delete(fn);
};

const notificarSesion = usuario => {
    usuarioActual = usuario || null;
    oyentesSesion.forEach(fn => {
        try { fn(usuarioActual); } catch (e) { console.error('[api] oyente de sesión falló', e); }
    });
};

/** Usuario en caché, si se conoce. `null` hasta que se llame a `getMe()`. */
export const obtenerUsuario = () => usuarioActual;

/**
 * Códigos que significan "tu sesión ya no vale". Ante cualquiera de ellos se
 * limpia el estado local y se manda al login, en vez de dejar la pantalla a medias
 * con un error que el usuario no entiende.
 */
const CODIGOS_SESION = new Set([
    'UNAUTHENTICATED',
    'INVALID_TOKEN',
    'TOKEN_EXPIRED',
    'TOKEN_REVOKED',
    'USER_NOT_FOUND',
]);

let redirigiendo = false;

/**
 * Cierra la sesión en el cliente y lleva al login conservando la página actual,
 * para que al volver a entrar el usuario siga donde estaba.
 */
export const irAlLogin = () => {
    if (typeof window === 'undefined') return;
    if (redirigiendo) return;               // evita bucles si hay varias rutas en vuelo
    const actual = window.location.pathname + window.location.search;
    // Si ya estamos en el login no se redirige: provocaría un refresco infinito.
    if (actual.startsWith('/login') || actual.startsWith('/register')) return;
    redirigiendo = true;
    try { sessionStorage.setItem('auth_redirect_url', actual); } catch { /* modo privado */ }
    window.location.assign(`/login?redirect=${encodeURIComponent(actual)}`);
};

// ---------------------------------------------------------------
// CSRF
// ---------------------------------------------------------------
const CLAVE_CSRF = 'jers_csrf';

const leerCookie = nombre => {
    if (typeof document === 'undefined') return null;
    const prefijo = `${encodeURIComponent(nombre)}=`;
    const hallada = document.cookie.split('; ').find(c => c.startsWith(prefijo));
    return hallada ? decodeURIComponent(hallada.slice(prefijo.length)) : null;
};

const obtenerCsrf = () => leerCookie(CLAVE_CSRF);

/**
 * Devuelve el token CSRF, pidiéndolo al backend solo si no está en cookie.
 *
 * Va aquí y no en un módulo aparte porque forma parte de la política de red:
 * cualquier petición que mute necesita el par cookie + cabecera, y tener el
 * token en dos sitios era una forma de que se desincronizaran.
 */
const asegurarCsrf = async () => {
    const actual = obtenerCsrf();
    if (actual) return actual;
    if (typeof fetch === 'undefined') return null;
    try {
        await request('/auth/csrf', { method: 'GET', requiereCsrf: false });
    } catch {
        return null;
    }
    return obtenerCsrf();
};

// ---------------------------------------------------------------
// Nucleo de red
// ---------------------------------------------------------------
const construirError = (respuesta, cuerpo) => ({
    code: cuerpo?.error?.code || 'UNKNOWN_ERROR',
    message: cuerpo?.error?.message || 'Error inesperado',
    details: cuerpo?.error?.details || cuerpo?.error?.errors || null,
    requestId: cuerpo?.requestId || respuesta.headers.get('X-Request-ID') || null,
    status: respuesta.status,
    // `errors` es alias de `details`: varios formularios recorren
    // error.errors para pintar el mensaje campo a campo.
    errors: cuerpo?.error?.details || cuerpo?.error?.errors || null,
});

/**
 * Petición HTTP. Única puerta de salida a la red.
 *
 * @param {string} endpoint - Ruta relativa a la base, p.ej. '/products'.
 * @param {object} [options]
 * @param {string} [options.method]
 * @param {any}    [options.body]
 * @param {object} [options.headers]
 * @param {boolean}[options.requiereCsrf=true] - false solo para GET/HEAD.
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
export async function request(endpoint, options = {}) {
    const {
        method: metodoCrudo = 'GET',
        body,
        headers: cabecerasExtra = {},
        requiereCsrf = true,
    } = options;

    const metodo = String(metodoCrudo).toUpperCase();
    const muta = !['GET', 'HEAD', 'OPTIONS'].includes(metodo);
    const cabeceras = {
        'X-Requested-With': 'XMLHttpRequest',
        ...cabecerasExtra,
    };

    let cuerpo;
    if (body !== undefined && !(body instanceof FormData) && typeof body !== 'string') {
        cabeceras['Content-Type'] = 'application/json';
        cuerpo = JSON.stringify(body);
    } else if (typeof body === 'string') {
        // El cuerpo ya viene serializado. Sigue siendo JSON salvo que quien
        // llama haya indicado otra cosa, y sin esta cabecera el backend
        // responde 415 a los formularios que usan `apiFetch` con JSON.stringify.
        const declaraContentType = Object.keys(cabeceras)
            .some(k => k.toLowerCase() === 'content-type');
        if (!declaraContentType) cabeceras['Content-Type'] = 'application/json';
        cuerpo = body;
    }

    if (muta && requiereCsrf) {
        const token = await asegurarCsrf();
        if (token) cabeceras['X-CSRF-Token'] = token;
    }

    let respuesta;
    try {
        respuesta = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: metodo,
            // La sesión vive en una cookie HttpOnly: sin credentials no viaja.
            credentials: 'include',
            headers: cabeceras,
            body: cuerpo,
        });
    } catch (error) {
        if (error instanceof TypeError) {
            return {
                ok: false,
                msg: 'No se puede conectar con la tienda. Revisa tu conexión.',
                data: { code: 'NETWORK_ERROR', status: 0, message: error.message },
            };
        }
        return {
            ok: false,
            msg: 'Error inesperado al contacting la tienda.',
            data: { code: 'UNKNOWN_ERROR', status: 0, message: error.message },
        };
    }

    if (respuesta.status === 204) {
        return { ok: true, msg: 'Operación exitosa', data: null };
    }

    let datos = null;
    try {
        datos = await respuesta.json();
    } catch {
        if (respuesta.ok) {
            return { ok: true, msg: 'Operación exitosa', data: null };
        }
        return {
            ok: false,
            msg: 'La tienda devolvió una respuesta que no se pudo leer.',
            data: { code: 'INVALID_RESPONSE', status: respuesta.status },
        };
    }

    if (respuesta.ok) {
        // Un 200 con ok:true no implica sesión: solo getMe lo confirma.
        return { ok: true, msg: datos?.message || 'Operación exitosa', data: datos };
    }

    const error = construirError(respuesta, datos);

    // Sesión caducada o no existente: se limpia el estado local y se avisa.
    //
    // AQUÍ NO SE REDIRIGE. Antes esta capa mandaba al login ante cualquier 401,
    // y eso rompía el carrito de invitado: al preguntar por su carrito (que es de
    // todos modos un 401) el navegador saltaba al login y se perdía la página.
    // Decidir si una pantalla exige sesión es trabajo de `protegerRuta()`.
    //
    // Solo se emite `sesion-caducada` si el usuario TENÍA sesión: así, perderla
    // con la pantalla abierta lleva al login, pero estar invitado no dispara
    // ninguna redirección.
    if (CODIGOS_SESION.has(error.code) && !expirada) {
        const teniaSesion = usuarioActual !== null;
        expirada = true;
        notificarSesion(null);
        if (teniaSesion && typeof window !== 'undefined') {
            window.dispatchEvent(new Event('sesion-caducada'));
        }
    }

    // Si el servidor se reinició y la cookie dejó de valer, el siguiente acierto
    // en una ruta autenticada la vuelve a marcar. Se limpia en cuanto hay sesión.
    if (!CODIGOS_SESION.has(error.code)) expirada = false;

    return { ok: false, msg: error.message, data: error };
}

// ---------------------------------------------------------------
// Auth
// ---------------------------------------------------------------
export const register = async datos => {
    const r = await request('/auth/register', { method: 'POST', body: datos });
    if (r.ok) { expirada = false; notificarSesion(r.data?.user || null); }
    return r;
};

export const login = async credenciales => {
    const r = await request('/auth/login', { method: 'POST', body: credenciales });
    if (r.ok) { expirada = false; notificarSesion(r.data?.user || null); }
    return r;
};

export const logout = async () => {
    const r = await request('/auth/logout', { method: 'POST', body: {} });
    notificarSesion(null);
    expirada = false;
    if (r.ok && typeof window !== 'undefined') window.dispatchEvent(new Event('auth-cambio'));
    return r;
};

/** Usuario actual. Actualiza la caché de sesión, que es la fuente para la UI. */
export const getMe = async () => {
    // Un invitado recibe 401 y sigue viendo la tienda: preguntar por la sesión
    // es legítimo sin estar conectado. Quien sí exige sesión lo dice con
    // `protegerRuta()`.
    const r = await request('/auth/me', { requiereCsrf: false });
    if (r.ok) { expirada = false; notificarSesion(r.data?.user || null); }
    return r;
};

export const forgotPassword = email => request('/auth/forgot-password', { method: 'POST', body: { email } });
export const resetPassword = datos => request('/auth/reset-password', { method: 'POST', body: datos });
export const updateProfile = datos => request('/auth/profile', { method: 'PATCH', body: datos });
export const changePassword = datos => request('/auth/password', { method: 'PATCH', body: datos });
export const addAddress = dir => request('/auth/addresses', { method: 'POST', body: dir });
export const updateAddress = (id, dir) => request(`/auth/addresses/${id}`, { method: 'PATCH', body: dir });
export const deleteAddress = id => request(`/auth/addresses/${id}`, { method: 'DELETE' });

// ---------------------------------------------------------------
// Productos
// ---------------------------------------------------------------
const conQuery = (endpoint, params = {}) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') q.set(k, v);
    }
    const s = q.toString();
    return s ? `${endpoint}?${s}` : endpoint;
};

export const getProducts = (params = {}) => request(conQuery('/products', params), { requiereCsrf: false });
export const getProduct = id => request(`/products/${id}`, { requiereCsrf: false });
export const getFeaturedProducts = () => request('/products/featured', { requiereCsrf: false });
export const getPromoProducts = () => request('/products/promociones', { requiereCsrf: false });
export const getBrands = () => request('/products/marcas', { requiereCsrf: false });
export const getProductsByCategory = (slug, params = {}) =>
    request(conQuery(`/products/categoria/${encodeURIComponent(slug)}`, params), { requiereCsrf: false });

// ---------------------------------------------------------------
// Carrito
// ---------------------------------------------------------------
export const getCart = () => request('/cart', { requiereCsrf: false });
export const addToCart = item => request('/cart', { method: 'POST', body: item });
export const updateCartItem = (itemId, cantidad) => request(`/cart/${itemId}`, { method: 'PATCH', body: { cantidad } });
export const removeFromCart = itemId => request(`/cart/${itemId}`, { method: 'DELETE' });
export const clearCart = () => request('/cart', { method: 'DELETE' });

// ---------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------
export const createOrder = (datos, opciones = {}) => {
    // Acepta las dos formas que se han usado en el proyecto: la explícita
    // `{ idempotencyKey }` y la antigua `{ headers: { 'Idempotency-Key' } }`.
    // Sin esto la cabecera se perdería en silencio y volvería posible cobrar
    // dos veces el mismo pedido con doble clic.
    const clave = opciones.idempotencyKey || opciones.headers?.['Idempotency-Key'];
    return request('/orders', {
        method: 'POST',
        body: datos,
        headers: clave ? { 'Idempotency-Key': clave } : {},
    });
};
export const getOrders = (params = {}) => request(conQuery('/orders', params), { requiereCsrf: false });
export const getOrder = id => request(`/orders/${id}`, { requiereCsrf: false });
export const cancelOrder = (id, motivo) => request(`/orders/${id}/cancelar`, { method: 'PATCH', body: { motivo } });

// ---------------------------------------------------------------
// Contacto
// ---------------------------------------------------------------
export const createContact = datos => request('/contact', { method: 'POST', body: datos });

// ---------------------------------------------------------------
// Admin
// ---------------------------------------------------------------
export const getAdminProducts = (params = {}) => request(conQuery('/admin/productos', params), { requiereCsrf: false });
export const getAdminCategories = () => request('/admin/categorias', { requiereCsrf: false });
export const getAdminBrands = () => request('/admin/marcas', { requiereCsrf: false });
export const getAdminOrders = (params = {}) => request(conQuery('/admin/pedidos', params), { requiereCsrf: false });
export const getAdminOrder = id => request(`/admin/pedidos/${id}`, { requiereCsrf: false });
export const updateAdminOrder = (id, datos) => request(`/admin/pedidos/${id}`, { method: 'PATCH', body: datos });

// ---------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------
export const getUsers = (params = {}) => request(conQuery('/users', params), { requiereCsrf: false });
export const updateUserRole = (id, role) => request(`/users/${id}/role`, { method: 'PATCH', body: { role } });
export const toggleUserActive = id => request(`/users/${id}/toggle-active`, { method: 'PATCH', body: {} });
export const deleteUser = id => request(`/users/${id}`, { method: 'DELETE' });

// ---------------------------------------------------------------
// Utilidades que se utilizaban en dos sitios
// ---------------------------------------------------------------
/** Convierte una respuesta fallida en un Error que conserva el payload. */
export const apiErrorFromResponse = respuesta => {
    const error = new Error(respuesta?.msg || 'Error en la petición');
    error.data = respuesta?.data ?? null;
    error.status = respuesta?.data?.status ?? null;
    return error;
};

/** Registro en consola con contexto. No lanza. */
export const handleApiError = (error = {}, contexto = 'api') => {
    const status = error.status || error.data?.status;
    const message = error.message || error.msg || 'Error inesperado en la API';
    console.error(`[API:${contexto}]${status ? ` ${status}` : ''}: ${message}`);
    return { ...error, message, status };
};

/** Objeto agrupado, para quien prefiera `api.getCart()` a la función suelta. */
export const api = {
    request, obtenerCsrf, asegurarCsrf,
    register, login, logout, getMe, forgotPassword, resetPassword,
    updateProfile, changePassword, addAddress, updateAddress, deleteAddress,
    getProducts, getProduct, getFeaturedProducts, getPromoProducts,
    getBrands, getProductsByCategory,
    getCart, addToCart, updateCartItem, removeFromCart, clearCart,
    createOrder, getOrders, getOrder, cancelOrder, createContact,
    getAdminProducts, getAdminCategories, getAdminBrands,
    getAdminOrders, getAdminOrder, updateAdminOrder,
    getUsers, updateUserRole, toggleUserActive, deleteUser,
    apiErrorFromResponse, handleApiError,
    alCambiarSesion, obtenerUsuario, irAlLogin,
};
