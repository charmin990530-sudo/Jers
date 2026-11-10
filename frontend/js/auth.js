/**
 * auth.js - Lógica compartida para páginas de autenticación (login, register)
 * Exporta utilidades reutilizables: validación, manejo de errores, llamada a API, toast
 */

import { request as apiRequest, login as apiLoginReal, register as apiRegisterReal } from './api.js';

// NOTA: este archivo ya NO implementa `request()`. Antes tenia una copia
// identica a la de apiClient.js con su propio manejo del sobre de error, del
// CSRF y de la sesión caducada, y por eso login y register se comportaban
// distinto del resto del sitio ante un 401. Ahora todo pasa por js/api.js.

// ==========================================
// SINCRONIZACIÓN DE CARRITO (localStorage ↔ API)
// ==========================================
// Se delega en js/carrito.js, que es la única implementación. Aquí quedaban
// antes tres copias de la misma fusión con tres comportamientos distintos, y una
// de ellas abortaba el merge entero si un solo item local no era válido
// (quedaba en localStorage para siempre y rompía cada inicio de sesión).

export { sincronizar as sincronizarCarritoTrasAuth } from './carrito.js';

// ==========================================
// UTILIDADES DE VALIDACIÓN LADO CLIENTE
// ==========================================

/**
 * Valida email con regex simple
 * @param {string} email
 * @returns {boolean}
 */
export function validarEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Valida teléfono colombiano (opcional)
 * @param {string} telefono
 * @returns {boolean}
 */
export function validarTelefono(telefono) {
    if (!telefono) return true;  // Opcional
    return /^[\d\s\-+()]{7,20}$/.test(telefono);
}

/**
 * Calcula fortaleza de contraseña (0-4)
 * @param {string} password
 * @returns {number} 0=muy débil, 4=muy fuerte
 */
export function calcularFortalezaPassword(password) {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return Math.min(score, 4);
}

/**
 * Texto descriptivo para fortaleza
 * @param {number} score
 * @returns {string}
 */
export function textoFortaleza(score) {
    const textos = [
        'Muy débil',
        'Débil',
        'Media',
        'Fuerte',
        'Muy fuerte'
    ];
    return textos[score] || '';
}

/**
 * Valida que dos contraseñas coincidan
 * @param {string} pass1
 * @param {string} pass2
 * @returns {boolean}
 */
export function passwordsCoinciden(pass1, pass2) {
    return pass1 === pass2 && pass1.length > 0;
}

// ==========================================
// MANEJO DE ERRORES EN FORMULARIOS
// ==========================================

/**
 * Muestra error en un campo específico
 * @param {HTMLInputElement} input
 * @param {string} mensaje
 */
export function mostrarErrorCampo(input, mensaje) {
    if (!input) return;
    input.setAttribute('aria-invalid', 'true');

    // El mensaje se busca subiendo hasta el contenedor del CAMPO, no en el
    // padre inmediato. Con `parentElement` fallaba en todos los campos de
    // contraseña: el input vive dentro de un `.password-wrapper` (para el botón
    // de mostrar/ocultar) y el `<span class="campo-error">` es HERMANO de ese
    // wrapper, hijo del `.campo`. El mensaje se descartaba en silencio, asi que
    // "Las contraseñas no coinciden" NO aparecía nunca: el usuario pulsaba
    // Continuar, el foco saltaba al campo y noulledaba nada, con el formulario
    // aparentemente bloqueado y sin explicación.
    const contenedor = input.closest('.campo, .form-grupo, .checkbox-campo, fieldset, .mb-3') || input.parentElement;
    const errorSpan = contenedor?.querySelector('.campo-error');
    if (errorSpan) {
        errorSpan.textContent = mensaje;
        // Se enlaza el mensaje al control: sin `aria-describedby` el lector de
        // pantalla anuncia el error (el span es `aria-live`) pero al navegar
        // campo a campo el usuario no sabe a cual pertenece. WCAG 3.3.1.
        if (!errorSpan.id) errorSpan.id = `error-${input.id || 'campo'}`;
        const yaAnunciado = (input.getAttribute('aria-describedby') || '').split(/\s+/).includes(errorSpan.id);
        if (!yaAnunciado) {
            const previo = input.getAttribute('aria-describedby');
            input.setAttribute('aria-describedby', previo ? `${previo} ${errorSpan.id}` : errorSpan.id);
        }
    }
}

/**
 * Limpia error de un campo
 * @param {HTMLInputElement} input
 */
