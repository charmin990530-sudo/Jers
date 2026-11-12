import { createHash } from 'node:crypto';
import { connectDB } from '../config/db.js';
import { AppError, ErrorCodes } from './apiError.js';

/** Shared counters survive Vercel cold starts; TTL only cleans up expired records. */
export default class MongoRateLimitStore {
  constructor({ prefix = 'general:', getConnection = connectDB } = {}) {
    this.prefix = prefix;
    this.windowMs = 900000;
    this.localKeys = false;
    this.getConnection = getConnection;
    this.indexReady = null;
  }

  init(options) { this.windowMs = options.windowMs; }

  key(value) { return this.prefix + createHash('sha256').update(String(value)).digest('hex'); }

  async collection() {
    const connection = await this.getConnection({ allowRetry: true });
    if (!connection) throw new AppError('La base de datos no está disponible. Inténtalo de nuevo.', 503, ErrorCodes.DATABASE_UNAVAILABLE);
    const collection = connection.collection('rate_limits');
    if (!this.indexReady) {
      this.indexReady = collection.createIndex({ resetAt: 1 }, { expireAfterSeconds: 0 })
        .catch(error => { this.indexReady = null; throw error; });
    }
    await this.indexReady;
    return collection;
  }

  async increment(value) {
    const collection = await this.collection();
    const now = new Date(), reset = new Date(now.getTime() + this.windowMs);
    const update = [{ $set: {
      hits: { $cond: [{ $gt: ['$resetAt', now] }, { $add: [{ $ifNull: ['$hits', 0] }, 1] }, 1] },
      resetAt: { $cond: [{ $gt: ['$resetAt', now] }, '$resetAt', reset] },
    } }];
    const filter = { _id: this.key(value) };
    let doc;
    try {
      doc = await collection.findOneAndUpdate(filter, update, { upsert: true, returnDocument: 'after', includeResultMetadata: false });
    } catch (error) {
      // Two cold instances may both attempt the first insert of a unique key.
      if (error.code !== 11000) throw error;
      doc = await collection.findOneAndUpdate(filter, update, { returnDocument: 'after', includeResultMetadata: false });
    }
    if (!doc) throw new AppError('No se pudo comprobar el límite de solicitudes.', 503, ErrorCodes.DATABASE_UNAVAILABLE);
    return { totalHits: doc.hits, resetTime: doc.resetAt };
  }

  async decrement(value) {
    await (await this.collection()).updateOne({ _id: this.key(value), hits: { $gt: 0 } }, { $inc: { hits: -1 } });
  }

  async resetKey(value) { await (await this.collection()).deleteOne({ _id: this.key(value) }); }
}
