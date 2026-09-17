/**
 * Simple TTL cache for server-side endpoint responses.
 * Port de src/db/utils/ttlCache.js — lógica idêntica, sem APIs específicas de
 * Node, por isso corre em Deno sem alterações de fundo.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TTLCache {
  private _store = new Map<string, CacheEntry<any>>();
  private _defaultTTL: number;

  constructor(defaultTTL = 60000) {
    this._defaultTTL = defaultTTL;
  }

  get(key: string): any {
    const entry = this._store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: any, ttl?: number): void {
    this._store.set(key, {
      value,
      expiresAt: Date.now() + (ttl ?? this._defaultTTL),
    });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): void {
    this._store.delete(key);
  }

  /** Invalidate all keys matching a prefix */
  invalidate(prefix: string): void {
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) this._store.delete(key);
    }
  }

  clear(): void {
    this._store.clear();
  }

  get size(): number {
    for (const [key, entry] of this._store) {
      if (Date.now() > entry.expiresAt) this._store.delete(key);
    }
    return this._store.size;
  }
}
