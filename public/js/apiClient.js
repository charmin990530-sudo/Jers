/**
 * apiClient.js - Reexporta la capa de red única
 *
 * Antes este archivo ERA la implementación y `js/auth.js` tenía una copia de
 * `request()`. Ahora la implementación vive en `js/api.js` y aquí solo se
 * reexporta, para que los imports existentes sigan funcionando sin tener que
 * tocar 20 archivos de golpe. Los imports nuevos deben hacerse desde
 * `js/api.js` directamente.
 */

export * from './api.js';
