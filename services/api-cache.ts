interface CacheEntry {
  data: any;
  timestamp: number;
}

export class APICache {
  private memoryCache = new Map<string, CacheEntry>();
  private maxSize: number;
  private ttl: number;

  constructor(options: { maxSize?: number; ttl?: number } = {}) {
    this.maxSize = options.maxSize || 200;
    this.ttl = options.ttl || 1000 * 60 * 30; // 30 minutes default
  }

  private generateKey(type: string, params: any): string {
    const paramString = typeof params === 'object' ? JSON.stringify(params) : String(params);
    return `${type}:${paramString}`;
  }

  async get(type: string, params: any): Promise<any | null> {
    const key = this.generateKey(type, params);

    if (this.memoryCache.has(key)) {
      const cached = this.memoryCache.get(key)!;
      if (Date.now() - cached.timestamp < this.ttl) {
        return cached.data;
      }
      this.memoryCache.delete(key);
    }

    return null;
  }

  async set(type: string, params: any, data: any): Promise<void> {
    const key = this.generateKey(type, params);
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
    };

    this.memoryCache.set(key, entry);

    if (this.memoryCache.size > this.maxSize) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) this.memoryCache.delete(firstKey);
    }
  }

  async clear(): Promise<void> {
    this.memoryCache.clear();
  }

  async clearExpired(): Promise<void> {
    const now = Date.now();
    const expired: string[] = [];

    for (const [key, entry] of this.memoryCache.entries()) {
      if (now - entry.timestamp >= this.ttl) {
        expired.push(key);
      }
    }

    expired.forEach((key) => this.memoryCache.delete(key));
  }

  getCacheStats() {
    return {
      memoryEntries: this.memoryCache.size,
      maxSize: this.maxSize,
      ttl: this.ttl,
    };
  }
}
