const MAX_ENTRIES = 5;
const cache = new Map();

export const getCachedSearch = (query) => {
  const key = String(query || '').trim().toLowerCase();
  if (!key) return null;
  if (!cache.has(key)) return null;
  const value = cache.get(key);
  cache.delete(key);
  cache.set(key, value);
  return value;
};

export const setCachedSearch = (query, value) => {
  const key = String(query || '').trim().toLowerCase();
  if (!key) return;
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
};

