// Small TTL cache. Map preserves insertion order, so the first key is the oldest.
export const createTtlCache = (maxEntries) => {
    const cache = new Map();
    const get = (key) => {
        const entry = cache.get(key);
        if (!entry)
            return undefined;
        if (entry.expiresAt < Date.now()) {
            cache.delete(key);
            return undefined;
        }
        return entry.value;
    };
    const set = (key, value, ttl) => {
        if (cache.size >= maxEntries)
            cache.delete(cache.keys().next().value);
        cache.set(key, { value, expiresAt: Date.now() + ttl });
    };
    return { get, set };
};
//# sourceMappingURL=cache.js.map