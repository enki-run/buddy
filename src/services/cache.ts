export class CacheService {
  constructor(private kv: KVNamespace) {}

  async get<T>(key: string): Promise<T | null> {
    const value = await this.kv.get(key, "text");
    if (!value) return null;
    return JSON.parse(value) as T;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
  }

  async invalidate(key: string): Promise<void> {
    await this.kv.delete(key);
  }

  async invalidatePrefix(prefix: string): Promise<void> {
    const list = await this.kv.list({ prefix });
    await Promise.all(list.keys.map((k) => this.kv.delete(k.name)));
  }
}
