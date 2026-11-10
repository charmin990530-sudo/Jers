/**
 * tipos-globales.d.ts — globals que el frontend acepta por fuera.
 *
 * Hasta ahora estos dos valores se leian de `window` sin declararlos en ningun
 * sitio, asi que `checkJs` los reportaba como `Property 'API_BASE_URL' does not
 * exist on type 'Window'` (28 errores en total, casi todos False alarm: en
 * runtime existen si alguien los define antes de cargar el script).
 *
 * No los define ningun paso del build: son overrides manuales, documentados en
 * js/config.js, para servir el frontend desde otro host a proposito. Se declaran
 * aqui para que el type-check deje de quejarse y para que quede escrito de
 * donde salen.
 *
 * Estos `declare global` solo existen para el type-check; no se emiten a
 * navegador porque el proyecto no compila TypeScript.
 */

interface Window {
  /**
   * Origen de la API con `/api` al final. Si no se define, js/config.js deriva
   * la URL de `window.location.origin`, que es el caso normal.
   */
  API_BASE_URL?: string;

  /** Numero de WhatsApp en formato internacional, sin signos (ej. '573114333561'). */
  WHATSAPP_NUMBER?: string;
}