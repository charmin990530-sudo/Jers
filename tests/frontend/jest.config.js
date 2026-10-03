/**
 * jest.config.js de los tests del frontend.
 *
 * POR QUÉ ESTÁN EN LA RAÍZ Y NO EN backend/tests
 * ----------------------------------------------
 * Los tests de backend ya tienen su propio arranque (backend/tests/run.js) y su
 * configuración, y funcionan. Estos cubren `js/`, que es un árbol distinto: son
 * módulos ESM que corren en el navegador y no importan nada de `backend/src`.
 * Meterlos en `backend/tests/` haría que un test de `js/api.js` viviera en una
 * carpeta que dice "backend", que es justo la confusión que hay que evitar.
 *
 * QUÉ CUBRE Y QUÉ NO
 * -----------------
 * Solo lo que no necesita DOM. Por ahora `js/api.js`, que es la capa de red: se
 * prueba en Node con el `fetch` global sustituido, sin jsdom, porque todo lo que
 * toca el navegador está detrás de `typeof window === 'undefined'`.
 *
 * `js/carrito.js` y `js/checkout.js` sí necesitan DOM de verdad (el panel, los
 * formularios). Para esos hay dos caminos: jsdom, o un test de integración con
 * Firefox headless como el que se usó a mano para verificar el sitio. Ver B-05 en
 * AUDITORIA.md §9.4.
 */
export default {
  // `rootDir` es el directorio donde vive este archivo, o sea `tests/frontend`.
  // Por eso el patrón es relativo a aquí y no a la raíz del repositorio.
  rootDir: '.',
  testEnvironment: 'node',
  transform: {},
  moduleFileExtensions: ['js', 'mjs', 'json'],
  testMatch: ['<rootDir>/**/*.test.js'],
  verbose: true,
  testTimeout: 10000,
};