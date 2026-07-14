/** Bounded concurrency for independent async work (e.g. note pull). */
export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let next = 0;
  let failed: unknown = null;

  async function worker(): Promise<void> {
    while (true) {
      if (failed != null) return;
      const i = next;
      next += 1;
      if (i >= items.length) return;
      try {
        results[i] = await fn(items[i]!, i);
      } catch (err) {
        failed = err;
        throw err;
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: limit }, () => worker()));
  } catch (err) {
    throw failed ?? err;
  }
  return results;
}
