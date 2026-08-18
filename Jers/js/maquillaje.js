// maquillaje.js: inicia únicamente el catálogo de maquillaje.
import { CATALOGO_MAQUILLAJE, iniciarAplicacion, iniciarPestanasCatalogo } from './app.js';

document.addEventListener('DOMContentLoaded', () => {
    iniciarAplicacion();
    // Conecta las pestañas Rostro, Ojos y Labios con sus productos.
    iniciarPestanasCatalogo('maquillaje', CATALOGO_MAQUILLAJE, 'catalogoMaquillaje');
});
