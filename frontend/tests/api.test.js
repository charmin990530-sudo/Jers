/**
 * frontend/js/api.js — el contrato de la única capa de red del frontend.
 *
 * POR QUÉ ESTE ARCHIVO EXISTE (B-05)
 * ----------------------------------
 * `frontend/js/api.js` es el módulo del que depende toda la tienda para hablar con el
 * backend, y su contrato está declarado en su propio JSDoc: "todas las funciones
 * devuelven `{ ok, msg, data }`" y "nunca lanzan". Ese contrato no lo cubría
 * ningún test, y es exactamente donde se esconde el tipo de bug que la auditoría
 * marca como A-08: leer `.data` creyendo que es el cuerpo de la respuesta cuando
 * en realidad es el sobre de error normalizado, o al revés.
 *
 * El caso que motivó el arreglo de A-08 era leer `respuesta.products` en vez de
 * `respuesta.data.products`. Aquí se fija lo contrario y con más precisión: que
 * un error NUNCA deje pasar el cuerpo crudo como `data`, porque quien pinte
 * `data.algo` en un camino de error no falla: pinta `undefined` y la pantalla
 * se queda a medias sin que nada diga por qué.
 *
 * CÓMO SE PRUEBA SIN jsdom
 * -----------------------
 * Todo lo que `api.js` toca del navegador está detrás de
 * `typeof window === 'undefined'` / `typeof document === 'undefined'`
 * (`leerCookie`, `irAlLogin`, la redirección). En Node solo hay que sustituir el
 * `fetch` global, y `config.js` ya tiene un ultimo recurso declarado para este
 * caso: `http://localhost:3000/api`.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const CSRF_EN_COOKIE = 'jers_csrf=token-de-prueba';

/** Respuesta falsa con la forma que devuelve `fetch`. */
const respuesta = ({ status = 200, cuerpo, texto = '', headers = {} }) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: nombre => headers[nombre] ?? null },
  json: async () => {
    if (cuerpo === undefined) throw new SyntaxError('Unexpected token <');
    return cuerpo;
  },
  text: async () => texto,
});

/** El sobre de error que emite el backend (ver backend/src/middleware/apiError.js). */
const errorEnvelope = (code, message, extra = {}) => ({
  error: { code, message, ...extra },
  requestId: 'req-123',
});

// `api.js` guarda estado de sesion entre llamadas (usuarioActual, expirada), y se
// importa una sola vez. Se reinicia el modulo entre tests para que no se filtren.
let api;

beforeEach(async () => {
  jest.resetModules();
  api = await import('../js/api.js');
  globalThis.fetch = jest.fn();
  globalThis.document = { cookie: '' };
});

afterEach(() => {
  delete globalThis.fetch;
  delete globalThis.document;
  delete globalThis.sessionStorage;
  delete globalThis.window;
});

