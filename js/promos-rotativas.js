/**
 * promos-rotativas.js - Carrusel de promociones en hero
 * Rota automáticamente mensajes de promociones cada 4 segundos
 */

const PROMOS = [
  { texto: '🔥 Hasta 25% OFF en maquillaje seleccionado', destino: '#promoGrid' },
  { texto: '🚚 Envío gratis en pedidos +$200.000', destino: '#categorias' },
  { texto: '✨ Nueva colección 2026 disponible', destino: '#destacadosGrid' },
  { texto: '💄 2x1 en labiales esta semana', destino: 'maquillaje.html#labios' },
  { texto: '🌟 Envío gratis en primera compra', destino: '#categorias' },
];

const rotarPromos = () => {
  const contenedor = document.querySelector('#promo-rotativa');
  if (!contenedor) return;

  let indice = 0;

  const mostrarPromo = () => {
    const promo = PROMOS[indice];
    contenedor.innerHTML = `
      <a href="${promo.destino}" class="promo-link">
        ${promo.texto}
      </a>
    `;
    indice = (indice + 1) % PROMOS.length;
  };

  mostrarPromo();

  const intervalo = setInterval(mostrarPromo, 4000);

  // Pausar con hover/focus
  contenedor.addEventListener('mouseenter', () => clearInterval(intervalo));
  contenedor.addEventListener('mouseleave', () => {
    clearInterval(intervalo);
    rotarPromos();
  });

  // Respetar prefers-reduced-motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    clearInterval(intervalo);
  }
};

export { rotarPromos };
