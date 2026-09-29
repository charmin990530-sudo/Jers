/**
 * loader.js - Splash screen con logo animado
 * Muestra el logo de By Jers "armándose" mientras carga la página
 */

const mostrarLoader = () => {
  const loader = document.querySelector('#page-loader');
  if (!loader) return;

  loader.classList.add('visible');
};

const ocultarLoader = () => {
  const loader = document.querySelector('#page-loader');
  if (!loader) return;

  loader.classList.add('hidden');
  setTimeout(() => {
    loader.style.display = 'none';
  }, 500);
};

const inicializarLoader = () => {
  mostrarLoader();

  if (document.readyState === 'complete') {
    setTimeout(ocultarLoader, 800);
  } else {
    window.addEventListener('load', () => {
      setTimeout(ocultarLoader, 800);
    });
  }

  // Respaldo: ocultar después de 3s máximo
  setTimeout(ocultarLoader, 3000);
};

export { inicializarLoader };
