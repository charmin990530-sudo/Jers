// index.js: controla solamente los elementos exclusivos de la página de inicio.
import { iniciarAplicacion, PRODUCTOS_PROMO, renderizarPromociones } from './app.js';

document.addEventListener('DOMContentLoaded', () => {
    iniciarAplicacion();

    // Inserta las tres tarjetas de descuento en el espacio reservado en index.html.
    renderizarPromociones(PRODUCTOS_PROMO, document.getElementById('promoGrid'));

    // El botón principal lleva a la sección de categorías sin recargar la página.
    document.querySelector('.herobtn')?.addEventListener('click', () => {
        document.getElementById('categorias')?.scrollIntoView({ behavior: 'smooth' });
    });
});
