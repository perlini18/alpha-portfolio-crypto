type Bucket = {
  count: number;
  resetAt: number;
};

const globalStore = globalThis as typeof globalThis & {
  __rate_limit_store__?: Map<string, Bucket>;
};

function getStore() {
  if (!globalStore.__rate_limit_store__) {
    globalStore.__rate_limit_store__ = new Map<string, Bucket>();
  }
  return globalStore.__rate_limit_store__;
}

export function checkRateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
}) {
  const now = Date.now();
  const store = getStore();
  const current = store.get(input.key);

  if (!current || current.resetAt <= now) {
    store.set(input.key, { count: 1, resetAt: now + input.windowMs });
    return { allowed: true, retryAfterSec: Math.ceil(input.windowMs / 1000) };
  }

  current.count += 1;
  store.set(input.key, current);

  if (current.count > input.limit) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000))
    };
  }

  return {
    allowed: true,
    retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000))
  };
}
