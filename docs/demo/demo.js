/* Se incluye únicamente en el build de demo. No modifica la tienda real. */
/* global window, Response, Request, URL, location, document, MutationObserver, Element */
(() => {
  const originalFetch = window.fetch.bind(window);
  const catalog = originalFetch('/catalogo.json').then(response => {
    if (!response.ok) throw new Error('Catálogo de demo no disponible');
    return response.json();
  });
  const reply = (data, ok = true, msg = 'Datos de demostración', status = 200) =>
    new Response(JSON.stringify(ok ? { ...data, message: msg } : { error: { code: 'DEMO_READ_ONLY', message: msg } }), { status, headers: { 'Content-Type': 'application/json' } });

  // Todos los endpoints API quedan dentro de esta demo de solo lectura.
  window.fetch = async (input, options = {}) => {
    const url = new URL(input instanceof Request ? input.url : input, location.origin);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api')) return originalFetch(input, options);
    const method = String(options.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (method !== 'GET') return reply(null, false, 'Demo visual: esta operación requiere el backend y no está habilitada.', 403);
    const { products, brands } = await catalog;
    const route = decodeURIComponent(url.pathname.slice(4));
    if (route === '/auth/me') return reply({ user: null });
    if (route === '/studio/products') return reply({ products });
    if (route === '/products/marcas') return reply({ brands });
    if (route === '/products/featured') return reply({ products: products.filter(p => p.destacado) });
    if (route === '/products/promociones') return reply({ products: products.filter(p => p.enPromocion) });
    if (route.startsWith('/products')) {
      const reserved = ['/products', '/products/buscar'];
      if (!reserved.includes(route) && !route.startsWith('/products/categoria/')) {
        const id = route.split('/').pop();
        const product = products.find(p => p._id === id || p.slug === id);
        return product ? reply({ product }) : reply(null, false, 'Producto no encontrado', 404);
      }
      let list = products;
      if (route.startsWith('/products/categoria/')) {
        const slug = route.split('/').pop();
        const categories = slug === 'maquillaje' ? ['rostro', 'ojos', 'labios']
          : slug === 'cabello' ? ['shampoo', 'acondicionador', 'tratamientos'] : [slug];
        list = list.filter(p => categories.includes(p.categoria.slug));
      }
      const term = (url.searchParams.get('search') || url.searchParams.get('q') || '').toLocaleLowerCase('es');
      if (term) list = list.filter(p => `${p.nombre} ${p.descripcionCorta}`.toLocaleLowerCase('es').includes(term));
      const limit = Math.max(1, Math.min(50, Number(url.searchParams.get('limit')) || 12));
      const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
      return reply({ products: list.slice((page - 1) * limit, page * limit), total: list.length, page, pages: Math.ceil(list.length / limit) });
    }
    return reply(null, false, 'Función no disponible en la demo visual.', 403);
  };

  document.addEventListener('DOMContentLoaded', () => {
    const banner = document.createElement('aside');
    banner.setAttribute('aria-label', 'Información de la demo');
    banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#082e24;color:#fff;padding:10px 16px;text-align:center;font:13px/1.5 system-ui;box-shadow:0 -2px 14px #0003';
    banner.textContent = 'DEMO DE PORTAFOLIO · Catálogo de muestra · Sin compras, registro ni pagos reales';
    document.body.append(banner);
    document.body.style.paddingBottom = '60px';
    const inform = () => {
      banner.textContent = 'Esta es una demo visual. Las cuentas, los pedidos y el contacto requieren el backend. Puedes explorar la tienda y el catálogo.';
    };
    // Evitar que el visitante ingrese información personal en formularios sin backend.
    const disableForms = () => {
      document.querySelectorAll('form input, form textarea, form select, form button').forEach(element => {
        element.disabled = true;
        element.title = 'Formulario deshabilitado en la demo de portafolio';
      });
    };
    new MutationObserver(disableForms).observe(document.querySelector('app-root'), { childList: true, subtree: true });
    disableForms();
    document.addEventListener('submit', event => { event.preventDefault(); event.stopImmediatePropagation(); inform(); }, true);
    const blocked = /^\/(login|register|recuperar|reset-password|checkout|admin|carrito|pedidos|perfil|direcciones|mi-perfil|mis-direcciones|mis-datos|contacto)(\/|$)/;
    document.addEventListener('click', event => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (anchor && blocked.test(new URL(anchor.href, location.origin).pathname)) {
        event.preventDefault(); event.stopImmediatePropagation(); inform();
      }
    }, true);
  });
})();
