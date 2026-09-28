/**
 * config.js - Configuración del frontend
 * Permite sobrescribir la URL del API vía variable global o meta tag
 */

// URL base del backend por defecto (desarrollo)
// Se puede sobrescribir definiento window.API_BASE_URL antes de cargar este script
// o añadiendo <meta name="api-base-url" content="https://api.ejemplo.com"> en el HTML
const getDefaultApiBaseUrl = () => {
    if (typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
        return `${window.location.origin}/api`;
    }
    return 'http://localhost:3000/api';
};

function normalizeApiBaseUrl(value) {
    try {
        const url = new URL(value);
        const pathname = url.pathname.replace(/\/+$/, '');
        if (!pathname.endsWith('/api')) {
            url.pathname = `${pathname}/api`;
        }
        return url.toString().replace(/\/$/, '');
    } catch {
        return getDefaultApiBaseUrl();
    }
}

// Obtener URL desde variable global, meta tag, o usar default
function getApiBaseUrl() {
    // 1. Variable global (seteada en HTML antes de cargar scripts)
    if (typeof window !== 'undefined' && window.API_BASE_URL) {
        return window.API_BASE_URL;
    }
    // 2. Meta tag en HTML
    if (typeof document !== 'undefined') {
        const meta = document.querySelector('meta[name="api-base-url"]');
        if (meta && meta.content) {
            return meta.content;
        }
    }
    // 3. Default
    return getDefaultApiBaseUrl();
}

export const API_BASE_URL = normalizeApiBaseUrl(getApiBaseUrl());

// Configuración adicional
export const CONFIG = {
    // Tiempo de expiración de la sesión (ms) - solo para referencia en frontend
    SESSION_EXPIRY_MS: 7 * 24 * 60 * 60 * 1000, // 7 días
    
    // Número de WhatsApp para contacto (se puede sobrescribir igual que API_BASE_URL)
    WHATSAPP_NUMBER: (typeof window !== 'undefined' && window.WHATSAPP_NUMBER)
        ? window.WHATSAPP_NUMBER
        : (typeof document !== 'undefined' && document.querySelector('meta[name="whatsapp-number"]')?.content)
            ? document.querySelector('meta[name="whatsapp-number"]').content
            : '573114333561',
};