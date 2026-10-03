/**
 * redact() — lo que sale a los logs y al cliente nunca lleva un secreto.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * --------------------------
 * `redact` se aplica a TODOS los mensajes de error del backend: al que se
 * devuelve al cliente y al que se escribe en el log. Es la única barrera entre un
 * token o una contraseña que venga dentro de un mensaje de dependencia y el disco.
 *
 * B-32 daba por posible que los drivers de Mongo y Redis metieran la URL con
 * contraseña en sus mensajes, y decía de verdad "potencial, no confirmado". Se
 * comprobó con cuatro caminos reales (conexión rechazada, autenticación fallida,
 * protocolo inválido y host inalcanzable) y ninguno la mete. Aun así el patrón de
 * credenciales en URL se cubre aquí, porque `redact` recibe también los errores de
 * terceros y no solo los del proyecto.
 *
 * `redact` no está exportado de errorHandler.js a propósito: no forma parte de la
 * API pública del módulo. Se prueba a través del `errorHandler`, que es por donde
 * pasa todo.
 */
import { describe, it, expect } from '@jest/globals';
import { errorHandler } from '../src/middleware/errorHandler.js';

/** Ejecuta el errorHandler y devuelve el cuerpo que se mandaría al cliente. */
const mandarError = (err, { NODE_ENV = 'production' } = {}) => {
  const procesoAnterior = process.env.NODE_ENV;
  process.env.NODE_ENV = NODE_ENV;
  try {
    let cuerpo;
    const res = {
      status() { return this; },
      json(c) { cuerpo = c; return this; },
      set() { return this; },
      headersSent: false,
      locals: {},
    };
    errorHandler(err, { originalUrl: '/api/test', method: 'GET', requestId: 'req-1' }, res, () => {});
    return cuerpo;
  } finally {
    process.env.NODE_ENV = procesoAnterior;
  }
};

/** Como mandarError, pero devuelve lo que se escribiría en el log. */
const capturarLog = fn => {
  const original = console.error;
  const lineas = [];
  console.error = (...args) => lineas.push(args.map(a =>
    typeof a === 'object' && a !== null ? JSON.stringify(a) : String(a)).join(' '));
  try {
    fn();
  } finally {
    console.error = original;
  }
  return lineas.join('\n');
};

const errorConMensaje = mensaje => {
  const e = new Error(mensaje);
  e.statusCode = 500;
  return e;
};

/**
 * Un error 500 no devuelve su mensaje al cliente ("Error interno del servidor"),
 * asi que la redacción se comprueba sobre el log, que es donde si aparece. Para
 * verlo en el cuerpo hace falta un error operacional con 4xx, y eso lo cubren los
 * dos ultimos tests del archivo.
 */
const logDe = mensaje => capturarLog(() => mandarError(errorConMensaje(mensaje)));

describe('redact: secretos en la query string', () => {
  it('redacta un token', () => {
    const salida = logDe('Fallo en /auth/callback?token=abc123def&state=1');
    expect(salida).not.toContain('abc123def');
    expect(salida).toContain('REDACTED');
  });

  it('redacta un access_token aunque venga en medio', () => {
    expect(logDe('error?a=1&access_token=secreto123&b=2')).not.toContain('secreto123');
  });

  it('redacta el JWT entero que va despues de "Bearer ", no solo la palabra Bearer', () => {
    // Este lo destapo el propio test: el patron anterior era [^\s,;]+, asi que
    // paraba en el primer espacio y el JWT se quedaba entero en el log.
    const salida = logDe('Fallo con Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.carga.firma');
    expect(salida).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(salida).toContain('REDACTED');
  });

  it('redacta TODOS los valores de una cabecera Cookie, no solo el primero', () => {
    const salida = logDe('Fallo con Cookie: session=abc123;otra=def456');
    expect(salida).not.toContain('abc123');
    expect(salida).not.toContain('def456');
  });

  it('no toca los parametros que no son secretos', () => {
    const salida = logDe('error?a=1&token=secreto&b=2');
    expect(salida).toContain('a=1');
    expect(salida).toContain('b=2');
  });
});

describe('redact: pares clave:valor', () => {
  it.each([
    'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.carga.firma',
    'Cookie: session=abc123; otra=def',
    'password: MiClaveSecreta123',
    'secret=valorSecreto',
  ])('redacta %s', mensaje => {
    const salida = logDe(mensaje);
    expect(salida).not.toMatch(/eyJhbGciOiJIUzI1NiJ9|abc123|MiClaveSecreta123|valorSecreto/);
  });
});

describe('redact: credenciales dentro de una URL', () => {
  // El patrón que B-32 daba por posible y que se verificó que los drivers no
  // producen. Se cubre para el día en que una dependencia sí lo haga.
  it.each([
    ['rediss://usuario:CLAVEDEUPSTASH@host.upstash.io:6379', 'CLAVEDEUPSTASH'],
    ['mongodb://admin:CLAVEMONGO@cluster0.mongodb.net/by-jers', 'CLAVEMONGO'],
    ['postgres://u:p@host:5432/db', 'p@host'],
    ['redis://:SOLO_LA_CLAVE@127.0.0.1:6379', 'SOLO_LA_CLAVE'],
  ])('redacta %s', (url, secreto) => {
    expect(logDe(`No se pudo conectar a ${url}`)).not.toContain(secreto);
  });

  it('deja ver el esquema y el usuario, que son lo que sirve para diagnosticar', () => {
    const salida = logDe('No se pudo conectar a rediss://usuario:CLAVEDEUPSTASH@host:6379');
    expect(salida).toContain('rediss');
    expect(salida).toContain('usuario');
    expect(salida).toContain('host');
  });

  it('no rompe una URL sin credenciales', () => {
    expect(logDe('No se pudo conectar a http://localhost:3000/api')).toContain('localhost:3000');
  });
});

describe('redact: lo que llega al log y lo que llega al cliente', () => {
  it('un error interno no devuelve el mensaje al cliente, solo al log', () => {
    const cuerpo = mandarError(errorConMensaje('mongodb://admin:CLAVEMONGO@cluster0.mongodb.net fallo'));

    expect(cuerpo.error.message).toBe('Error interno del servidor');
    expect(JSON.stringify(cuerpo)).not.toContain('CLAVEMONGO');
  });

  it('la credencial sale redactada del propio mensaje de error, en el log', () => {
    expect(logDe('mongodb://admin:CLAVEMONGO@cluster0.mongodb.net fallo')).not.toContain('CLAVEMONGO');
  });

  it('pero el log tampoco guarda la credencial', () => {
    const salida = capturarLog(() =>
      mandarError(errorConMensaje('mongodb://admin:CLAVEMONGO@cluster0.mongodb.net fallo')));

    expect(salida).not.toContain('CLAVEMONGO');
    expect(salida).toContain('REDACTED');
  });

  it('un error operacional sí devuelve el mensaje, y también va redactado', () => {
    const e = errorConMensaje('Token inválido: ?token=abc123');
    e.statusCode = 401;
    e.isOperational = true;

    const cuerpo = mandarError(e);

    expect(cuerpo.error.message).not.toContain('abc123');
    expect(cuerpo.error.message).toContain('REDACTED');
  });

  it('un mensaje vacío o nulo no revienta', () => {
    expect(() => mandarError(errorConMensaje(''))).not.toThrow();
    const e = new Error();
    e.statusCode = 500;
    expect(() => mandarError(e)).not.toThrow();
  });
});