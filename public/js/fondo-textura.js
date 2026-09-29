/**
 * fondo-textura.js - Fondo de video para toda la web (script clásico, sin módulos)
 *
 * Se carga en el <head> de todas las páginas e inyecta, apenas existe <body>:
 *
 *  1. .fondo-textura : el video de fondo, fijo, que acompaña al scroll en toda
 *     la página. Va detrás de todo el contenido (z-index 0) y lleva un velo
 *     crema encima para que los textos se lean sin esfuerzo.
 *  2. .fondo-emoji   : pocos emojis de maquillaje cayendo del hero hacia abajo.
 *     Son decorativos (aria-hidden) y nunca capturan clics.
 *
 * Decisiones de rendimiento y accesibilidad:
 *  - Un solo <video> para toda la pagina, no uno por seccion.
 *  - Fuentes separadas para movil y escritorio: no se descarga el archivo grande
 *    en telefonos ni el vertical en escritorio.
 *  - prefers-reduced-motion: no se reproduce el video y los emojis no caen; se
 *    queda la imagen fija. El sitio sigue siendo completamente usable.
 *  - Si el video falla o el navegador bloquea el autoplay, el poster queda de
 *    fondo. Nunca se ve un area vacia ni un destello negro.
 */
(function () {
  'use strict';

  var VIDEO_DESKTOP = '/video/hero-desktop.mp4';
  var VIDEO_MOVIL = '/video/hero-mobile.mp4';
  var POSTER = '/img/demo/hero-poster.png';

  // Emojis de maquillaje. Pocos y espaciados para que se lean como textura
  // y no como ruido por encima del contenido.
  var EMOJIS = ['💄', '💋', '✨', '🌸', '💅', '🧴', '💗', '🎀'];
  var CANTIDAD_EMOJIS = 14;

  function esMovil() {
    return window.matchMedia('(max-width: 768px)').matches;
  }

  function movimientoReducido() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function crearFondo() {
    var fondo = document.createElement('div');
    fondo.className = 'fondo-textura';
    fondo.setAttribute('aria-hidden', 'true');

    var poster = document.createElement('img');
    poster.className = 'fondo-textura-poster';
    poster.src = POSTER;
    poster.alt = '';
    poster.decoding = 'async';
    poster.fetchPriority = 'high';

    var video = document.createElement('video');
    video.className = 'fondo-textura-video';
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    // preload="none": no se descarga nada hasta que JS decide reproducirlo.
    video.preload = 'none';
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');

    var velo = document.createElement('span');
    velo.className = 'fondo-textura-velo';

    fondo.appendChild(poster);
    fondo.appendChild(video);
    fondo.appendChild(velo);

    return { fondo: fondo, poster: poster, video: video };
  }

  function crearEmojis() {
    var capa = document.createElement('div');
    capa.className = 'fondo-emoji';
    capa.setAttribute('aria-hidden', 'true');

    for (var i = 0; i < CANTIDAD_EMOJIS; i++) {
      var item = document.createElement('span');
      item.className = 'fondo-emoji-item';
      item.textContent = EMOJIS[i % EMOJIS.length];

      // Cada emoji cae con su propio ritmo y arrancamiento: nunca se ven dos
      // alineados ni se repite el patron a la vista.
      item.style.setProperty('--x', (4 + Math.random() * 92).toFixed(2) + '%');
      item.style.setProperty('--dur', (9 + Math.random() * 11).toFixed(2) + 's');
      item.style.setProperty('--delay', (-Math.random() * 18).toFixed(2) + 's');
      item.style.setProperty('--tam', (0.75 + Math.random() * 0.85).toFixed(2));
      item.style.setProperty('--giro', ((Math.random() * 90) - 45).toFixed(1) + 'deg');
      item.style.setProperty('--op', (0.28 + Math.random() * 0.32).toFixed(2));

      capa.appendChild(item);
    }
    return capa;
  }

  function reproducir(parte) {
    var video = parte.video;

    if (movimientoReducido()) {
      video.remove();
      return;
    }

    var fuente = esMovil() ? VIDEO_MOVIL : VIDEO_DESKTOP;
    if (!fuente) return;

    video.src = fuente;
    video.load();

    // Se espera al primer fotograma para no mostrar un rectangulo a medio pintar.
    var swap = function () {
      parte.fondo.classList.add('fondo-textura--vivo');
      video.classList.add('fondo-textura-video--visible');
    };

    var alPintar = function () {
      if (video.readyState < 2) return;
      video.removeEventListener('loadeddata', alPintar);
      swap();
      video.play().catch(function () {
        // Autoplay bloqueado: el poster ya esta puesto, asi que se ve bien.
      });
    };

    video.addEventListener('loadeddata', alPintar);
    setTimeout(alPintar, 2500);
  }

  function montar() {
    if (!document.body) return false;
    if (document.querySelector('.fondo-textura')) return true;

    var parte = crearFondo();
    document.body.appendChild(parte.fondo);

    // Los emojis cuelgan del fondo: asi quedan detras de todo el contenido.
    if (!movimientoReducido()) {
      document.body.appendChild(crearEmojis());
    }

    reproducir(parte);
    return true;
  }

  // El fondo va detras del contenido, pero delante del html.
  function ajustarCapas() {
    if (movimientoReducido()) return;
    // En pantallas grandes se soportan mas emojis sin saturar la vista.
    var esAncho = window.innerWidth >= 1024;
    var capa = document.querySelector('.fondo-emoji');
    if (capa) capa.dataset.denso = esAncho ? 'alto' : 'bajo';
  }

  if (!montar() && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', montar, { once: true });
  }
  ajustarCapas();
  window.addEventListener('resize', ajustarCapas, { passive: true });
})();
