interface CacheEntry<V> {
  value: Promise<V>;
  expiresAt: number;
}

/**
 * Tiny in-memory cache with a fixed time-to-live — used to amortize expensive full-library
 * aggregate scans (season/episode counts) across the many rapid-fire requests a single browsing
 * session generates, e.g. infinite scroll re-hitting getShows() on every page. A scan for a
 * library with tens of thousands of episodes can take several seconds; paying that once per TTL
 * window instead of on every single page request is a large, low-risk win — this data changes only
 * when the Jellyfin library itself changes, which is rare enough that some staleness is fine.
 *
 * Caches the in-flight *promise*, not just the resolved value, so concurrent requests that arrive
 * before the first computation finishes share it instead of each starting their own redundant scan.
 */
export function createTtlCache<K, V>(ttlMs: number) {
  const store = new Map<K, CacheEntry<V>>();

  return function getOrCompute(key: K, compute: () => Promise<V>): Promise<V> {
    const cached = store.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const promise = compute();
    store.set(key, { value: promise, expiresAt: Date.now() + ttlMs });
    // A failed compute shouldn't poison the cache with a permanently-rejected entry.
    promise.catch(() => store.delete(key));
    return promise;
  };
}