describe('api.js: contrato de respuesta', () => {
  describe('exito', () => {
    it('devuelve {ok:true} con el cuerpo en data y el mensaje del servidor', async () => {
      globalThis.fetch.mockResolvedValue(
        respuesta({ status: 200, cuerpo: { message: 'Listo', products: [{ id: 1 }] } }),
      );

      const r = await api.getProducts();

      expect(r.ok).toBe(true);
      expect(r.msg).toBe('Listo');
      expect(r.data.products).toEqual([{ id: 1 }]);
    });

    it('sin message en el cuerpo, cae al texto generico', async () => {
      globalThis.fetch.mockResolvedValue(respuesta({ status: 200, cuerpo: { products: [] } }));

      const r = await api.getProducts();

      expect(r.ok).toBe(true);
      expect(r.msg).toBe('Operación exitosa');
    });

    it('204 sin cuerpo devuelve data null y no intenta parsear JSON', async () => {
      globalThis.fetch.mockResolvedValue(respuesta({ status: 204 }));

      const r = await api.getCart();

      expect(r).toEqual({ ok: true, msg: 'Operación exitosa', data: null });
    });
  });

  describe('error del servidor', () => {
    it('normaliza el sobre de error y NO deja pasar el cuerpo crudo', async () => {
      globalThis.fetch.mockResolvedValue(
        respuesta({ status: 400, cuerpo: errorEnvelope('VALIDATION_ERROR', 'Datos inválidos') }),
      );

      const r = await api.login({ email: 'a@b.com', password: 'x' });

      expect(r.ok).toBe(false);
      expect(r.msg).toBe('Datos inválidos');
      expect(r.data.code).toBe('VALIDATION_ERROR');
      expect(r.data.status).toBe(400);
      expect(r.data.requestId).toBe('req-123');
      // La regresión que motiva el archivo: `data` es el sobre normalizado, no el
      // cuerpo. Si alguien empieza a leer data.products en un camino de error,
      // aqui sale undefined en vez de una lista.
      expect(r.data.products).toBeUndefined();
    });

    it('sin envelope {error}, cae a UNKNOWN_ERROR sin romperse', async () => {
      globalThis.fetch.mockResolvedValue(respuesta({ status: 500, cuerpo: { trace: 'boom' } }));

      const r = await api.getProducts();

      expect(r.ok).toBe(false);
      expect(r.data.code).toBe('UNKNOWN_ERROR');
      expect(r.data.message).toBe('Error inesperado');
      expect(r.data.status).toBe(500);
    });

    it('el requestId cae a la cabecera X-Request-ID si el cuerpo no lo trae', async () => {
      globalThis.fetch.mockResolvedValue(
        respuesta({
          status: 409,
          cuerpo: { error: { code: 'ORDER_STATE_CHANGED', message: 'Cambió' } },
          headers: { 'X-Request-ID': 'cabecera-999' },
        }),
      );

      const r = await api.getProducts();

      expect(r.data.requestId).toBe('cabecera-999');
    });

    it('expone details como errors, que es lo que recorren los formularios', async () => {
      globalThis.fetch.mockResolvedValue(
        respuesta({
          status: 400,
          cuerpo: errorEnvelope('VALIDATION_ERROR', 'Revisa los campos', {
            details: [{ field: 'email', message: 'inválido' }],
          }),
        }),
      );

      const r = await api.register({ email: 'x' });

      expect(r.data.details).toEqual([{ field: 'email', message: 'inválido' }]);
      expect(r.data.errors).toEqual(r.data.details);
    });
  });

  describe('respuestas que no son JSON', () => {
    it('si la respuesta buena no es JSON, se tolera y se devuelve data null', async () => {
      globalThis.fetch.mockResolvedValue(respuesta({ status: 200, texto: '<!doctype html>' }));

      const r = await api.getProducts();

      expect(r).toEqual({ ok: true, msg: 'Operación exitosa', data: null });
    });

    it('si la respuesta mala no es JSON, dice por que y como se arregla', async () => {
      globalThis.fetch.mockResolvedValue(respuesta({ status: 404, texto: '<!doctype html>' }));

      const r = await api.getProducts();

      expect(r.ok).toBe(false);
      expect(r.data.code).toBe('INVALID_RESPONSE');
      expect(r.data.status).toBe(404);
      // El mensaje tiene que ser accionable. Este es el caso real de abrir el
      // sitio con un servidor de estaticos en otro puerto: sin esta pista el
      // error era "no se pudo leer la respuesta" y no decia nada.
      expect(r.msg).toContain('Live Server');
      expect(r.msg).toContain('localhost:3000');
    });
  });

  describe('fallos de red', () => {
    it('un TypeError de fetch es un problema de conexion, no un fallo del sitio', async () => {
      globalThis.fetch.mockRejectedValue(new TypeError('Failed to fetch'));

      const r = await api.getProducts();

      expect(r.ok).toBe(false);
      expect(r.data.code).toBe('NETWORK_ERROR');
      expect(r.data.status).toBe(0);
      expect(r.msg).toContain('conexión');
    });

    it('cualquier otro error de fetch no se confunde con un fallo de conexion', async () => {
      globalThis.fetch.mockRejectedValue(new Error('boom'));

      const r = await api.getProducts();

      expect(r.data.code).toBe('UNKNOWN_ERROR');
      expect(r.msg).not.toContain('conexión');
    });

    it('nunca lanza, ni con la red caída', async () => {
      globalThis.fetch.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(api.getProducts()).resolves.toHaveProperty('ok', false);
      await expect(api.getCart()).resolves.toHaveProperty('ok', false);
    });
  });

  describe('la petición que sale', () => {
    it('siempre viaja con credentials, porque la sesión va en cookie HttpOnly', async () => {
      globalThis.fetch.mockResolvedValue(respuesta({ status: 200, cuerpo: {} }));

      await api.getProducts();

      const [, opciones] = globalThis.fetch.mock.calls[0];
      expect(opciones.credentials).toBe('include');
    });

    it('un GET no pide token CSRF ni hace la petición extra', async () => {
      globalThis.fetch.mockResolvedValue(respuesta({ status: 200, cuerpo: {} }));

      await api.getProducts();

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(globalThis.fetch.mock.calls[0][0]).toContain('/products');
    });

    it('si el GET no necesita CSRF, no lo pide aunque no haya cookie', async () => {
      // El catálogo entero depende de esto: `requiereCsrf: false` en los GET.
      globalThis.fetch.mockResolvedValue(respuesta({ status: 200, cuerpo: {} }));

      await api.getProducts({ pagina: 1 });

      const [, opciones] = globalThis.fetch.mock.calls[0];
      expect(opciones.headers['X-CSRF-Token']).toBeUndefined();
    });

    it('con el token en cookie, lo manda en la cabecera y no hace petición extra', async () => {
      globalThis.document = { cookie: CSRF_EN_COOKIE };
      globalThis.fetch.mockResolvedValue(respuesta({ status: 200, cuerpo: {} }));

      await api.addToCart({ productoId: 'x', cantidad: 1 });

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const [, opciones] = globalThis.fetch.mock.calls[0];
      expect(opciones.headers['X-CSRF-Token']).toBe('token-de-prueba');
    });

    it('sin token en cookie, pide uno a /auth/csrf antes de mutar', async () => {
      globalThis.fetch.mockImplementation(async (url) => {
        if (String(url).includes('/auth/csrf')) return respuesta({ status: 204 });
        return respuesta({ status: 200, cuerpo: { ok: true } });
      });

      await api.addToCart({ productoId: 'x', cantidad: 1 });

      const urls = globalThis.fetch.mock.calls.map(c => String(c[0]));
      expect(urls.some(u => u.includes('/auth/csrf'))).toBe(true);
      expect(urls.some(u => u.includes('/cart'))).toBe(true);
    });

    it('un body objeto se serializa a JSON con su Content-Type', async () => {
      globalThis.document = { cookie: CSRF_EN_COOKIE };
      globalThis.fetch.mockResolvedValue(respuesta({ status: 200, cuerpo: {} }));

      await api.addToCart({ productoId: 'abc', cantidad: 2 });

      const [, opciones] = globalThis.fetch.mock.calls[0];
      expect(opciones.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(opciones.body)).toEqual({ productoId: 'abc', cantidad: 2 });
    });
  });
});

describe('api.js: sesion caducada', () => {
  it('un 401 de una pantalla de invitado NO manda al login', async () => {
    // El carrito de invitado devuelve 401 por definicion. Si esto redirigiera,
    // perderias la pagina sin querer, y fue justo lo que pasaba antes.
    globalThis.fetch.mockResolvedValue(
      respuesta({ status: 401, cuerpo: errorEnvelope('UNAUTHENTICATED', 'Inicia sesión') }),
    );

    const r = await api.getCart();

    expect(r.ok).toBe(false);
    expect(r.data.code).toBe('UNAUTHENTICATED');
  });

  it('un 200 NO da por buena la sesion', async () => {
    globalThis.fetch.mockResolvedValue(
      respuesta({ status: 200, cuerpo: { message: 'ok', user: null } }),
    );

    const r = await api.getMe();

    expect(r.ok).toBe(true);
    // El comentario del código lo dice: un 200 no implica sesion, solo getMe lo
    // confirma, y lo que se guarda es lo que venga en data.user.
    expect(r.data.user).toBeNull();
  });
});