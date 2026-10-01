/**
 * register.js - Lógica específica de la página de registro
 * Importa utilidades compartidas de auth.js y maneja el formulario de registro
 */

import { sincronizar } from './carrito.js';
import {
    validarEmail,
    validarTelefono,
    calcularFortalezaPassword,
    textoFortaleza,
    passwordsCoinciden,
    mostrarErrorCampo,
    limpiarErrorCampo,
    limpiarErroresFormulario,
    mostrarMensajeGlobal,
    setBtnLoading,
    apiRegister,
    redirigirTrasAuth,
    inicializarAuthComun,
} from './auth.js';

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Inicializa componentes compartidos
    inicializarAuthComun();

    const form = document.getElementById('formRegister');
    const btnRegister = document.getElementById('btnRegister');

    if (!form || !btnRegister) return;

    // Referencias a inputs
    const inputs = {
        nombre: form.querySelector('#nombre'),
        apellido: form.querySelector('#apellido'),
        email: form.querySelector('#email'),
        telefono: form.querySelector('#telefono'),
        password: form.querySelector('#password'),
        confirmPassword: form.querySelector('#confirmPassword'),
        aceptoTerminos: form.querySelector('#aceptoTerminos'),
        aceptoPrivacidad: form.querySelector('#aceptoPrivacidad'),
    };

    const strengthFill = document.getElementById('strengthFill');
    const strengthText = document.getElementById('strengthText');

    // ==========================================
    // INDICADOR FORTALEZA CONTRASEÑA (tiempo real)
    // ==========================================
    inputs.password?.addEventListener('input', () => {
        const score = calcularFortalezaPassword(inputs.password.value);
        if (strengthFill) {
            strengthFill.setAttribute('data-strength', score);
            strengthFill.style.width = `${score * 25}%`;
        }
        if (strengthText) {
            strengthText.setAttribute('data-strength', score);
            strengthText.textContent = textoFortaleza(score);
        }

        // Re-validar confirmación si ya hay texto
        if (inputs.confirmPassword.value) {
            validarConfirmPassword();
        }
    });

    // ==========================================
    // VALIDACIÓN CONFIRMAR CONTRASEÑA
    // ==========================================
    function validarConfirmPassword() {
        if (!inputs.confirmPassword.value) return true;

        if (!passwordsCoinciden(inputs.password.value, inputs.confirmPassword.value)) {
            mostrarErrorCampo(inputs.confirmPassword, 'Las contraseñas no coinciden');
            return false;
        } else {
            limpiarErrorCampo(inputs.confirmPassword);
            return true;
        }
    }

    inputs.confirmPassword?.addEventListener('blur', validarConfirmPassword);
    inputs.confirmPassword?.addEventListener('input', () => {
        if (inputs.confirmPassword.getAttribute('aria-invalid') === 'true') {
            validarConfirmPassword();
        }
    });

    // ==========================================
    // VALIDACIÓN EN TIEMPO REAL (blur) - OTROS CAMPOS
    // ==========================================
    const validacionesBlur = {
        nombre: (val) => val.length >= 2 || 'El nombre debe tener al menos 2 caracteres',
        apellido: (val) => val.length >= 2 || 'El apellido debe tener al menos 2 caracteres',
        email: (val) => validarEmail(val) || 'Formato de email inválido',
        telefono: (val) => validarTelefono(val) || 'Teléfono inválido (opcional)',
    };

    Object.entries(validacionesBlur).forEach(([key, validator]) => {
        const input = inputs[key];
        if (!input) return;

        input.addEventListener('blur', () => {
            const val = input.value.trim();
            if (val) {
                const error = validator(val);
                if (error !== true) {
                    mostrarErrorCampo(input, error);
                } else {
                    limpiarErrorCampo(input);
                }
            }
        });

        input.addEventListener('input', () => {
            if (input.getAttribute('aria-invalid') === 'true') {
                limpiarErrorCampo(input);
            }
        });
    });

    // ==========================================
    // ENVÍO DEL FORMULARIO
    // ==========================================
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // 1. Limpiar errores previos
        limpiarErroresFormulario(form);

        // 2. Recoger y sanear datos
        const data = {
            nombre: inputs.nombre.value.trim(),
            apellido: inputs.apellido.value.trim(),
            email: inputs.email.value.trim().toLowerCase(),
            telefono: inputs.telefono.value.trim() || undefined,
            password: inputs.password.value,
            aceptoTerminos: inputs.aceptoTerminos.checked,
            aceptoPrivacidad: inputs.aceptoPrivacidad.checked,
        };

        // 3. Validación completa cliente
        let valido = true;

        // Nombre
        if (data.nombre.length < 2) {
            mostrarErrorCampo(inputs.nombre, 'El nombre debe tener al menos 2 caracteres');
            valido = false;
        }

        // Apellido
        if (data.apellido.length < 2) {
            mostrarErrorCampo(inputs.apellido, 'El apellido debe tener al menos 2 caracteres');
            valido = false;
        }

        // Email
        if (!data.email) {
            mostrarErrorCampo(inputs.email, 'El email es obligatorio');
            valido = false;
        } else if (!validarEmail(data.email)) {
            mostrarErrorCampo(inputs.email, 'Formato de email inválido');
            valido = false;
        }

        // Teléfono (opcional pero si se llena, validar)
        if (data.telefono && !validarTelefono(data.telefono)) {
            mostrarErrorCampo(inputs.telefono, 'Teléfono inválido');
            valido = false;
        }

        // Contraseña
        if (data.password.length < 8) {
            mostrarErrorCampo(inputs.password, 'La contraseña debe tener al menos 8 caracteres');
            valido = false;
        }

        // Confirmar contraseña
        if (!passwordsCoinciden(data.password, inputs.confirmPassword.value)) {
            mostrarErrorCampo(inputs.confirmPassword, 'Las contraseñas no coinciden');
            valido = false;
        }

        // Checkboxes legales (required por HTML, pero doble check)
        if (!data.aceptoTerminos) {
            mostrarErrorCampo(inputs.aceptoTerminos, 'Debes aceptar los términos y condiciones');
            valido = false;
        }
        if (!data.aceptoPrivacidad) {
            mostrarErrorCampo(inputs.aceptoPrivacidad, 'Debes aceptar la política de privacidad');
            valido = false;
        }

        if (!valido) {
            const primerError = form.querySelector('[aria-invalid="true"]');
            primerError?.focus();
            return;
        }

        // 4. Estado loading
        setBtnLoading(btnRegister, true);

        // 5. Llamada a API (nuevo formato: {ok, msg, data})
        const response = await apiRegister(data);

        if (!response.ok) {
            // Igual que en js/login.js: no se vuelca la respuesta porque `data`
            // incluye los `details` de validacion, que en el registro llevan el
            // nombre, el correo y el telefono de quien se esta inscribiendo.
            console.error('[auth] Registro rechazado:', response.data?.code || 'SIN_CODIGO', response.data?.status ?? 'sin-estado');

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
            } else if (response.data?.code === 'EMAIL_EXISTS' || response.data?.status === 400) {
                // Email ya registrado
                mostrarErrorCampo(inputs.email, 'Este email ya está registrado');
                inputs.email.focus();
            } else {
                // Error genérico
                mostrarMensajeGlobal(form, response.msg || 'Error al crear la cuenta. Intenta de nuevo.', 'error');
            }
            setBtnLoading(btnRegister, false);
            return;
        }

        // 6. Sincronizar carrito local → API
        await sincronizar();

        // 7. Notificar al carrito que cambió el estado de auth
        window.dispatchEvent(new Event('auth-cambio'));

        // 8. Éxito
        mostrarMensajeGlobal(form, response.msg || '¡Cuenta creada con éxito! Bienvenida a By Jers 💕', 'exito');

        // Reset formulario visual
        form.reset();
        if (strengthFill) {
            strengthFill.setAttribute('data-strength', 0);
            strengthFill.style.width = '0%';
        }
        if (strengthText) {
            strengthText.setAttribute('data-strength', 0);
            strengthText.textContent = '';
        }

        // Redirigir tras breve pausa
        setTimeout(() => {
            redirigirTrasAuth();
        }, 1000);

        setBtnLoading(btnRegister, false);
    });

    // ==========================================
    // ENTER EN CUALQUIER CAMPO = SUBMIT
    // ==========================================
    form.querySelectorAll('input:not([type="checkbox"])').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                form.requestSubmit();
            }
        });
    });

    // Checkboxes: Enter también envía
    [inputs.aceptoTerminos, inputs.aceptoPrivacidad].forEach(cb => {
        cb?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                form.requestSubmit();
            }
        });
    });
});