/**
 * mi-perfil.js - Página de Perfil de Usuario
 * 
 * FLUJO:
 * 1. Verifica autenticación (GET /api/auth/me)
 * 2. Carga datos del usuario en formulario
 * 3. Tabs: Datos personales | Cambiar contraseña | Foto de perfil
 * 4. PATCH /api/auth/profile para actualizar nombre/apellido/teléfono
 * 5. PATCH /api/auth/password para cambiar contraseña
 * 6. Validación cliente + servidor (Zod)
 */

import { getMe, updateProfile, changePassword, handleApiError } from './apiClient.js';
import { 
    iniciarAplicacion, 
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
    inicializarTogglePassword
} from './app.js';

// Importar auth.js para toggle password (ya exporta inicializarTogglePassword)
import { inicializarModales } from './auth.js';

let usuarioActual = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Inicializa componentes compartidos
    iniciarAplicacion();
    inicializarModales();
    inicializarTogglePassword();

    await verificarAuthYCargar();
    inicializarTabs();
    inicializarFormularioDatos();
    inicializarFormularioPassword();
});

/**
 * Verifica autenticación y carga datos del usuario
 */
async function verificarAuthYCargar() {
    const response = await getMe();
    if (!response.ok) {
        if (response.data?.status === 401 || response.msg.includes('expirada') || response.msg.includes('No autenticado')) {
            // Redirigir a login con URL de retorno
            sessionStorage.setItem('auth_redirect_url', window.location.pathname);
            window.location.href = 'login.html';
        } else {
            handleApiError({ message: response.msg, status: response.data?.status }, 'mi-perfil');
            mostrarErrorGlobal('No se pudo cargar tu perfil');
        }
        return;
    }
    usuarioActual = response.data.user;
    rellenarFormularioDatos(usuarioActual);
    actualizarAvatarInicial(usuarioActual);
}

/**
 * Rellena formulario de datos con info del usuario
 * @param {Object} user
 */
function rellenarFormularioDatos(user) {
    document.getElementById('nombre').value = user.nombre || '';
    document.getElementById('apellido').value = user.apellido || '';
    document.getElementById('email').value = user.email || '';
    document.getElementById('telefono').value = user.telefono || '';
}

/**
 * Actualiza iniciales en avatar
 * @param {Object} user
 */
function actualizarAvatarInicial(user) {
    const inicial = document.getElementById('avatarInicial');
    const preview = document.getElementById('avatarPreview');
    
    if (inicial && user.nombre && user.apellido) {
        const letras = (user.nombre[0] + user.apellido[0]).toUpperCase();
        inicial.textContent = letras;
    }
    
    if (preview) {
        preview.setAttribute('aria-label', `Foto de perfil de ${user.nombreCompleto || user.email}`);
    }
}

/**
 * Inicializa tabs de navegación
 */
function inicializarTabs() {
    const tabs = document.querySelectorAll('.perfil-tab');
    const panels = document.querySelectorAll('.perfil-panel');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;

            tabs.forEach(t => {
                t.classList.remove('activo');
                t.setAttribute('aria-selected', 'false');
            });
            tab.classList.add('activo');
            tab.setAttribute('aria-selected', 'true');

            panels.forEach(panel => {
                if (panel.id === `tab-${target}`) {
                    panel.hidden = false;
                    panel.classList.add('activo');
                } else {
                    panel.hidden = true;
                    panel.classList.remove('activo');
                }
            });
        });
    });
}

/**
 * Inicializa formulario de datos personales
 */
function inicializarFormularioDatos() {
    const form = document.getElementById('formDatos');
    const btn = document.getElementById('btnGuardarDatos');
    const inputs = form.querySelectorAll('input:not([readonly])');

    // Validación en tiempo real
    inputs.forEach(input => {
        input.addEventListener('blur', () => validarCampoDatos(input));
        input.addEventListener('input', () => {
            if (input.getAttribute('aria-invalid') === 'true') {
                limpiarErrorCampo(input);
            }
        });
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        limpiarErroresFormulario(form);

        // Validar todos los campos
        let valido = true;
        inputs.forEach(input => {
            if (!validarCampoDatos(input)) valido = false;
        });

        if (!valido) {
            form.querySelector('[aria-invalid="true"]')?.focus();
            return;
        }

        setBtnLoading(btn, true);

        try {
            const data = {
                nombre: form.nombre.value.trim(),
                apellido: form.apellido.value.trim(),
                telefono: form.telefono.value.trim() || undefined,
            };

            const response = await updateProfile(data);
            
            if (!response.ok) {
                if (response.data?.errors && Array.isArray(response.data.errors)) {
                    response.data.errors.forEach(err => {
                        const input = form.querySelector(`#${err.field}`);
                        if (input) mostrarErrorCampo(input, err.message);
                    });
                } else {
                    mostrarMensajeGlobal(form, response.msg || 'Error al actualizar datos', 'error');
                }
                return;
            }

            // Actualizar usuario local
            usuarioActual = { ...usuarioActual, ...response.data.user };
            actualizarAvatarInicial(usuarioActual);
            
            mostrarMensajeGlobal(form, response.msg || 'Datos actualizados correctamente', 'exito');

        } catch (error) {
            handleApiError({ message: error.message }, 'actualizar-perfil');
            mostrarMensajeGlobal(form, error.message || 'Error al actualizar datos', 'error');
        } finally {
            setBtnLoading(btn, false);
        }
    });
}