export function limpiarErrorCampo(input) {
    if (!input) return;
    input.removeAttribute('aria-invalid');

    // Mismo criterio que `mostrarErrorCampo` de arriba: el mensaje se busca
    // subiendo hasta el contenedor del CAMPO, no en el padre inmediato. Aquí
    // seguía `parentElement`, que es justo lo que `mostrarErrorCampo` documenta
    // que falla en los campos de contraseña: el input vive dentro de un
    // `.password-wrapper` y el `<span class="campo-error">` es HERMANO de ese
    // wrapper. El mensaje no se borraba nunca: el usuario escribía mal la
    // confirmación, veía el texto rojo, lo corregía, y el texto rojo seguía ahí
    // mientras `aria-invalid` ya se había retirado.
    const contenedor = input.closest('.campo, .form-grupo, .checkbox-campo, fieldset, .mb-3') || input.parentElement;
    const errorSpan = contenedor?.querySelector('.campo-error');
    if (errorSpan) {
        errorSpan.textContent = '';
        // `mostrarErrorCampo` deja un `aria-describedby` apuntando al span. Si el
        // span queda vacío, ese enlace sobra y hace que el lector de pantalla
        // anuncie una descripción vacía en cada campo.
        const descrito = (input.getAttribute('aria-describedby') || '')
            .split(/\s+/)
            .filter(id => id && id !== errorSpan.id);
        if (descrito.length) input.setAttribute('aria-describedby', descrito.join(' '));
        else input.removeAttribute('aria-describedby');
    }
}

/**
 * Limpia todos los errores del formulario
 * @param {HTMLFormElement} form
 */
export function limpiarErroresFormulario(form) {
    form.querySelectorAll('[aria-invalid="true"]').forEach(input => {
        limpiarErrorCampo(input);
    });
    const msgGlobal = form.querySelector('.formulario-mensaje');
    if (msgGlobal) {
        msgGlobal.textContent = '';
        msgGlobal.className = 'formulario-mensaje';
    }
}

/**
 * Muestra mensaje global (error o éxito)
 * @param {HTMLFormElement} form
 * @param {string} mensaje
 * @param {'error'|'exito'} tipo
 */
export function mostrarMensajeGlobal(form, mensaje, tipo = 'error') {
    const msgGlobal = form.querySelector('.formulario-mensaje');
    if (msgGlobal) {
        msgGlobal.textContent = mensaje;
        msgGlobal.className = `formulario-mensaje ${tipo}`;
    }
}

// ==========================================
// ESTADO DE CARGA DEL BOTÓN
// ==========================================

/**
 * Pone botón en estado loading
 *
 * Hay dos formas de botón en el proyecto y este helper sirve para las dos:
 *
 *  - Con spans (`<span class="btn-texto">Iniciar sesión</span>` +
 *    `<span class="btn-loader" hidden>⏳</span>`), como en login.html y register.html.
 *    Ahí solo se conmuta `hidden`.
 *  - Con texto plano (`<button class="contact-btn">Enviar</button>`), como en
 *    contacto.html. Antes este caso no hacía NADA visible: `btn.disabled` sí se
 *    aplicaba, pero el texto se quedaba igual, así que el usuario pulsaba "Enviar"
 *    y no tenía ni una señal de que la petición estaba en camino (B-22). Aquí se
 *    cambia el texto y se guarda la etiqueta original en `data-etapa-original`,
 *    para que volver a pulsar no acabe enseñando "Enviando...".
 *
 * @param {HTMLButtonElement} btn
 * @param {boolean} loading
 */
export function setBtnLoading(btn, loading) {
    const texto = btn.querySelector('.btn-texto');
    const loader = btn.querySelector('.btn-loader');
    const conSpans = texto !== null || loader !== null;

    if (loading) {
        btn.disabled = true;
        if (conSpans) {
            if (texto) texto.hidden = true;
            if (loader) loader.hidden = false;
            return;
        }
        if (!btn.dataset.etapaOriginal) btn.dataset.etapaOriginal = btn.textContent.trim();
        btn.textContent = 'Enviando…';
        btn.setAttribute('aria-busy', 'true');
        return;
    }

    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    if (conSpans) {
        if (texto) texto.hidden = false;
        if (loader) loader.hidden = true;
        return;
    }
    if (btn.dataset.etapaOriginal) {
        btn.textContent = btn.dataset.etapaOriginal;
        delete btn.dataset.etapaOriginal;
    }
}

export async function apiFetch(endpoint, options = {}) {
    return apiRequest(endpoint, options);
}

/**
 * Login: POST /api/auth/login
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
export async function apiLogin(email, password, rememberMe = false) {
    return apiLoginReal({ email, password, rememberMe });
}

/**
 * Register: POST /api/auth/register
 * @param {Object} data
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
export async function apiRegister(data) {
    return apiRegisterReal(data);
}

// ==========================================
// REDIRECCIÓN INTELIGENTE POST-LOGIN
// ==========================================

/**
 * Obtiene y limpia URL de retorno
 * @returns {string} URL a redirigir (default: index.html)
 */
