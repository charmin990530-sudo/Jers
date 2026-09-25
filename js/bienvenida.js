const PRODUCT_URL = 'data/producto-destacado.json';
const FALLBACK_PRODUCT = {
    nombre: 'By Jers',
    precio: 45900,
    precioAnterior: 59900,
    carpetaFrames: 'img/hero-secuencia',
    prefijoFrames: 'frame',
    totalFrames: 1,
    extension: 'webp',
    digitos: 4,
    linkDestino: 'index.html',
};

const elements = {
    loader: document.getElementById('intro-loader'),
    loaderProgress: document.getElementById('loader-progress'),
    loaderBar: document.getElementById('loader-bar'),
    scrollArea: document.getElementById('intro-scroll'),
    pin: document.getElementById('intro-pin'),
    canvas: document.getElementById('hero-canvas'),
    eyebrow: document.getElementById('product-eyebrow'),
    name: document.getElementById('product-name'),
    price: document.getElementById('product-price'),
    previousPrice: document.getElementById('product-previous-price'),
    discount: document.getElementById('discount-badge'),
    storeLink: document.getElementById('store-link'),
    scrollHint: document.getElementById('scroll-hint'),
    fallbackNotice: document.getElementById('fallback-notice'),
};

const currency = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
});

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const context = elements.canvas?.getContext('2d', { alpha: false });
let frames = [];
let lastDrawnFrame = -1;
let resizeTimer = 0;
let motionState = null;

const safeFolder = value => {
    const folder = String(value || '').trim().replace(/^\/+|\/+$/g, '');
    const segments = folder.split('/');
    if (!folder || segments.some(segment => !segment || segment === '.' || segment === '..' || segment.startsWith('.'))) {
        throw new Error('Carpeta de frames no válida');
    }
    return folder;
};

const safeDestination = value => {
    try {
        const destination = new URL(String(value || 'index.html'), window.location.href);
        if (destination.origin !== window.location.origin) return 'index.html';
        return `${destination.pathname.replace(/^\/+/, '')}${destination.search}${destination.hash}` || 'index.html';
    } catch {
        return 'index.html';
    }
};

const normalizeProduct = raw => {
    const totalFrames = Number(raw?.totalFrames);
    const digits = Number(raw?.digitos);
    const precio = Number(raw?.precio);
    const precioAnterior = raw?.precioAnterior === null || raw?.precioAnterior === undefined
        ? null
        : Number(raw.precioAnterior);
    const prefix = String(raw?.prefijoFrames || 'frame');
    const extension = String(raw?.extension || 'webp');
    if (!Number.isInteger(totalFrames) || totalFrames < 1 || totalFrames > 1000) throw new Error('Cantidad de frames no válida');
    if (!Number.isInteger(digits) || digits < 1 || digits > 6) throw new Error('Dígitos de frames no válidos');
    if (!Number.isFinite(precio) || precio < 0) throw new Error('Precio no válido');
    if (!/^[A-Za-z0-9_-]+$/.test(prefix) || !/^[A-Za-z0-9]+$/.test(extension)) throw new Error('Formato de frames no válido');
    if (precioAnterior !== null && (!Number.isFinite(precioAnterior) || precioAnterior <= 0)) throw new Error('Precio anterior no válido');
    return {
        nombre: String(raw?.nombre || 'By Jers').trim().slice(0, 120) || 'By Jers',
        precio,
        precioAnterior,
        carpetaFrames: safeFolder(raw?.carpetaFrames),
        prefijoFrames: prefix,
        totalFrames,
        extension,
        digitos: digits,
        linkDestino: safeDestination(raw?.linkDestino),
    };
};

const fetchProduct = async () => {
    const response = await fetch(PRODUCT_URL, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error('No se pudo cargar el producto');
    return normalizeProduct(await response.json());
};

const renderProduct = (product, usedFallback) => {
    elements.name.textContent = product.nombre;
    elements.price.textContent = currency.format(product.precio);
    elements.storeLink.href = product.linkDestino;
    elements.fallbackNotice.hidden = !usedFallback;
    if (product.precioAnterior && product.precioAnterior > product.precio) {
        const discount = Math.round((1 - product.precio / product.precioAnterior) * 100);
        elements.previousPrice.hidden = false;
        elements.previousPrice.textContent = currency.format(product.precioAnterior);
        elements.discount.hidden = false;
        elements.discount.textContent = `-${discount}%`;
    } else {
        elements.previousPrice.hidden = true;
        elements.discount.hidden = true;
    }
};

const framePath = (product, index) => {
    const number = String(index + 1).padStart(product.digitos, '0');
    return `${product.carpetaFrames}/${product.prefijoFrames}_${number}.${product.extension}`;
};

const setLoadProgress = (loaded, total) => {
    const percentage = total ? Math.round((loaded / total) * 100) : 100;
    elements.loaderProgress.textContent = `${percentage}%`;
    elements.loaderBar.style.transform = `scaleX(${percentage / 100})`;
};

const preloadFrames = product => {
    const total = product.totalFrames;
    let loaded = 0;
    return Promise.all(Array.from({ length: total }, (_, index) => new Promise(resolve => {
        const image = new Image();
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            loaded += 1;
            setLoadProgress(loaded, total);
            resolve(image.complete && image.naturalWidth > 0 ? image : null);
        };
        image.decoding = 'async';
        image.onload = finish;
        image.onerror = finish;
        image.src = framePath(product, index);
    })));
};

