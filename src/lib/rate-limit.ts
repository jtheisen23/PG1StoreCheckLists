/**
 * Small in-process throttle for login attempts. Good enough for a single
 * deployment; swap for Redis/Upstash if the app runs across many instances.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  limit = 8,
  windowMs = 10 * 60 * 1000,
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  entry.count += 1;
  if (entry.count > limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function clearRateLimit(key: string) {
  attempts.delete(key);
}