export function obtenerUrlRetorno() {
    const redirect = new URLSearchParams(window.location.search).get('redirect');
    const url = redirect || sessionStorage.getItem('auth_redirect_url');
    sessionStorage.removeItem('auth_redirect_url');
    // Validación con la URL API en vez de una regex: parsea contra el origen
    // actual y solo acepta rutas del MISMO origen. Cubre variantes que la regex
    // anterior dejaba pasar o no dejaba pasar por accidente (backslash,
    // percent-encoding, protocolos raros) sin depender de una lista de
    // caracteres creciente.
    if (url) {
        try {
            const destino = new URL(url, window.location.origin);
            if (destino.origin === window.location.origin) {
                return destino.pathname + destino.search + destino.hash;
            }
        } catch {
            // URL inválida: se cae al default de abajo.
        }
    }
    return 'index.html';
}

/**
 * Redirige tras login/registro exitoso
 */
export function redirigirTrasAuth() {
    const url = obtenerUrlRetorno();
    window.location.href = url;
}

// ==========================================
// MODALES
// ==========================================

/**
 * Elementos por los que se puede mover el foco dentro de un modal.
 *
 * `inert` ya saca el fondo del recorrido del teclado en los navegadores que lo
 * soportan; esta lista cubre el resto y hace la trampa de Tab explícita.
 */
const FOCOABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Abre un modal gestionando el foco.
 *
 * HASTA AQUÍ, solo cuatro de los doce modales del sitio lo hacían. Abrir un
 * modal sin mover el foco deja al usuario de teclado con el foco en el botón
 * que lo abrió, DETRÁS del modal: la siguiente lectura anuncia ese botón y `Tab`
 * recorre los ~200 elementos del fondo en lugar del contenido del modal. Es el
 * fallo de accesibilidad más común y más fácil de arreglar de forma centralizada,
 * así que se arregla una vez aquí y se usa en todas partes.
 *
 * Qué hace:
 *  1. Recuerda quién tenía el foco para devolvérselo al cerrar.
 *  2. Marca el resto de la página como `inert` de verdad (no solo `aria-hidden`,
 *     que esVisual pero no saca nada del tabulador).
 *  3. Mete el foco dentro, en el primer control o en el propio contenedor.
 *  4. Atrapa Tab y Shift+Tab para que no se salgan del modal.
 *  5. Escape cierra.
 *
 * @param {HTMLElement} modal
 * @returns {void}
 */
export function abrirModal(modal, { primerFoco } = {}) {
    if (!modal) return;

    // Si ya hay un modal abierto, este lo sustituye: solo uno puede controlar
    // el foco a la vez, y el `inert` es global.
    const otro = document.querySelector('.modal:not([hidden])');
    if (otro && otro !== modal) cerrarModal(otro, { restaurarFoco: false });

    modal.__focoPrevio = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    marcarFondoInerte(modal, true);

    const destino = primerFoco
        || modal.querySelector(FOCOABLES)
        || modal;
    // `focus({preventScroll})` evita que la página salte al centro cuando el
    // modal está más abajo que el punto actual del scroll.
    destino.focus?.({ preventScroll: true });
    // Un `role="dialog"` sin nombre no lo anuncia como diálogo. El HTML de
    // este proyecto ya declara `aria-labelledby` en todos sus modales; esto es
    // la red de seguridad para los que se creen a mano.
    if (!modal.getAttribute('aria-labelledby') && !modal.getAttribute('aria-label')) {
        const titulo = modal.querySelector('h1, h2, h3');
        if (titulo) {
            if (!titulo.id) {
                const sufijo = globalThis.crypto?.randomUUID?.().slice(0, 8)
                    ?? Math.random().toString(36).slice(2, 8);
                titulo.id = `modal-titulo-${sufijo}`;
            }
            modal.setAttribute('aria-labelledby', titulo.id);
        }
    }
}

/**
 * Marca todo lo que cuelga de `<body>` salvo el modal como `inert`.
 *
 * `inert` es lo que saca a los descendientes del foco, del tabulador y del
 * árbol de accesibilidad. Aparece en todos los navegadores desde finales de 2023.
 * En los que no lo soportan, el atributo no hace nada pero no rompe: el
 * `aria-hidden` del HTML y la trampa de Tab en `abrirModal` cubren el resto.
 */
