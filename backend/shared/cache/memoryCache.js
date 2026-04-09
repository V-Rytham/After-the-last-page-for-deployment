export class MemoryCache {
  constructor({ ttlMs }) {
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  get(key) {
    const hit = this.cache.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return hit.value;
  }

  set(key, value, ttlMs = this.ttlMs) {
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }

  clear() {
    this.cache.clear();
  }
}
