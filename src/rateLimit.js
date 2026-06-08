export function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function createRateLimiter({ windowMs, maxRequests, now = () => Date.now() }) {
  const buckets = new Map();

  return {
    check(clientKey) {
      const key = clientKey || 'unknown';
      const currentTime = now();
      const existing = buckets.get(key);

      if (!existing || currentTime >= existing.resetAt) {
        buckets.set(key, { count: 1, resetAt: currentTime + windowMs });
        return {
          allowed: true,
          remaining: maxRequests - 1,
          resetAt: currentTime + windowMs,
          retryAfterSeconds: 0,
        };
      }

      if (existing.count >= maxRequests) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: existing.resetAt,
          retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - currentTime) / 1000)),
        };
      }

      existing.count += 1;
      return {
        allowed: true,
        remaining: maxRequests - existing.count,
        resetAt: existing.resetAt,
        retryAfterSeconds: 0,
      };
    },
  };
}
