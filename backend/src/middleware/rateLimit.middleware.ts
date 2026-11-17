import type { RequestHandler } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
  now?: () => number;
  maxKeys?: number;
}

/** Small bounded in-process limiter for sensitive auth endpoints. */
export function createRateLimit(options: RateLimitOptions): RequestHandler {
  const entries = new Map<string, RateLimitEntry>();
  const now = options.now ?? Date.now;
  const maxKeys = options.maxKeys ?? 10_000;
  let callsSinceSweep = 0;

  return (req, res, next) => {
    const currentTime = now();
    callsSinceSweep += 1;
    if (callsSinceSweep >= 100) {
      callsSinceSweep = 0;
      for (const [key, entry] of entries) {
        if (entry.resetAt <= currentTime) entries.delete(key);
      }
    }

    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const key = `${options.keyPrefix}:${ip}`;
    let entry = entries.get(key);

    if (!entry || entry.resetAt <= currentTime) {
      if (entries.size >= maxKeys && !entry) {
        res.setHeader("Retry-After", Math.ceil(options.windowMs / 1000));
        res.status(429).json({
          success: false,
          status: "fail",
          message: "Too many requests. Please try again later.",
        });
        return;
      }
      entry = { count: 0, resetAt: currentTime + options.windowMs };
      entries.set(key, entry);
    }

    entry.count += 1;
    if (entry.count > options.maxRequests) {
      res.setHeader("Retry-After", Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1000)));
      res.status(429).json({
        success: false,
        status: "fail",
        message: "Too many requests. Please try again later.",
      });
      return;
    }

    next();
  };
}
