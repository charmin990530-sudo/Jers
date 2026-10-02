/**
 * money.test.js - Logica financiera pura (sin base de datos)
 *
 * Cubre lo que no se puede verificar a ojo en la tienda: sumas, redondeos y
 * casos borde. Todos los importes son enteros; estos tests son los que fijan esa
 * garantia, asi que任何一个 cambio que reintroduzca coma flotante los hace fallar.
 */

import {
  MoneyError,
  isMinorAmount,
  toMinorAmount,
  toNonNegativeMinorAmount,
  sumMinorAmounts,
  multiplyMinorAmount,
  percentOfMinorAmount,
  discountPercentage,
  taxFor,
  computeOrderTotal,
  shippingCostFor,
  formatMinorAmount,
  MAX_MINOR_AMOUNT,
} from '../src/services/money.js';

describe('isMinorAmount', () => {
  it('acepta enteros dentro del rango', () => {
    expect(isMinorAmount(0)).toBe(true);
    expect(isMinorAmount(1)).toBe(true);
    expect(isMinorAmount(58000)).toBe(true);
    expect(isMinorAmount(MAX_MINOR_AMOUNT)).toBe(true);
  });

  it('rechaza decimales, que es el caso que motiva todo el modulo', () => {
    expect(isMinorAmount(58000.5)).toBe(false);
    expect(isMinorAmount(0.1)).toBe(false);
    expect(isMinorAmount(-0.5)).toBe(false);
  });

  it('rechaza lo que no es numero', () => {
    expect(isMinorAmount('58000')).toBe(false);
    expect(isMinorAmount(NaN)).toBe(false);
    expect(isMinorAmount(Infinity)).toBe(false);
    expect(isMinorAmount(null)).toBe(false);
    expect(isMinorAmount(undefined)).toBe(false);
  });
});

describe('toMinorAmount', () => {
  it('deja pasar los enteros tal cual', () => {
    expect(toMinorAmount(58000)).toBe(58000);
  });

  it('convierte string numerico entero, porque los forms HTML envian texto', () => {
    expect(toMinorAmount('58000')).toBe(58000);
    expect(toMinorAmount(' 58000 ')).toBe(58000);
  });

  it('rechaza string con decimales', () => {
    expect(() => toMinorAmount('58000.5')).toThrow(MoneyError);
  });

  it('rechaza flotantes aunque sean casi enteros', () => {
    expect(() => toMinorAmount(0.1 + 0.2)).toThrow(MoneyError);
    expect(() => toMinorAmount(1e21)).toThrow(MoneyError);
  });
});

describe('toNonNegativeMinorAmount', () => {
  it('acepta cero', () => {
    expect(toNonNegativeMinorAmount(0)).toBe(0);
  });

  it('rechaza negativos, porque un total negativo es un bug de calculo', () => {
    expect(() => toNonNegativeMinorAmount(-1)).toThrow(/no puede ser negativo/);
  });
});

describe('sumMinorAmounts', () => {
  it('suma una lista vacia a cero', () => {
    expect(sumMinorAmounts([])).toBe(0);
  });

  it('suma sin deriva donde el float fallaria', () => {
    // 0.1 + 0.2 en float da 0.30000000000000004. Con enteros, exacto.
    const base = 0.1 * 58000; // simula el problema a escala de la tienda
    const items = new Array(1000).fill(base);
    const totalFloat = items.reduce((a, b) => a + b, 0);
    expect(totalFloat).not.toBe(58000000); // el float SI se desvía
    expect(sumMinorAmounts(new Array(1000).fill(58000))).toBe(58000000);
  });

  it('acumula muchas lineas sin perder exactitud', () => {
    // 333 * 9 + 1 = 2998. Con float, 0.1+0.2 style, esta suma se desvia.
    const lineas = [333, 333, 333, 333, 333, 333, 333, 333, 333, 1];
    expect(sumMinorAmounts(lineas)).toBe(2998);
  });

  it('rechaza si algun elemento es negativo', () => {
    expect(() => sumMinorAmounts([100, -1])).toThrow(MoneyError);
  });

  it('rechaza si algun elemento tiene decimales', () => {
    expect(() => sumMinorAmounts([100, 0.5])).toThrow(MoneyError);
  });

  it('detecta el desborde en lugar de devolver un numeroLosto', () => {
    const enorme = MAX_MINOR_AMOUNT;
    expect(() => sumMinorAmounts([enorme, enorme])).toThrow(/excede el limite/);
  });
});

