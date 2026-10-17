/** Bounded fixed-window gates for this domain only. No token, email or payload is stored. */
export function createRealtimeBudget(options: { now?: () => number; windowMs?: number; maxKeys?: number } = {}) {
  const now = options.now ?? Date.now;
  const windowMs = options.windowMs ?? 60_000;
  const maxKeys = options.maxKeys ?? 2000;
  const buckets = new Map<string, { started: number; count: number }>();
  let lastCleanup = now();
  return {
    consume(key: string, limit: number): { allowed: boolean; retryAfterSeconds: number } {
      const time = now();
      if (time - lastCleanup >= windowMs || buckets.size >= maxKeys) {
        for (const [id, bucket] of buckets) if (time - bucket.started >= windowMs || time < bucket.started) buckets.delete(id);
        lastCleanup = time;
      }
      let bucket = buckets.get(key);
      if (bucket && (time - bucket.started >= windowMs || time < bucket.started)) { buckets.delete(key); bucket = undefined; }
      if (!bucket) {
        if (buckets.size >= maxKeys || key.length > 256) return { allowed: false, retryAfterSeconds: Math.ceil(windowMs / 1000) };
        bucket = { started: time, count: 0 }; buckets.set(key, bucket);
      }
      const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (time - bucket.started)) / 1000));
      if (bucket.count >= limit) return { allowed: false, retryAfterSeconds };
      bucket.count++;
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}
