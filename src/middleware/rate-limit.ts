import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { env } from "../config/env";

/**
 * On Render, requests arrive through Cloudflare and Render's proxies on other hosts. Unless
 * TRUST_PROXY is a hop count (or explicit proxy addresses), req.ip is a proxy address and
 * per-IP limits would throttle all users together. Keep limiting off until it is measured
 * (see GET /v1/admin/debug/client-ip). "loopback" does not count: it only trusts proxies
 * on the same machine.
 */
export const rateLimitEnabled = !(env.runningOnRender && !env.trustProxyReachesClient);

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
