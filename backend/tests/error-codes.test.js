/**
 * Contrato de codigos de error de la API.
 *
 * POR QUE EXISTE
 * --------------
 * El frontend ramifica mirando `error.code`, nunca el texto del mensaje
 * (ver apiError.js). Para que eso funcione, cada clave de `ErrorCodes` tiene que
 * valer exactamente lo que se llama: si dos claves distintas comparten valor,
 * el cliente no puede distinguirlas, y si una clave vale el nombre de otra, el
 * codigo que sale por la red no existe en el contrato.
 *
 * El bug que motivó este archivo: `PASSWORDS_MISMATCH: 'INVALID_RESET_TOKEN'`,
 * de modo que "las contraseñas no coinciden" y "el token caducó" eran el mismo
 * codigo, `ErrorCodes.INVALID_RESET_TOKEN` era `undefined`, y authController
 * emitia la cadena literal 'PASSWORDS_MISMATCH' sin usar la constante.
 */
import { describe, it, expect } from '@jest/globals';
import { ErrorCodes, AppError, buildErrorBody, sendError } from '../src/middleware/apiError.js';

describe('contrato de codigos de error', () => {
  it('cada clave vale exactamente su nombre', () => {
    const incoherentes = Object.entries(ErrorCodes)
      .filter(([clave, valor]) => clave !== valor)
      .map(([clave, valor]) => `${clave} => ${valor}`);
    expect(incoherentes).toEqual([]);
  });

  it('no hay dos claves con el mismo valor', () => {
    const vistos = new Map();
    const duplicados = [];
    for (const [clave, valor] of Object.entries(ErrorCodes)) {
      if (vistos.has(valor)) duplicados.push(`${vistos.get(valor)} y ${clave} comparten '${valor}'`);
      vistos.set(valor, clave);
    }
    expect(duplicados).toEqual([]);
  });

  it('el codigo de contrasenas que no coinciden es distinguible del de token caducado', () => {
    expect(ErrorCodes.PASSWORDS_MISMATCH).toBe('PASSWORDS_MISMATCH');
    expect(ErrorCodes.INVALID_RESET_TOKEN).toBe('INVALID_RESET_TOKEN');
    expect(ErrorCodes.PASSWORDS_MISMATCH).not.toBe(ErrorCodes.INVALID_RESET_TOKEN);
  });

  it('el error se serializa con la forma que espera el frontend', () => {
    const error = new AppError('Las contraseñas no coinciden', 400, ErrorCodes.PASSWORDS_MISMATCH);
    expect(error.isOperational).toBe(true);
    expect(error.statusCode).toBe(400);

    const cuerpo = buildErrorBody(ErrorCodes.PASSWORDS_MISMATCH, error.message, undefined, 'req-1');
    expect(cuerpo).toEqual({
      error: { code: 'PASSWORDS_MISMATCH', message: 'Las contraseñas no coinciden' },
      requestId: 'req-1',
    });
  });

  it('sendError no escribe si la respuesta ya se envio', () => {
    //(evita "Cannot set headers after they are sent")
    let llamadas = 0;
    const res = {
      headersSent: true,
      status() { llamadas += 1; return this; },
      json() { llamadas += 1; return this; },
      locals: { requestId: 'r' },
    };
    sendError(res, 500, ErrorCodes.INTERNAL_ERROR, 'x');
    expect(llamadas).toBe(0);
  });
});
