/**
 * promos-rotativas.js - Marquesina de promociones real, de derecha a izquierda
 *
 * Los textos se generan con datos de /api/products/promociones (nombre y
 * descuento real). Si la API falla, la cinta se oculta en lugar de mostrar
 * ofertas inventadas.
 */

import { getPromoProducts, handleApiError } from './api.js';
import { formatearPrecio } from './config.js';
import { escapeHTML } from './sanitize.js';

const calcularDescuento = (precio, precioAnterior) => {
  if (!precioAnterior || precioAnterior <= precio) return 0;
  return Math.round(((precioAnterior - precio) / precioAnterior) * 100);
};

/** Construye los mensajes de la cinta a partir de productos reales. */
const construirPromos = (productos) => {
  const promos = [];

  const conPrecio = productos.find((p) => calcularDescuento(p.precio, p.precioAnterior) > 0);
  const descuentoMaximo = productos.reduce(
    (max, p) => Math.max(max, calcularDescuento(p.precio, p.precioAnterior)),
    0
  );

  if (conPrecio && descuentoMaximo > 0) {
    promos.push({ texto: `Hasta ${descuentoMaximo}% OFF en productos seleccionados`, destino: '#promoGrid' });
  }

  for (const producto of productos) {
    const descuento = calcularDescuento(producto.precio, producto.precioAnterior);
    if (descuento <= 0) continue;

    promos.push({
      texto: `${producto.nombre} ${descuento}% OFF — ${formatearPrecio(producto.precio)}`,
      destino: `producto.html?slug=${encodeURIComponent(producto.slug)}`,
    });
  }

  if (productos.length > 0) {
    promos.push({ texto: `${productos.length} productos en descuento ahora`, destino: '#promoGrid' });
  }

  return promos;
};

export const rotarPromos = async () => {
  const contenedor = document.querySelector('#promo-carrusel');
  const cinta = document.querySelector('.promo-carrusel-wrapper');
  if (!contenedor || !cinta) return;

  try {
    const respuesta = await getPromoProducts();
    const productos = respuesta?.data?.products ?? respuesta?.products ?? [];
    const promos = construirPromos(productos);

    if (promos.length === 0) {
      cinta.hidden = true;
      return;
    }

    // Se duplica la lista para que el bucle de la animación sea continuo.
    const items = [...promos, ...promos].map((p) => `
      <a href="${escapeHTML(p.destino)}" class="promo-carrusel-item">${escapeHTML(p.texto)}</a>
    `).join('');

    contenedor.innerHTML = items;
    cinta.hidden = false;
  } catch (error) {
    handleApiError(error, 'carrusel de promociones');
    cinta.hidden = true;
  }
};
