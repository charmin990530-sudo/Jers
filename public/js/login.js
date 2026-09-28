/**
 * login.js - Lógica específica de la página de inicio de sesión
 * Importa utilidades compartidas de auth.js y maneja el formulario de login
 */

import {
    validarEmail,
    mostrarErrorCampo,
    limpiarErrorCampo,
    limpiarErroresFormulario,
    mostrarMensajeGlobal,
    setBtnLoading,
    apiLogin,
    redirigirTrasAuth,
    inicializarAuthComun,
    sincronizarCarritoTrasAuth
} from './auth.js';

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Inicializa componentes compartidos (menú, carrito, WhatsApp, chatbot, modales, toggle password)
    inicializarAuthComun();

    const form = document.getElementById('formLogin');
    const btnLogin = document.getElementById('btnLogin');

    if (!form || !btnLogin) return;

    // ==========================================
    // VALIDACIÓN EN TIEMPO REAL (blur)
    // ==========================================
    const emailInput = form.querySelector('#email');
    const passwordInput = form.querySelector('#password');

    // Validar email al salir del campo
    emailInput?.addEventListener('blur', () => {
        if (emailInput.value && !validarEmail(emailInput.value)) {
            mostrarErrorCampo(emailInput, 'Formato de email inválido');
        } else {
            limpiarErrorCampo(emailInput);
        }
    });

    // Limpiar error al escribir
    [emailInput, passwordInput].forEach(input => {
        input?.addEventListener('input', () => limpiarErrorCampo(input));
    });

    // ==========================================
    // ENVÍO DEL FORMULARIO
    // ==========================================
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // 1. Limpiar errores previos
        limpiarErroresFormulario(form);

        // 2. Recoger datos
        const email = emailInput.value.trim().toLowerCase();
        const password = passwordInput.value;
        const recordar = form.querySelector('#recordarme')?.checked;

        // 3. Validación cliente
        let valido = true;

        if (!email) {
            mostrarErrorCampo(emailInput, 'El email es obligatorio');
            valido = false;
        } else if (!validarEmail(email)) {
            mostrarErrorCampo(emailInput, 'Formato de email inválido');
            valido = false;
        }

        if (!password) {
            mostrarErrorCampo(passwordInput, 'La contraseña es obligatoria');
            valido = false;
        }

        if (!valido) {
            // Focus al primer campo con error
            const primerError = form.querySelector('[aria-invalid="true"]');
            primerError?.focus();
            return;
        }

        // 4. Estado loading
        setBtnLoading(btnLogin, true);

        // 5. Llamada a API (nuevo formato: {ok, msg, data})
        const response = await apiLogin(email, password, recordar === true);

        if (!response.ok) {
            // 6. Manejo de errores
            console.error('Error login:', response);

            if (response.data?.errors && Array.isArray(response.data.errors)) {
                // Errores de validación Zod (400)
                response.data.errors.forEach(err => {
                    const input = form.querySelector(`#${err.field}`);
                    if (input) {
                        mostrarErrorCampo(input, err.message);
                    }
                });
                const primerError = form.querySelector('[aria-invalid="true"]');
                primerError?.focus();
            } else if (response.data?.code === 'INVALID_CREDENTIALS' || response.data?.status === 401) {
                // Credenciales inválidas
                mostrarMensajeGlobal(form, 'Email o contraseña incorrectos', 'error');
                passwordInput.focus();
                passwordInput.select();
            } else if (response.data?.code === 'EMAIL_EXISTS') {
                mostrarErrorCampo(emailInput, 'Este email no está registrado');
            } else {
                // Error genérico
                mostrarMensajeGlobal(form, response.msg || 'Error al iniciar sesión. Intenta de nuevo.', 'error');
            }
            setBtnLoading(btnLogin, false);
            return;
        }

        // 6. Sincronizar carrito local → API
        await sincronizarCarritoTrasAuth();

        // 7. Notificar al carrito que cambió el estado de auth
        window.dispatchEvent(new Event('auth-cambio'));

        // 8. Éxito: mostrar mensaje y redirigir
        mostrarMensajeGlobal(form, response.msg || '¡Bienvenida de vuelta!', 'exito');

        // Pequeño delay para que se vea el mensaje
        setTimeout(() => {
            redirigirTrasAuth();
        }, 800);

        setBtnLoading(btnLogin, false);
    });

    // ==========================================
    // ENTER EN CUALQUIER CAMPO = SUBMIT
    // ==========================================
    form.querySelectorAll('input').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                form.requestSubmit();  // Dispara evento submit con validación
            }
        });
    });
});