const drawFrame = (requestedIndex, force = false) => {
    if (!context || !frames.length) return;
    const index = clamp(Math.round(requestedIndex), 0, frames.length - 1);
    if (!force && index === lastDrawnFrame) return;
    const image = frames[index] || frames.find(Boolean);
    if (!image) return;
    const bounds = elements.canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    const width = Math.round(bounds.width * dpr);
    const height = Math.round(bounds.height * dpr);
    if (elements.canvas.width !== width || elements.canvas.height !== height) {
        elements.canvas.width = width;
        elements.canvas.height = height;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, bounds.width, bounds.height);
    const scale = Math.max(bounds.width / image.naturalWidth, bounds.height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    context.drawImage(image, (bounds.width - drawWidth) / 2, (bounds.height - drawHeight) / 2, drawWidth, drawHeight);
    lastDrawnFrame = index;
};

const hideLoader = () => {
    elements.loader.setAttribute('aria-busy', 'false');
    if (motionPreference.matches) {
        document.body.classList.add('is-ready');
        elements.loader.style.display = 'none';
        return;
    }
    requestAnimationFrame(() => document.body.classList.add('is-ready'));
};

const showStaticState = () => {
    document.body.classList.add('is-static');
    if (window.gsap) {
        window.gsap.set([elements.eyebrow, elements.name, elements.price.parentElement, elements.storeLink], { clearProps: 'all' });
    }
};

const setupMotion = lastFrame => {
    const gsap = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;
    if (!gsap || !ScrollTrigger) {
        showStaticState();
        return;
    }
    gsap.registerPlugin(ScrollTrigger);
    const copyTargets = [elements.eyebrow, elements.name, elements.price.parentElement, elements.storeLink];
    if (!elements.fallbackNotice.hidden) copyTargets.push(elements.fallbackNotice);
    gsap.set(copyTargets, { autoAlpha: 0, y: 24 });
    const frameState = { frame: 0 };
    const getEnd = () => `+=${Math.max(elements.scrollArea.offsetHeight - window.innerHeight, window.innerHeight * 2)}`;
    const updateCopy = progress => {
        gsap.set(elements.scrollHint, { autoAlpha: progress < 0.18 ? 1 : 0 });
    };
    ScrollTrigger.create({
        trigger: elements.pin,
        start: 'top top',
        end: getEnd,
        pin: true,
        scrub: true,
        onUpdate: self => updateCopy(self.progress),
    });
    gsap.to(frameState, {
        frame: lastFrame,
        ease: 'none',
        scrollTrigger: {
            trigger: elements.scrollArea,
            start: 'top top',
            end: getEnd,
            scrub: true,
            onUpdate: () => drawFrame(frameState.frame),
        },
    });
    const copyTimeline = gsap.timeline({
        scrollTrigger: {
            trigger: elements.scrollArea,
            start: 'top top',
            end: getEnd,
            scrub: true,
        },
    });
    copyTimeline
        .fromTo(elements.eyebrow, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.12, ease: 'power2.out' }, 0.04)
        .fromTo(elements.name, { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 0.16, ease: 'power2.out' }, 0.18)
        .fromTo(elements.price.parentElement, { autoAlpha: 0, y: 22 }, { autoAlpha: 1, y: 0, duration: 0.15, ease: 'power2.out' }, 0.42)
        .fromTo(elements.storeLink, { autoAlpha: 0, y: 22 }, { autoAlpha: 1, y: 0, duration: 0.16, ease: 'power2.out' }, 0.68);
    if (!elements.fallbackNotice.hidden) {
        copyTimeline.fromTo(elements.fallbackNotice, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.1, ease: 'power2.out' }, 0.78);
    }
    motionState = { frameState, copyTimeline };
    window.setTimeout(() => ScrollTrigger.refresh(), 0);
};

const handleResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
        const currentFrame = motionState?.frameState.frame ?? frames.length - 1;
        drawFrame(currentFrame, true);
        window.ScrollTrigger?.refresh();
    }, 120);
};

const initialize = async () => {
    let product;
    let usedFallback = false;
    try {
        product = await fetchProduct();
    } catch {
        product = FALLBACK_PRODUCT;
        usedFallback = true;
    }
    renderProduct(product, usedFallback);
    try {
        frames = await preloadFrames(product);
    } catch {
        frames = [];
    }
    if (!frames.some(Boolean)) {
        document.body.classList.add('is-fallback', 'is-static');
        hideLoader();
        return;
    }
    const lastFrame = frames.length - 1;
    drawFrame(motionPreference.matches ? lastFrame : 0, true);
    if (motionPreference.matches || usedFallback) {
        showStaticState();
        drawFrame(lastFrame, true);
    } else {
        setupMotion(lastFrame);
    }
    window.addEventListener('resize', handleResize, { passive: true });
    hideLoader();
};

initialize().catch(() => {
    document.body.classList.add('is-fallback', 'is-static');
    if (elements.fallbackNotice) elements.fallbackNotice.hidden = false;
    hideLoader();
});