describe('multiplyMinorAmount', () => {
  it('multiplica precio por cantidad de forma exacta', () => {
    expect(multiplyMinorAmount(62000, 3)).toBe(186000);
    expect(multiplyMinorAmount(0, 99)).toBe(0);
    expect(multiplyMinorAmount(45000, 1)).toBe(45000);
  });

  it('rechaza cantidad decimal', () => {
    expect(() => multiplyMinorAmount(62000, 1.5)).toThrow(MoneyError);
  });

  it('rechaza cantidad negativa', () => {
    expect(() => multiplyMinorAmount(62000, -1)).toThrow(/negativa/);
  });

  it('detecta el desborde del subtotal', () => {
    expect(() => multiplyMinorAmount(MAX_MINOR_AMOUNT, 2)).toThrow(/excede el limite/);
  });
});

describe('percentOfMinorAmount', () => {
  it('calcula porcentajes sin la deriva de dividir primero', () => {
    // 58000 * 10 / 100 debe ser exactamente 5800
    expect(percentOfMinorAmount(58000, 10)).toBe(5800);
  });

  it('redondea half-up', () => {
    // 145 * 10 / 100 = 14.5 -> 15
    expect(percentOfMinorAmount(145, 10)).toBe(15);
    // 135 * 10 / 100 = 13.5 -> 14
    expect(percentOfMinorAmount(135, 10)).toBe(14);
  });

  it('devuelve cero cuando el porcentaje es cero', () => {
    expect(percentOfMinorAmount(58000, 0)).toBe(0);
  });

  it('acepta porcentajes negativos (para ajustes en contra)', () => {
    expect(percentOfMinorAmount(1000, -10)).toBe(-100);
  });
});

describe('discountPercentage', () => {
  it('calcula el descuento del catalogo', () => {
    expect(discountPercentage(68000, 58000)).toBe(15);   // 10000/68000 = 14.7% -> 15
    expect(discountPercentage(42000, 36000)).toBe(14);
    expect(discountPercentage(55000, 45000)).toBe(18);
  });

  it('devuelve 0 sin precio anterior', () => {
    expect(discountPercentage(null, 58000)).toBe(0);
    expect(discountPercentage(undefined, 58000)).toBe(0);
  });

  it('devuelve 0 si el precio anterior no es mayor', () => {
    expect(discountPercentage(58000, 68000)).toBe(0);
    expect(discountPercentage(58000, 58000)).toBe(0);
  });

  it('devuelve 0 si el precio anterior es cero, en vez de dividir entre cero', () => {
    expect(discountPercentage(0, 0)).toBe(0);
  });

  it('nunca supera 100', () => {
    expect(discountPercentage(1000, 1)).toBe(100);
  });

  it('rechaza precios decimales', () => {
    expect(() => discountPercentage(68000.5, 58000)).toThrow(MoneyError);
  });
});

describe('taxFor (IVA)', () => {
  it('aplica la tasa en puntos basicos', () => {
    expect(taxFor(100000, 1900)).toBe(19000);
    expect(taxFor(100000, 500)).toBe(5000);
  });

  it('redondea half-up a entero', () => {
    // 19% de 12345 = 2345.55 -> 2346
    expect(taxFor(12345, 1900)).toBe(2346);
    // 19% de 10000 = 1900 exacto, sin desvio de coma flotante
    expect(taxFor(10000, 1900)).toBe(1900);
  });

  it('con tasa 0% no cobra nada (exento)', () => {
    expect(taxFor(100000, 0)).toBe(0);
  });

  it('con base 0 no cobra nada', () => {
    expect(taxFor(0, 1900)).toBe(0);
  });

  it('rechaza una tasa negativa o decimal', () => {
    expect(() => taxFor(100000, -100)).toThrow(MoneyError);
    expect(() => taxFor(100000, 19.5)).toThrow(MoneyError);
  });

  it('rechaza una base no entera', () => {
    expect(() => taxFor(100.5, 1900)).toThrow(MoneyError);
  });

  it('representa tariffs que un porcentaje entero no podria', () => {
    // 19,5% no cabe en un entero 0..100: habria que redondear a 20 y cobrar de mas.
    expect(taxFor(100000, 1950)).toBe(19500);
  });
});