/**
 * Valida un campo del formulario de datos
 * @param {HTMLInputElement} input
 * @returns {boolean}
 */
function validarCampoDatos(input) {
    const value = input.value.trim();
    const name = input.name;

    switch (name) {
        case 'nombre':
        case 'apellido':
            if (value.length < 2) {
                mostrarErrorCampo(input, `El ${name} debe tener al menos 2 caracteres`);
                return false;
            }
            break;
        case 'telefono':
            if (value && !validarTelefono(value)) {
                mostrarErrorCampo(input, 'Teléfono inválido');
                return false;
            }
            break;
    }

    limpiarErrorCampo(input);
    return true;
}

/**
 * Inicializa formulario de cambio de contraseña
 */
function inicializarFormularioPassword() {
    const form = document.getElementById('formPassword');
    const btn = document.getElementById('btnGuardarPassword');
    
    const currentPass = form.currentPassword;
    const newPass = form.newPassword;
    const confirmPass = form.confirmPassword;
    
    const strengthFill = document.getElementById('strengthFill');
    const strengthText = document.getElementById('strengthText');

    // Medidor de fortaleza
    newPass?.addEventListener('input', () => {
        const score = calcularFortalezaPassword(newPass.value);
        if (strengthFill) {
            strengthFill.setAttribute('data-strength', score);
            strengthFill.style.width = `${score * 25}%`;
        }
        if (strengthText) {
            strengthText.setAttribute('data-strength', score);
            strengthText.textContent = textoFortaleza(score);
        }

        // Re-validar confirmación si ya hay texto
        if (confirmPass.value) {
            validarConfirmPassword();
        }
    });

    // Validar confirmación
    function validarConfirmPassword() {
        if (!confirmPass.value) return true;

        if (!passwordsCoinciden(newPass.value, confirmPass.value)) {
            mostrarErrorCampo(confirmPass, 'Las contraseñas no coinciden');
            return false;
        } else {
            limpiarErrorCampo(confirmPass);
            return true;
        }
    }

    confirmPass?.addEventListener('blur', validarConfirmPassword);
    confirmPass?.addEventListener('input', () => {
        if (confirmPass.getAttribute('aria-invalid') === 'true') {
            validarConfirmPassword();
        }
    });

    // Validación currentPassword
    currentPass?.addEventListener('blur', () => {
        if (currentPass.value && currentPass.value.length < 1) {
            mostrarErrorCampo(currentPass, 'Ingresa tu contraseña actual');
        } else {
            limpiarErrorCampo(currentPass);
        }
    });

    currentPass?.addEventListener('input', () => {
        if (currentPass.getAttribute('aria-invalid') === 'true') {
            limpiarErrorCampo(currentPass);
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        limpiarErroresFormulario(form);

        // Validaciones
        let valido = true;

        if (!currentPass.value) {
            mostrarErrorCampo(currentPass, 'La contraseña actual es obligatoria');
            valido = false;
        }

        if (newPass.value.length < 8) {
            mostrarErrorCampo(newPass, 'La nueva contraseña debe tener al menos 8 caracteres');
            valido = false;
        }

        if (!passwordsCoinciden(newPass.value, confirmPass.value)) {
            mostrarErrorCampo(confirmPass, 'Las contraseñas no coinciden');
            valido = false;
        }

        if (newPass.value === currentPass.value) {
            mostrarErrorCampo(newPass, 'La nueva contraseña debe ser diferente a la actual');
            valido = false;
        }

        if (!valido) {
            form.querySelector('[aria-invalid="true"]')?.focus();
            return;
        }

        setBtnLoading(btn, true);

        try {
            const response = await changePassword({
                currentPassword: currentPass.value,
                newPassword: newPass.value,
            });

            if (!response.ok) {
                if (response.data?.errors && Array.isArray(response.data.errors)) {
                    response.data.errors.forEach(err => {
                        const input = form.querySelector(`#${err.field}`);
                        if (input) mostrarErrorCampo(input, err.message);
                    });
                } else if (response.data?.code === 'WRONG_PASSWORD' || response.data?.status === 400) {
                    mostrarErrorCampo(currentPass, 'Contraseña actual incorrecta');
                    currentPass.focus();
                } else {
                    mostrarMensajeGlobal(form, response.msg || 'Error al cambiar contraseña', 'error');
                }
                return;
            }

            // Limpiar formulario
            form.reset();
            if (strengthFill) {
                strengthFill.style.width = '0%';
                strengthFill.setAttribute('data-strength', 0);
            }
            if (strengthText) {
                strengthText.textContent = '';
                strengthText.setAttribute('data-strength', 0);
            }

            mostrarMensajeGlobal(form, response.msg || 'Contraseña actualizada correctamente', 'exito');

        } catch (error) {
            handleApiError({ message: error.message }, 'cambiar-password');
            mostrarMensajeGlobal(form, error.message || 'Error al cambiar contraseña', 'error');
        } finally {
            setBtnLoading(btn, false);
        }
    });
}

/**
 * Muestra mensaje global de error
 * @param {string} mensaje
 */
function mostrarErrorGlobal(mensaje) {
    const contenedor = document.querySelector('.container');
    if (contenedor) {
        contenedor.insertAdjacentHTML('afterbegin', `
            <div class="perfil-error-global">
                <p>${mensaje}</p>
                <a href="login.html" class="btn-primario">Iniciar sesión</a>
            </div>
        `);
    }
}