/**
 * rutas.js - Guardia de rutas protegidas
 *
 * ANTES
 * ----
 * Cada pantalla repetía su propio chequeo. `mi-perfil.js` comparaba el código de
 * estado, `admin/dashboard.js` miraba `user.role`, `checkout.js` hacía
 * `getMe()` y si no iba al login. Cuatro variantes del mismo problema, y
 * ninguna devolvía al usuario a la página que estaba viendo: si la sesión se
 * caía estando en "mis pedidos", aparecía un error o un mensaje de "no
 * autenticado" en mitad de la página en vez de un formulario de login.
 *
 * AHORA
 * -----
 * `protegerRuta({ requiereAdmin })` hace siempre lo mismo:
 *   1. pregunta al backend quién es (la cookie es HttpOnly, no se puede mirar);
 *   2. sin sesión -> login conservando la URL actual, para volver después;
 *   3. con sesión pero sin el rol -> inicio, sin dar pistas de qué faltaba;
 *   4. con sesión -> devuelve el usuario para que la pantalla lo use.
 *
 * Si la sesión expira con la pantalla ya abierta, no hace falta hacer nada
 * aquí: js/api.js emite `sesion-caducada` y lleva al login ante un 401 de una
 * ruta autenticada. El guard solo cubre la carga inicial de la pantalla.
 */

import { getMe, irAlLogin } from './api.js';

// Una entrada por documento. Guarda el usuario resuelto para que una segunda
// llamada en la misma pantalla no repita la petición ni devuelva `null`.
const RESUELTO = new WeakMap();

/**
 * @param {object} [opciones]
 * @param {boolean} [opciones.requiereAdmin=false]
 * @param {string}   [opciones.pantalla] - Etiqueta para el log.
 * @returns {Promise<{ok: boolean, user: object|null}>}
 */
export const protegerRuta = async ({ requiereAdmin = false, pantalla = 'ruta' } = {}) => {
    // Idempotente: si la pantalla ya se resolvió, se devuelve el mismo usuario
    // sin volver a preguntar. Evita dos viajes de red al cargar la misma vista.
    if (RESUELTO.has(document.body)) return RESUELTO.get(document.body);

    const respuesta = await getMe();

    if (!respuesta.ok) {
        // `getMe()` NO redirige por diseño: preguntar si hay sesión es legítimo
        // estando invitado, así que quien decide si esto es un problema es esta
        // función, no la capa de red.
        const destino = { ok: false, user: null };
        RESUELTO.set(document.body, destino);
        irAlLogin();
        return destino;
    }

    const user = respuesta.data?.user || null;
    if (!user) {
        const destino = { ok: false, user: null };
        RESUELTO.set(document.body, destino);
        irAlLogin();
        return destino;
    }

    if (requiereAdmin && user.role !== 'admin') {
        // No se dice "no tienes permisos": se lleva al inicio. Confirmar que el
        // rol falta ya revelaría que la cuenta existe y en qué panel se administra.
        const destino = { ok: false, user: null };
        RESUELTO.set(document.body, destino);
        window.location.replace('/');
        return destino;
    }

    const destino = { ok: true, user };
    RESUELTO.set(document.body, destino);
    return destino;
};

