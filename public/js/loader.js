/**
 * loader.js - Splash screen: la marca "Jers" se arma mientras carga la página
 *
 * Se inyecta desde app.js para que exista en todas las páginas sin repetir
 * marcado. Si el marcado ya está en el HTML (index.html), se reutiliza.
 * Si JavaScript falla, el loader nunca se inserta y la página queda usable.
 */

const DURACION_MINIMA = 700;
const DURACION_MAXIMA = 4000;

const construirMarcado = () => {
  const marca = document.createElement('div');
  marca.className = 'loader-marca';

  const letras = ['J', 'e', 'r', 's'].map((letra, indice) => {
    const span = document.createElement('span');
    span.className = 'loader-inicial';
    span.textContent = letra;
    span.style.setProperty('--i', indice);
    return span;
  });

  const texto = document.createElement('span');
  texto.className = 'loader-texto';
  texto.textContent = 'By Jers';

  const barra = document.createElement('span');
  barra.className = 'loader-barra';
  const progreso = document.createElement('span');
  progreso.className = 'loader-progreso';
  barra.appendChild(progreso);

  marca.append(...letras, texto, barra);
  return marca;
};

export const inicializarLoader = () => {
  let loader = document.getElementById('page-loader');

  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'page-loader';
    loader.className = 'page-loader';
    loader.setAttribute('role', 'status');
    loader.setAttribute('aria-label', 'Cargando By Jers');
    loader.appendChild(constructarMarcado());
    document.body.prepend(loader);
  }

  const inicio = Date.now();
  let oculto = false;

  const ocultar = () => {
    if (oculto) return;
    oculto = true;
    loader.classList.add('page-loader--oculto');
    setTimeout(() => loader.remove(), 500);
  };

  const ocultarCuandoPueda = () => {
    const restante = Math.max(0, DURACION_MINIMA - (Date.now() - inicio));
    setTimeout(ocultar, restante);
  };

  if (document.readyState === 'complete') {
    ocultarCuandoPueda();
  } else {
    window.addEventListener('load', ocultarCuandoPueda, { once: true });
  }

  // Respaldo: nunca dejar el loader bloqueando la página.
  setTimeout(ocultar, DURACION_MAXIMA);
};
