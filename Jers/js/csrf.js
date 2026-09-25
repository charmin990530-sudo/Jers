import { API_BASE_URL } from './config.js';

const readCookie = name => {
    if (typeof document === 'undefined') return null;
    const prefix = `${encodeURIComponent(name)}=`;
    const cookie = document.cookie.split('; ').find(item => item.startsWith(prefix));
    return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
};

export const getCsrfToken = () => readCookie('jers_csrf');

export const ensureCsrfToken = async () => {
    const existing = getCsrfToken();
    if (existing) return existing;
    if (typeof fetch === 'undefined') return null;
    await fetch(`${API_BASE_URL}/auth/csrf`, {
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    return getCsrfToken();
};
