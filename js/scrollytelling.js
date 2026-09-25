/**
 * scrollytelling.js - Reproduce una secuencia de imágenes (frames) sincronizada
 * con el scroll, dibujándolas en un <canvas> que queda fijo (sticky) mientras
 * el resto de la sección se desplaza por encima.
 */

export function inicializarScrollytelling() {
    document.querySelectorAll('.scrolly').forEach(configurarSeccion);
}

function configurarSeccion(seccion) {
    const pin = seccion.querySelector('.scrolly-pin');
    const canvas = seccion.querySelector('.scrolly-canvas');
    if (!pin || !canvas) return;

    const totalFrames = parseInt(seccion.dataset.frames, 10) || 0;
    const rutaBase = seccion.dataset.path;
    const extension = seccion.dataset.ext || 'webp';
    const digitos = parseInt(seccion.dataset.digits, 10) || 4;

    if (!totalFrames || !rutaBase) {
        console.warn('[scrollytelling] Falta data-frames o data-path en', seccion);
        return;
    }

    const ctx = canvas.getContext('2d');
    const imagenes = new Array(totalFrames);
    let frameDibujado = -1;
    let animando = false;

    const rutaFrame = (indice) =>
        `${rutaBase}_${String(indice + 1).padStart(digitos, '0')}.${extension}`;

    function precargar() {
        for (let i = 0; i < totalFrames; i++) {
            const img = new Image();
            img.decoding = 'async';
            if (i === 0) img.onload = () => dibujar(0);
            img.src = rutaFrame(i);
            imagenes[i] = img;
        }
    }

    function dibujar(indice) {
        const img = imagenes[indice];
        if (!img || !img.complete || img.naturalWidth === 0) return;

        const dpr = window.devicePixelRatio || 1;
        const anchoDestino = pin.clientWidth * dpr;
        const altoDestino = pin.clientHeight * dpr;

        if (canvas.width !== anchoDestino || canvas.height !== altoDestino) {
            canvas.width = anchoDestino;
            canvas.height = altoDestino;
        }

        const escala = Math.max(canvas.width / img.width, canvas.height / img.height);
        const x = (canvas.width - img.width * escala) / 2;
        const y = (canvas.height - img.height * escala) / 2;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, x, y, img.width * escala, img.height * escala);
        frameDibujado = indice;
    }

    function progreso() {
        const alturaScrolleable = seccion.offsetHeight - window.innerHeight;
        if (alturaScrolleable <= 0) return 0;
        const avance = -seccion.getBoundingClientRect().top;
        return Math.min(Math.max(avance / alturaScrolleable, 0), 1);
    }

    function alScroll() {
        const frame = Math.min(totalFrames - 1, Math.floor(progreso() * totalFrames));
        if (frame === frameDibujado || animando) return;
        animando = true;
        requestAnimationFrame(() => {
            dibujar(frame);
            animando = false;
        });
    }

    precargar();
    window.addEventListener('scroll', alScroll, { passive: true });
    window.addEventListener('resize', () => dibujar(Math.max(frameDibujado, 0)));
    alScroll();
}
