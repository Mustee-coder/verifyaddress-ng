import { createRateLimit } from "../middleware/rateLimit.middleware.js";

/** Five login attempts per IP in fifteen minutes, tracked per server process. */
export const LOGIN_RATE_LIMIT_OPTIONS = {
  keyPrefix: "auth-login",
  windowMs: 15 * 60_000,
  maxRequests: 5,
} as const;

export const loginRateLimit = createRateLimit(LOGIN_RATE_LIMIT_OPTIONS);
