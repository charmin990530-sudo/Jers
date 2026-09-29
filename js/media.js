/**
 * media.js - Componente de video perezoso
 * Regras:
 * - muted, loop, playsinline, preload="none", disablepictureinpicture
 * - Fuente asignada por JS cuando entra al viewport (IntersectionObserver)
 * - Máximo 2 videos reproduciéndose a la vez
 * - Pausa con visibilitychange
 * - NO autoplay si: prefers-reduced-motion, saveData, 2g/slow-2g
 * - Botón pausa/reproducir si dura > 5s
 * - Fundido poster -> video
 * - Fallback al poster si el video falla
 */

const MAX_VIDEOS_SIMULTANEOS = 2;
const videosActivos = new Set();

const debeDesactivarAutoplay = () => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
  if (navigator.connection?.saveData) return true;
  if (['2g', 'slow-2g'].includes(navigator.connection?.effectiveType)) return true;
  return false;
};

const esMovil = () => window.matchMedia('(max-width: 768px)').matches;

const pausarVideo = (video) => {
  if (!video.paused) {
    video.pause();
    videosActivos.delete(video);
  }
};

const reproducirVideo = (video) => {
  if (videosActivos.size >= MAX_VIDEOS_SIMULTANEOS) {
    const primerVideo = videosActivos.values().next().value;
    if (primerVideo) pausarVideo(primerVideo);
  }
  video.play().then(() => {
    videosActivos.add(video);
  }).catch(() => {
    // Autoplay bloqueado: mostrar poster
  });
};

const crearBotonPausa = (video, contenedor) => {
  if (video.duration <= 5 || video.dataset.botonCreado) return;
  video.dataset.botonCreado = 'true';

  const boton = document.createElement('button');
  boton.className = 'media-pausa-btn';
  boton.setAttribute('aria-label', 'Pausar video');
  boton.innerHTML = '<span class="icono-pausa">⏸</span>';

  boton.addEventListener('click', (e) => {
    e.stopPropagation();
    if (video.paused) {
      reproducirVideo(video);
      boton.innerHTML = '<span class="icono-pausa">⏸</span>';
      boton.setAttribute('aria-label', 'Pausar video');
    } else {
      pausarVideo(video);
      boton.innerHTML = '<span class="icono-play">▶</span>';
      boton.setAttribute('aria-label', 'Reproducir video');
    }
  });

  video.addEventListener('play', () => {
    boton.innerHTML = '<span class="icono-pausa">⏸</span>';
    boton.setAttribute('aria-label', 'Pausar video');
  });

  video.addEventListener('pause', () => {
    boton.innerHTML = '<span class="icono-play">▶</span>';
    boton.setAttribute('aria-label', 'Reproducir video');
  });

  contenedor.appendChild(boton);
};

const inicializarVideo = (contenedor) => {
  const video = contenedor.querySelector('video');
  const poster = contenedor.querySelector('.media-poster');

  if (!video) return;

  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'none';
  video.disablePictureInPicture = true;
  video.setAttribute('aria-hidden', 'true');

  const fuente = esMovil() ? video.dataset.srcMobile : video.dataset.srcDesktop;
  if (!fuente) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        if (!video.src) {
          video.src = fuente;
          video.load();
        }
        if (!debeDesactivarAutoplay()) {
          reproducirVideo(video);
        }
        crearBotonPausa(video, contenedor);
        observer.unobserve(video);
      } else {
        pausarVideo(video);
      }
    });
  }, { threshold: 0.25 });

  observer.observe(video);

  video.addEventListener('error', () => {
    if (poster) poster.style.display = 'block';
    video.style.display = 'none';
  });

  video.addEventListener('loadeddata', () => {
    if (poster) {
      poster.style.opacity = '0';
      setTimeout(() => { poster.style.display = 'none'; }, 300);
    }
  });
};

const inicializarMedios = () => {
  document.querySelectorAll('.media-contenedor').forEach(inicializarVideo);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      videosActivos.forEach(pausarVideo);
    }
  });
};

export { inicializarMedios };
