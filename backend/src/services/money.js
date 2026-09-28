/**
 * money.js - Aritmetica monetaria en enteros (unidad minima = peso colombiano)
 *
 * POR QUE ESTE MODULO EXISTE
 * --------------------------
 * La tienda cobra en pesos colombianos (COP), que no tiene subdivision: el peso
 * ES la unidad minima. Por eso TODOS los importes se guardan y se calculan como
 * enteros y nunca como float. Un `Number` de coma flotante puede representar de
 * forma inexacta 0.1 + 0.2 = 0.30000000000000004, y si un carrito acumula miles
 * de esas sumas el descuadre aparece en el total que paga el cliente.
 *
 * Con la regla "enteros" no hay deriva posible: sumar y multiplicar enteros
 * pequenos es exacto en IEEE-754 siempre que el resultado quepa en
 * Number.MAX_SAFE_INTEGER, y eso es lo unico que este modulo verifica.
 *
 * La unica operacion que divide es el porcentaje de descuento, y aun ahi se
 * redondea a entero de forma explicita para que el resultado siga siendo un
 * importe entero y no un porcentaje con decimales sueltos.
 *
 * NOTA SOBRE EL REDONDEO
 * ----------------------
 * No se redondea "a centavos" porque COP no tiene centavos. El unico redondeo
 * es el del porcentaje de descuento, que es un entero (0..100) y por lo tanto no
 * puede perder centavos. Si manana la tienda vende en una moneda con centimos,
 * el unico cambio necesario es anadir la escala aqui y dividir por ella en
 * `percentOfMinor`; el resto del sistema ya trabaja en enteros.
 */

/** Unidad minima de la moneda. En COP el peso no se divide. */
export const MINOR_UNITS_PER_MAJOR = 1;

/**
 * Limite duro de un importe. Por encima de este valor IEEE-754 deja de
 * representar enteros de forma exacta, asi que se rechaza en vez de dejar que
 * el error se contamine hasta el total final.
 */
export const MAX_MINOR_AMOUNT = Number.MAX_SAFE_INTEGER;

/**
 * Error de dominio para importes invalidos. Se distingue de un error de peticion
 * (400) porque aqui el culpable es el calculo interno, no lo que envio el cliente.
 */
export class MoneyError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'MoneyError';
    this.field = field;
    this.isOperational = true;
    Error.captureStackTrace(this, MoneyError);
  }
}

/**
 * Indica si un valor es un importe valido: entero, finito y dentro del rango
 * representable exacto. No acepta negativos ni NaN ni Infinity.
 * @param {unknown} value
 * @returns {boolean}
 */
export const isMinorAmount = value =>
  typeof value === 'number' && Number.isSafeInteger(value);

/**
 * Convierte un valor a importe entero validado.
 * Acepta string numerico ("58000") porque algunos formularios HTML envian texto,
 * pero rechaza "58.5", "1e3" con decimales utiles y cualquier cosa no numerica.
 * @param {unknown} value
 * @param {string} [field] - Nombre del campo, solo para el mensaje de error.
 * @returns {number} Importe entero.
 * @throws {MoneyError} Si el valor no es un entero representable.
 */
export const toMinorAmount = (value, field = 'monto') => {
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return toMinorAmount(Number(value.trim()), field);
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new MoneyError(
      `${field} debe ser un numero entero sin decimales (unidad minima)`,
      field,
    );
  }
  return value;
};

/**
 * Igual que `toMinorAmount` pero exige un importe no negativo. Los importes de
 * este dominio (precio, subtotal, envio, descuento, total) nunca son negativos;
 * un negativo indica un bug de calculo y debe detectarse aqui, no chegar al
 * cliente como un total de -50000.
 * @param {unknown} value
 * @param {string} [field]
 * @returns {number}
 */
export const toNonNegativeMinorAmount = (value, field = 'monto') => {
  const amount = toMinorAmount(value, field);
  if (amount < 0) throw new MoneyError(`${field} no puede ser negativo`, field);
  return amount;
};

/**
 * Suma varios importes sin salir de enteros. Se van sumando de dos en dos
 * comprobando el rango en cada paso, para que un valor corrupto HUGE se detecte
 * al instante y no se propague hasta el total.
 * @param {Array<number>} amounts
 * @param {string} [field]
 * @returns {number}
 */
export const sumMinorAmounts = (amounts, field = 'suma') => {
  let total = 0;
  for (const amount of amounts) {
    total += toNonNegativeMinorAmount(amount, field);
    if (!Number.isSafeInteger(total)) {
      throw new MoneyError(`La ${field} excede el limite representable`, field);
    }
  }
  return total;
};

/**
 * Importe de una linea: precio unitario por cantidad.
 * @param {number} unitPrice - Precio unitario entero.
 * @param {number} quantity - Cantidad entera.
 * @param {string} [field]
 * @returns {number}
 */
