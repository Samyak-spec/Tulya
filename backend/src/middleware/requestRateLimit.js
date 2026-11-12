const requestBuckets = new Map();

export const createRequestRateLimit = ({ limit, windowMs, message }) => (req, res, next) => {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const existing = requestBuckets.get(key);
  const bucket = existing && existing.resetAt > now
    ? existing
    : { count: 0, resetAt: now + windowMs };

  bucket.count += 1;
  requestBuckets.set(key, bucket);

  if (requestBuckets.size > 10000) {
    for (const [address, value] of requestBuckets.entries()) {
      if (value.resetAt <= now) {
        requestBuckets.delete(address);
      }
    }
  }

  if (bucket.count > limit) {
    res.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
    return res.status(429).json({
      success: false,
      message,
    });
  }

  return next();
};
