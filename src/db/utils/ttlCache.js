/**
 * Simple TTL cache for server-side endpoint responses.
 */

export class TTLCache {
  constructor(defaultTTL = 60000) {
    this._store = new Map()
    this._defaultTTL = defaultTTL
  }

  get(key) {
    const entry = this._store.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expiresAt) {
      this._store.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key, value, ttl) {
    this._store.set(key, {
      value,
      expiresAt: Date.now() + (ttl ?? this._defaultTTL),
    })
  }

  has(key) {
    return this.get(key) !== undefined
  }

  delete(key) {
    this._store.delete(key)
  }

  /** Invalidate all keys matching a prefix */
  invalidate(prefix) {
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) this._store.delete(key)
    }
  }

  clear() {
    this._store.clear()
  }

  get size() {
    // Clean expired entries first
    for (const [key, entry] of this._store) {
      if (Date.now() > entry.expiresAt) this._store.delete(key)
    }
    return this._store.size
  }
}
