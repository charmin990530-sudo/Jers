export function escapeHTML(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function safeAssetUrl(value) {
    const url = String(value || '').trim();
    if (url.startsWith('/') && !url.startsWith('//')) return url;
    try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
    } catch {
        return null;
    }
}

export function safeExternalUrl(value) {
    try {
        const url = new URL(String(value || ''));
        return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch {
        return null;
    }
}

export function safePosition(value) {
    const position = String(value || 'center').trim();
    return /^(?:center|top|bottom|left|right)(?:\s+(?:center|top|bottom|left|right|[0-9]{1,3}%|[0-9]{1,3}(?:px|rem|em)))?$|^[0-9]{1,3}%\s+[0-9]{1,3}%$/i.test(position) ? position : 'center';
}
