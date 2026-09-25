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
    inicializarAuthComun,
    apiFetch
} from './auth.js';

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

        try {
            let endpoint, body;

            if (token) {
                // Flujo reset-password
                endpoint = '/api/auth/reset-password';
                body = {
                    token,
                    password: passwordInput.value,
                    confirmPassword: confirmPasswordInput.value,
                };
            } else {
                // Flujo forgot-password
                endpoint = '/api/auth/forgot-password';
                body = {
                    email: emailInput.value.trim().toLowerCase(),
                };
            }

            const data = await apiFetch(endpoint, {
                method: 'POST',
                body: JSON.stringify(body),
            });

            mostrarMensajeGlobal(form, data.message, 'exito');
            form.reset();

            // Si fue forgot-password, redirigir a login tras pausa
            if (!token) {
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 2000);
            } else {
                // Si fue reset-password, redirigir a index
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1500);
            }

        } catch (error) {
            console.error('Error reset password:', error);

            if (error.errors && Array.isArray(error.errors)) {
                error.errors.forEach(err => {
                    const input = form.querySelector(`#${err.field}`);
                    if (input) {
                        mostrarErrorCampo(input, err.message);
                    }
                });
                const primerError = form.querySelector('[aria-invalid="true"]');
                primerError?.focus();
            } else if (error.code === 'INVALID_RESET_TOKEN') {
                mostrarMensajeGlobal(form, 'El enlace ha expirado o es inválido. Solicita uno nuevo.', 'error');
                // Mostrar campo email de nuevo
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
                // Limpiar token de URL
                window.history.replaceState({}, document.title, window.location.pathname);
            } else {
                mostrarMensajeGlobal(form, error.message || 'Error al procesar la solicitud. Intenta de nuevo.', 'error');
            }
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