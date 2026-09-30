/**
 * reset-password.js - Lógica para página de recuperar contraseña
 * Lee token de la URL (?token=xxx) y envía al backend para restablecer
 */

import {
    validarEmail,
    passwordsCoinciden,
    mostrarErrorCampo,
    limpiarErrorCampo,
    limpiarErroresFormulario,
    mostrarMensajeGlobal,
    setBtnLoading,
    inicializarAuthComun
} from './auth.js';
import { forgotPassword, resetPassword } from './api.js';

document.addEventListener('DOMContentLoaded', () => {
    inicializarAuthComun();

    const form = document.getElementById('formReset');
    const btnReset = document.getElementById('btnReset');
    const emailInput = form?.querySelector('#email');
    const passwordInput = form?.querySelector('#password');
    const confirmPasswordInput = form?.querySelector('#confirmPassword');
    const tokenInput = form?.querySelector('#token'); // Hidden input para token

    if (!form || !btnReset) return;

    // ==========================================
    // LEER TOKEN DE LA URL
    // ==========================================
    const urlParams = new URLSearchParams(window.location.search);
    let token = urlParams.get('token');

    // En el flujo con token se necesitan `password` y `confirmPassword`; en el
    // flujo de solicitud solo `email`. Antes el submit desreferenciaba estos
    // inputs sin comprobarlos: un id renombrado en el HTML lanzaba TypeError
    // DENTRO del submit, y como no habia try/finally el boton se quedaba en
    // loading para siempre. Se comprueba aqui lo que cada flujo exige.
    const faltan = token
        ? [!passwordInput, !confirmPasswordInput]
        : [!emailInput];
    if (faltan.some(Boolean)) {
        console.error('reset-password: falta un campo esperado en el formulario');
        return;
    }

    // Si hay token en URL, ocultar campo email y mostrar campos password
    if (token) {
        if (tokenInput) tokenInput.value = token;
        const emailCampo = emailInput?.closest('.campo');
        if (emailCampo) emailCampo.style.display = 'none';
        const passwordCampo = document.getElementById('campoPassword');
        const confirmCampo = document.getElementById('campoConfirmPassword');
        if (passwordCampo) passwordCampo.style.display = '';
        if (confirmCampo) confirmCampo.style.display = '';
        const btnTexto = btnReset?.querySelector('.btn-texto');
        if (btnTexto) btnTexto.textContent = 'Restablecer contraseña';
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // ==========================================
    // VALIDACIÓN EN TIEMPO REAL
    // ==========================================
    const validarCampos = () => {
        let valido = true;

        if (!token) {
            // Flujo forgot-password: validar email
            if (emailInput.value && !validarEmail(emailInput.value)) {
                mostrarErrorCampo(emailInput, 'Formato de email inválido');
                valido = false;
            } else if (!emailInput.value) {
                mostrarErrorCampo(emailInput, 'El email es obligatorio');
                valido = false;
            } else {
                limpiarErrorCampo(emailInput);
            }
        } else {
            if (!passwordInput.value) {
                mostrarErrorCampo(passwordInput, 'La nueva contraseña es obligatoria');
                valido = false;
            } else if (passwordInput.value.length < 8) {
                mostrarErrorCampo(passwordInput, 'Mínimo 8 caracteres');
                valido = false;
            } else {
                limpiarErrorCampo(passwordInput);
            }

            if (!confirmPasswordInput.value) {
                mostrarErrorCampo(confirmPasswordInput, 'Confirma la contraseña');
                valido = false;
            } else if (!passwordsCoinciden(passwordInput.value, confirmPasswordInput.value)) {
                mostrarErrorCampo(confirmPasswordInput, 'Las contraseñas no coinciden');
                valido = false;
            } else {
                limpiarErrorCampo(confirmPasswordInput);
            }
        }

        return valido;
    };

    if (!token) {
        emailInput?.addEventListener('blur', () => {
            if (emailInput.value && !validarEmail(emailInput.value)) {
                mostrarErrorCampo(emailInput, 'Formato de email inválido');
            } else {
                limpiarErrorCampo(emailInput);
            }
        });
        emailInput?.addEventListener('input', () => limpiarErrorCampo(emailInput));
    } else {
        [passwordInput, confirmPasswordInput].forEach(input => {
            input?.addEventListener('input', () => limpiarErrorCampo(input));
        });
        confirmPasswordInput?.addEventListener('blur', () => {
            if (confirmPasswordInput.value && !passwordsCoinciden(passwordInput.value, confirmPasswordInput.value)) {
                mostrarErrorCampo(confirmPasswordInput, 'Las contraseñas no coinciden');
            }
        });
    }

    // ==========================================
    // ENVÍO DEL FORMULARIO
    // ==========================================
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        limpiarErroresFormulario(form);

        if (!validarCampos()) {
            const primerError = form.querySelector('[aria-invalid="true"]');
            primerError?.focus();
            return;
        }

        setBtnLoading(btnReset, true);

        // Vuelve a poner el formulario en modo "solo email" y limpia el token de
        // la URL. Se usa cuando el enlace llega expirado o manipulado, para que
        // el cliente pueda pedir uno nuevo sin recargar.
        const volverAModoSolicitud = () => {
            token = null;
            if (tokenInput) tokenInput.value = '';
            const emailCampo = emailInput?.closest('.campo');
            if (emailCampo) emailCampo.style.display = '';
            const passwordCampo = document.getElementById('campoPassword');
            const confirmCampo = document.getElementById('campoConfirmPassword');
            if (passwordCampo) passwordCampo.style.display = 'none';
            if (confirmCampo) confirmCampo.style.display = 'none';
            const btnTexto = btnReset?.querySelector('.btn-texto');
            if (btnTexto) btnTexto.textContent = 'Enviar instrucciones';
            window.history.replaceState({}, document.title, window.location.pathname);
        };

        // `request()` NO lanza nunca: devuelve {ok, msg, data}. Por eso el ex
        // catch de antes era inalcanzable y todo fallo terminaba en la rama de
        // éxito con `data.message` (undefined), o sea un recuadro verde de
        // "éxito" que en realidad decía `undefined`.
        try {
            const response = token
                ? await resetPassword({
                    token,
                    password: passwordInput.value,
                    confirmPassword: confirmPasswordInput.value,
                })
                : await forgotPassword(emailInput.value.trim().toLowerCase());

            if (!response.ok) {
                const error = response.data || {};

                // Token inválido o expirado: mensaje propio y vuelta al paso 1.
                if (error.code === 'INVALID_RESET_TOKEN') {
                    mostrarMensajeGlobal(form, 'El enlace ha expirado o es inválido. Solicita uno nuevo.', 'error');
                    volverAModoSolicitud();
                    return;
                }

                // Errores de campo sueltos (Zod los manda en `details`).
                const detalles = Array.isArray(error.errors) ? error.errors : null;
                if (detalles?.length) {
                    detalles.forEach(det => {
                        const input = form.querySelector(`#${det.field}`);
                        if (input) mostrarErrorCampo(input, det.message);
                    });
                    form.querySelector('[aria-invalid="true"]')?.focus();
                    return;
                }

                mostrarMensajeGlobal(form, response.msg || 'Error al procesar la solicitud. Intenta de nuevo.', 'error');
                return;
            }

            // Éxito: el mensaje viaja en `msg` (request() lo saca de `message`).
            mostrarMensajeGlobal(form, response.msg || 'Contraseña actualizada correctamente.', 'exito');
            form.reset();

            // forgot-password -> login; reset-password -> inicio.
            setTimeout(() => {
                window.location.href = token ? 'index.html' : 'login.html';
            }, token ? 1500 : 2000);
        } finally {
            setBtnLoading(btnReset, false);
        }
    });

    // Enter = submit
    form.querySelectorAll('input').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                form.requestSubmit();
            }
        });
    });
});