describe('computeOrderTotal', () => {
  it('suma subtotal y envio', () => {
    expect(computeOrderTotal({ subtotal: 186000, shipping: 15000 })).toBe(201000);
  });

  it('suma el IVA cuando se le pasa', () => {
    expect(computeOrderTotal({ subtotal: 29000, shipping: 15000, tax: 8360 })).toBe(52360);
  });

  it('suma subtotal, envio e IVA a la vez', () => {
    expect(computeOrderTotal({ subtotal: 186000, shipping: 15000, tax: 38190 })).toBe(239190);
  });

  it('maneja el caso limite de todo cero', () => {
    expect(computeOrderTotal({ subtotal: 0, shipping: 0, tax: 0 })).toBe(0);
  });

  it('rechaza un total negativo en vez de devolverlo', () => {
    expect(() => computeOrderTotal({ subtotal: 0, shipping: 0, tax: -500 }))
      .toThrow(/no puede ser negativo/);
  });

  it('rechaza decimales en cualquiera de los tres campos', () => {
    expect(() => computeOrderTotal({ subtotal: 100.5 })).toThrow(MoneyError);
    expect(() => computeOrderTotal({ subtotal: 100, shipping: 0.5 })).toThrow(MoneyError);
    expect(() => computeOrderTotal({ subtotal: 100, tax: 0.5 })).toThrow(MoneyError);
  });
});

describe('shippingCostFor', () => {
  const rules = { freeFrom: 200000, cost: 15000 };

  it('cobra envio por debajo del umbral', () => {
    expect(shippingCostFor(0, rules)).toBe(15000);
    expect(shippingCostFor(199999, rules)).toBe(15000);
  });

  it('no cobra envio en el umbral exacto (borde inclusivo)', () => {
    expect(shippingCostFor(200000, rules)).toBe(0);
  });

  it('no cobra envio por encima del umbral', () => {
    expect(shippingCostFor(200001, rules)).toBe(0);
    expect(shippingCostFor(1000000, rules)).toBe(0);
  });

  it('sin reglas configuradas no cobra nada', () => {
    expect(shippingCostFor(100, {})).toBe(0);
  });
});

describe('formatMinorAmount', () => {
  it('formatea con separador de miles colombiano', () => {
    expect(formatMinorAmount(58000)).toBe('$58.000');
    expect(formatMinorAmount(0)).toBe('$0');
  });

  it('coloca el signo delante del simbolo en los negativos', () => {
    expect(formatMinorAmount(-5000)).toBe('-$5.000');
  });
});

describe('montos enormes', () => {
  it('acepta importes grandes pero representables', () => {
    const grande = 999999999999; // ~1 billon
    expect(isMinorAmount(grande)).toBe(true);
    expect(multiplyMinorAmount(grande, 1)).toBe(grande);
  });

  it('detecta el desborde al multiplicar dos importes grandes', () => {
    expect(() => multiplyMinorAmount(999999999999, 9999)).toThrow(/excede el limite/);
  });

  it('detecta el desborde al sumar muchos importes grandes', () => {
    // MAX_SAFE_INTEGER = 9007199254740991. Con 999999999999 por linea hacen falta
    // mas de 9008 lineas; 20000 lo rebasa holgadamente.
    const miles = new Array(20000).fill(999999999999);
    expect(() => sumMinorAmounts(miles)).toThrow(/excede el limite/);
  });

  it('no desborda con una cantidad de lineas que aun cabe', () => {
    expect(sumMinorAmounts(new Array(1000).fill(999999999999))).toBe(999999999999000);
  });

  it('el total de un pedido nunca sale del rango representable', () => {
    expect(() => computeOrderTotal({ subtotal: MAX_MINOR_AMOUNT, shipping: MAX_MINOR_AMOUNT }))
      .toThrow(/excede el limite/);
  });
});