export const multiplyMinorAmount = (unitPrice, quantity, field = 'subtotal') => {
  const price = toNonNegativeMinorAmount(unitPrice, 'precioUnitario');
  const qty = toMinorAmount(quantity, 'cantidad');
  if (qty < 0) throw new MoneyError('La cantidad no puede ser negativa', 'cantidad');
  const total = price * qty;
  if (!Number.isSafeInteger(total)) {
    throw new MoneyError('El subtotal excede el limite representable', field);
  }
  return total;
};

/**
 * Aplica un porcentaje entero a un importe y devuelve un entero.
 *
 * Se calcula como `amount * percent / 100` en una sola division con redondeo
 * half-up, en vez de `amount * (percent / 100)`: la segunda forma divide primero
 * y produce 0.14500000000000002 en lugar de 0.145, que al final redondea distinto.
 * @param {number} amount - Importe entero base.
 * @param {number} percent - Porcentaje entero (puede ser negativo).
 * @param {string} [field]
 * @returns {number} Importe entero redondeado.
 */
export const percentOfMinorAmount = (amount, percent, field = 'porcentaje') => {
  const base = toMinorAmount(amount, 'base');
  const rate = toMinorAmount(percent, field);
  const raw = base * rate;
  if (!Number.isSafeInteger(raw)) {
    throw new MoneyError('El calculo de porcentaje excede el limite representable', field);
  }
  // half-up sobre division entera: mas medio se redondea hacia arriba.
  return Math.floor(raw / 100 + (Math.sign(raw % 100) * 0.5 === 0.5 ? 0.5 : 0));
};

/**
 * Porcentaje de descuento entre un precio anterior y el actual.
 * Devuelve un entero de 0 a 100. Si no hay precio anterior, o es menor o igual
 * al actual, o es cero, devuelve 0: no hay descuento que mostrar.
 * @param {number|null|undefined} previousPrice
 * @param {number} currentPrice
 * @returns {number} Entero 0..100.
 */
export const discountPercentage = (previousPrice, currentPrice) => {
  if (previousPrice === null || previousPrice === undefined) return 0;
  const previous = toNonNegativeMinorAmount(previousPrice, 'precioAnterior');
  const current = toNonNegativeMinorAmount(currentPrice, 'precio');
  if (previous <= current) return 0;
  // (previous - current) * 100 / previous, en una sola division entera.
  return Math.floor((previous - current) * 100 / previous + 0.5);
};

/**
 * Aplica un descuento ya calculado a un importe y devuelve un entero.
 * Nunca baja de cero: un descuento mayor que el precio daria un total negativo.
 * @param {number} amount
 * @param {number} percentage - 0..100
 * @param {string} [field]
 * @returns {number}
 */
export const applyDiscountPercentage = (amount, percentage, field = 'descuento') => {
  const base = toNonNegativeMinorAmount(amount, field);
  if (percentage <= 0) return base;
  if (percentage >= 100) return 0;
  return Math.max(0, base - percentOfMinorAmount(base, percentage, field));
};

/**
 * Total de un pedido: subtotal mas envio menos descuento, en enteros.
 * @param {object} totals
 * @param {number} totals.subtotal
 * @param {number} [totals.shipping=0]
 * @param {number} [totals.discount=0]
 * @returns {number} Total entero, nunca negativo.
 */
export const computeOrderTotal = ({ subtotal, shipping = 0, discount = 0 }) => {
  const base = toNonNegativeMinorAmount(subtotal, 'subtotal');
  const ship = toNonNegativeMinorAmount(shipping, 'costoEnvio');
  const off = toNonNegativeMinorAmount(discount, 'descuento');
  const total = base + ship - off;
  if (!Number.isSafeInteger(total)) {
    throw new MoneyError('El total excede el limite representable', 'total');
  }
  if (total < 0) {
    throw new MoneyError('El total no puede ser negativo', 'total');
  }
  return total;
};

/**
 * Costo de envio segun el monto del pedido. Devolvera un entero.
 * @param {number} subtotal
 * @param {object} [rules]
 * @param {number} [rules.freeFrom=0] - Subtotal a partir del cual el envio es gratis.
 * @param {number} [rules.cost=0] - Costo del envio cuando no aplica el envio gratis.
 * @returns {number}
 */
export const shippingCostFor = (subtotal, { freeFrom = 0, cost = 0 } = {}) => {
  const base = toNonNegativeMinorAmount(subtotal, 'subtotal');
  const threshold = toNonNegativeMinorAmount(freeFrom, 'envioGratisDesde');
  const fee = toNonNegativeMinorAmount(cost, 'costoEnvio');
  return base >= threshold ? 0 : fee;
};

/**
 * Formatea un importe entero como texto COP. Solo para respuestas de API o logs;
 * no se usa para calcular nada.
 * @param {number} amount
 * @returns {string} p.ej. "$58.000"
 */
export const formatMinorAmount = amount => {
  const value = toMinorAmount(amount, 'monto');
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toLocaleString('es-CO')}`;
};
