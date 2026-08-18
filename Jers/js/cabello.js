// cabello.js: inicia únicamente el catálogo de cuidado capilar.
import { CATALOGO_CABELLO, iniciarAplicacion, iniciarPestanasCatalogo } from './app.js';

document.addEventListener('DOMContentLoaded', () => {
    iniciarAplicacion();
    // Conecta las pestañas Shampoo, Acondicionador y Tratamientos con sus productos.
    iniciarPestanasCatalogo('cabello', CATALOGO_CABELLO, 'catalogoCabello');
});
