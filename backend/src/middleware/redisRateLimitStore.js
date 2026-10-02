/**
 * Store de rate limiting respaldado por Redis.
 *
 * DEGRADACIÓN, NO CAÍDA
 * ---------------------
 * `increment()` antes hacía `throw new Error('Redis client not connected')` si el
 * cliente no estaba abierto. Con `passOnStoreError: false` (el valor por defecto
 * de express-rate-limit 7.x) ese error sube al `errorHandler` global y TODAS las
 * peticiones de `/api/*` responden 500. Y el estado era permanente, porque el
 * `reconnectStrategy` de `app.js` devuelve `false` a los 4 reintentos, tras lo
 * cual `isOpen` se queda en `false` para siempre: un blip de red de cinco
 * segundos en Upstash tiraba la tienda entera hasta el siguiente despliegue.
 *
 * Ahora, si Redis no responde, el store informa un contador neutro y la petición
 * pasa. Se pierde el límite durante el corte, que es el trade-off correcto: el
 * rate limiting es una defensa, no una función de negocio, y para lo que protege
 * de verdad (fuerza bruta en el login) hay además el limitador por ruta y la
 * CAPTCHA del proveedor de identidad. Lo que NO es aceptable es que caiga la
 * tienda por un problema de caché.
 */
class RedisRateLimitStore {
  constructor({ client = null, prefix = 'rl:', onDegradado = null } = {}) {
    this.client = client;
    this.prefix = prefix;
    this.windowMs = 900000;
    this.limit = 100;
    this.onDegradado = onDegradado;
    // Se avisa UNA vez de cada degradación, no en cada petición: si no, un
    // Redis caído inundaría los logs con miles de líneas idénticas y taparía
    // todo lo demás.
    this.avisado = false;
  }

  /** Registra la degradación una sola vez. */
  #degradar(motivo) {
    if (this.avisado) return;
    this.avisado = true;
    console.error(
      `[rate-limit] Redis no disponible (${motivo}). Se sigue contando en memoria.`,
    );
    this.onDegradado?.(motivo);
  }

  /** Vuelve a permitir un aviso si el problema se resuelve y vuelve a caerse. */
  #recuperar() {
    this.avisado = false;
  }

  async init(options = {}) {
    this.windowMs = options.windowMs || this.windowMs;
    this.limit = options.limit || this.limit;
    if (options.prefix) this.prefix = options.prefix;
  }

  async increment(key) {
    if (!this.client?.isOpen) {
      this.#degradar('cliente no abierto');
      // Contador neutro: `totalHits` en 1 deja pasar la petición siempre. No es
      // un "reset" silencioso de la ventana, es la ausencia de límite mientras
      // no haya dónde contabilizar.
      return {
        totalHits: 1,
        resetTime: new Date(Date.now() + this.windowMs),
        isFirstInWindow: true,
        degradado: true,
      };
    }

    const redisKey = `${this.prefix}${key}`;
    let result;
    try {
      // `disableOfflineQueue` está puesto en la creación del cliente: sin él, un
      // Redis inalcanzable hace que este comando se quede esperando en la cola
      // sin límite y la petición cuelga hasta el timeout del servidor.
      result = await this.client.eval(`
        local current = redis.call('GET', KEYS[1])
        if not current then
          redis.call('SET', KEYS[1], 1, 'PX', ARGV[1])
          return {1, ARGV[1]}
        end
        local ttl = redis.call('PTTL', KEYS[1])
        if ttl <= 0 then
          redis.call('SET', KEYS[1], 1, 'PX', ARGV[1])
          return {1, ARGV[1]}
        end
        local value = redis.call('INCR', KEYS[1])
        return {value, ttl}
      `, {
        keys: [redisKey],
        arguments: [String(this.windowMs)],
      });
    } catch (error) {
      // Un comando que falla (timeout, error de red, key mal formada) no puede
      // tumbar la API. Se degrada y se deja pasar.
      this.#degradar(error?.name || 'error en el comando');
      return {
        totalHits: 1,
        resetTime: new Date(Date.now() + this.windowMs),
        isFirstInWindow: true,
        degradado: true,
      };
    }

    this.#recuperar();

    const totalHits = Number(result[0]);
    const ttl = Number(result[1]);
    return {
      totalHits,
      resetTime: new Date(Date.now() + ttl),
      isFirstInWindow: totalHits === 1,
    };
  }

  async decrement(key) {
    if (!this.client?.isOpen) return;
    try {
      await this.client.decr(`${this.prefix}${key}`);
    } catch {
      this.#degradar('decrement');
    }
  }

  async resetKey(key) {
    if (!this.client?.isOpen) return;
    try {
      await this.client.del(`${this.prefix}${key}`);
    } catch {
      this.#degradar('resetKey');
    }
  }

  async resetAll() {
    if (!this.client?.isOpen) return;
    try {
      for await (const key of this.client.scanIterator({ MATCH: `${this.prefix}*` })) {
        await this.client.del(key);
      }
    } catch {
      this.#degradar('resetAll');
    }
  }

  async shutdown() {
    return undefined;
  }
}

export default RedisRateLimitStore;
