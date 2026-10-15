import { rateLimit } from "express-rate-limit";

// In-memory counters: correct for the single PM2 fork instance this service runs as.
function limiter(windowMs: number, limit: number) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    // Never 404: the desktop app treats 404 as a missing endpoint.
    message: { error: "RATE_LIMITED", message: "Too many requests. Please try again later." },
  });
}

/** Desktop app license calls (activate/validate/deactivate), per client IP. */
export const licenseRateLimit = limiter(60_000, 60);

/** Public checkout creation from the landing page, per client IP. */
export const checkoutRateLimit = limiter(60_000, 10);

/** Admin API, per client IP; slows down key guessing. */
export const adminRateLimit = limiter(60_000, 30);
