/** Redis usa MongoDB compartido como respaldo; nunca admite tráfico sin contarlo. */
import { createHash } from 'node:crypto';
import { AppError, ErrorCodes } from './apiError.js';

class RedisRateLimitStore {
  constructor({ client = null, prefix = 'rl:', onDegradado = null, fallbackStore = null } = {}) {
    this.client = client;
    this.fallbackStore = fallbackStore;
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
      `[rate-limit] Redis no disponible (${motivo}). Se usa el respaldo compartido o se rechaza temporalmente.`,
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
    this.fallbackStore?.init(options);
  }

  async increment(key) {
    if (!this.client?.isOpen) {
      this.#degradar('cliente no abierto');
      return this.#fallback(key);
    }

    const redisKey = this.#key(key);
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
      return this.#fallback(key);
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

  #key(key) { return this.prefix + createHash('sha256').update(String(key)).digest('hex'); }

  async #fallback(key) {
    if (this.fallbackStore) return this.fallbackStore.increment(key);
    throw new AppError('El control de solicitudes no está disponible temporalmente.', 503, ErrorCodes.DATABASE_UNAVAILABLE);
  }

  async decrement(key) {
    if (!this.client?.isOpen) return;
    try {
      await this.client.decr(this.#key(key));
    } catch {
      this.#degradar('decrement');
    }
  }

  async resetKey(key) {
    if (!this.client?.isOpen) return;
    try {
      await this.client.del(this.#key(key));
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
