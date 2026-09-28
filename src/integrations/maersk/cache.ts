// Small TTL cache. Map preserves insertion order, so the first key is the oldest.
export const createTtlCache = (maxEntries: number) => {
  const cache = new Map<string, { value: unknown; expiresAt: number }>();

  const get = <T>(key: string): T | undefined => {
    const entry = cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      cache.delete(key);
      return undefined;
    }
    return entry.value as T;
  };

  const set = (key: string, value: unknown, ttl: number) => {
    if (cache.size >= maxEntries) cache.delete(cache.keys().next().value);
    cache.set(key, { value, expiresAt: Date.now() + ttl });
  };

  return { get, set };
};
