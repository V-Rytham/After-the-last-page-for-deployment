const nowMs = () => Date.now();

const getKey = (req, keyGenerator) => {
  if (typeof keyGenerator === 'function') {
    return String(keyGenerator(req) || 'unknown');
  }

  return String(req.ip || req.connection?.remoteAddress || 'unknown');
};

export const rateLimit = ({
  windowMs = 60_000,
  max = 120,
  keyGenerator,
  message = 'Too many requests. Please try again shortly.',
} = {}) => {
  const store = new Map();

  // Best-effort periodic cleanup so memory does not grow without bound.
  const cleanupTimer = setInterval(() => {
    const cutoff = nowMs() - 10 * 60_000;
    for (const [key, entry] of store.entries()) {
      if (!entry || entry.start < cutoff) {
        store.delete(key);
      }
    }
  }, 60_000);
  cleanupTimer.unref?.();

  return (req, res, next) => {
    const key = getKey(req, keyGenerator);
    const current = store.get(key);
    const now = nowMs();

    if (!current || (now - current.start) > windowMs) {
      store.set(key, { start: now, count: 1 });
      next();
      return;
    }

    current.count += 1;

    if (current.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - current.start)) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        status: 'error',
        code: 'RATE_LIMITED',
        message,
        retryAfter: retryAfterSeconds,
      });
      return;
    }

    next();
  };
};
