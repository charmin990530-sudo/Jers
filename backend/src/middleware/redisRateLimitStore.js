class RedisRateLimitStore {
  constructor({ client = null, prefix = 'rl:' } = {}) {
    this.client = client;
    this.prefix = prefix;
    this.windowMs = 900000;
    this.limit = 100;
  }

  async init(options = {}) {
    this.windowMs = options.windowMs || this.windowMs;
    this.limit = options.limit || this.limit;
    if (options.prefix) this.prefix = options.prefix;
  }

  async increment(key) {
    if (!this.client?.isOpen) throw new Error('Redis client not connected');

    const redisKey = `${this.prefix}${key}`;
    const result = await this.client.eval(`
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
    await this.client.decr(`${this.prefix}${key}`);
  }

  async resetKey(key) {
    if (!this.client?.isOpen) return;
    await this.client.del(`${this.prefix}${key}`);
  }

  async resetAll() {
    if (!this.client?.isOpen) return;
    for await (const key of this.client.scanIterator({ MATCH: `${this.prefix}*` })) {
      await this.client.del(key);
    }
  }

  async shutdown() {
    return undefined;
  }
}

export default RedisRateLimitStore;
