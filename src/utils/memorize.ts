const cacheStore = new WeakMap<Function, Map<string, { data: unknown }>>();

export function memorize<T>(
  fn: (...args: any[]) => T,
  { cache = new Map<string, { data: T }>() } = {},
  callback?: (value: T) => T,
): (...args: any[]) => T {
  const memoized = (...args: any[]): T => {
    const [key] = args;
    const cacheItem = cache.get(key);

    if (cacheItem) {
      return cacheItem.data;
    }

    // @ts-ignore
    let result = fn.apply(this, args);

    if (callback) {
      result = callback(result);
    }

    cache.set(key, {
      data: result,
    });

    return result;
  };

  cacheStore.set(memoized, cache);

  return memoized;
}
