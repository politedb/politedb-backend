import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { env } from "../config/env";

/**
 * Behind Render's proxies without TRUST_PROXY, every request appears to come from the
 * proxy, so per-IP limits would throttle all users together. Disable limiting until the
 * hop count is configured (see GET /v1/admin/debug/client-ip).
 */
export const rateLimitEnabled = !(env.runningOnRender && !env.trustProxyConfigured);

const passThrough: RequestHandler = (_req, _res, next) => next();

// In-memory counters, per process: with several instances each one counts separately.
function limiter(windowMs: number, limit: number): RequestHandler {
  if (!rateLimitEnabled) {
    return passThrough;
  }
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