function marcarFondoInerte(modal, inerte) {
    for (const hijo of document.body.children) {
        if (hijo === modal || hijo.contains(modal)) continue;
        // El toast y el carrito son `position: fixed`; dejarlos inertes tiene
        // sentido igual, pero el aviso del carrito necesita poder leerse.
        hijo.toggleAttribute('inert', inerte);
    }
}

/**
 * Cierra un modal y devuelve el foco a donde estaba.
 * @param {HTMLElement} modal
 * @param {{restaurarFoco?: boolean}} [opciones]
 */
export function cerrarModal(modal, { restaurarFoco = true } = {}) {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    marcarFondoInerte(modal, false);
    // Solo se restaura el `overflow` si no queda otro modal abierto: si no, al
    // cerrar dos seguidos el segundo dejaba la página sin scroll para siempre.
    if (!document.querySelector('.modal:not([hidden])')) {
        document.body.style.overflow = '';
    }
    if (restaurarFoco) {
        const previo = modal.__focoPrevio;
        modal.__focoPrevio = null;
        // Si el elemento que tenía el foco ya no existe (se re-renderizó la
        // lista), no se intenta: `.focus()` en un nodo desconectado no hace nada
        // y el usuario se queda perdido en el `<body>`.
        if (previo && previo.isConnected) previo.focus({ preventScroll: true });
    }
}

/**
 * Atrapa Tab dentro de un modal abierto.
 *
 * `inert` ya impide salir del modal en los navegadores modernos. Esta trampa
 * cubre los demás y, sobre todo, hace el comportamiento explícito.
 */
function atraparTabEnModal(modal, evento) {
    if (evento.key !== 'Tab' || modal.hidden) return;
    const focoables = [...modal.querySelectorAll(FOCOABLES)].filter(el => el.offsetParent !== null || el === document.activeElement);
    if (focoables.length < 2) return;
    const primero = focoables[0];
    const ultimo = focoables[focoables.length - 1];
    if (evento.shiftKey && document.activeElement === primero) {
        evento.preventDefault();
        ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primero.focus();
    }
}

/**
 * Inicializa modales con delegación de eventos
 */
export function inicializarModales() {
    // Abrir modal al click en enlaces con data-modal
    document.addEventListener('click', (e) => {
        const enlace = e.target.closest('[data-modal]');
        if (!enlace) return;
        e.preventDefault();
        const modalId = `modal${enlace.dataset.modal.charAt(0).toUpperCase() + enlace.dataset.modal.slice(1)}`;
        abrirModal(document.getElementById(modalId));
    });

    // Cerrar modal: botón X, click en fondo, tecla Escape
    document.addEventListener('click', (e) => {
        if (e.target.matches('.modal-cerrar') || e.target.matches('.modal')) {
            const modal = e.target.closest('.modal');
            if (modal) cerrarModal(modal);
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const modalAbierto = document.querySelector('.modal:not([hidden])');
        if (modalAbierto) cerrarModal(modalAbierto);
    });

    // Un solo listener en `document` para la trampa de Tab de todos los modales
    // abiertos: registrar uno por modal era imposible de mantener y cualquiera
    // de los dos acababa sin él.
    document.addEventListener('keydown', (e) => {
        const abierto = document.querySelector('.modal:not([hidden])');
        if (abierto) atraparTabEnModal(abierto, e);
    });
}

// ==========================================
// INICIALIZACIÓN COMÚN (se llama desde login.js y register.js)
// ==========================================

/**
 * Inicializa componentes compartidos de auth
 * - Menú móvil, carrito, WhatsApp, chatbot, animaciones (de app.js)
 * - Modales de términos/privacidad
 * - Toggle password en todos los inputs type=password
 */
export function inicializarAuthComun() {
    // Importar dinámicamente para evitar dependencia circular
    import('./app.js').then(({ iniciarAplicacion }) => {
        iniciarAplicacion();
    });

    inicializarModales();
    inicializarTogglePassword();
}

/**
 * Inicializa botones mostrar/ocultar contraseña
 * Usa delegación para cubrir inputs dinámicos
 */
export function inicializarTogglePassword() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.password-toggle');
        if (!btn) return;

        const wrapper = btn.closest('.password-wrapper');
        const input = wrapper?.querySelector('input[type="password"], input[type="text"]');
        if (!input) return;

        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';

        // Actualizar iconos
        const abierto = btn.querySelector('.ojo-abierto');
        const cerrado = btn.querySelector('.ojo-cerrado');
        if (abierto && cerrado) {
            abierto.hidden = isPassword;
            cerrado.hidden = !isPassword;
        }
        btn.setAttribute('aria-label', isPassword ? 'Ocultar contraseña' : 'Mostrar contraseña');
    });
}