import crypto from "node:crypto";
import { Router } from "express";
import { env } from "../config/env";
import { adminRateLimit } from "../middleware/rate-limit";
import { listLicenses, revokeLicense } from "../services/license-service";
import { listFailedLicenseEmails, resendLicenseEmail } from "../services/polar-service";

export const adminRouter = Router();

// Constant-time comparison. Only the key length can leak, which does not help guessing a
// random key.
function isValidAdminKey(provided: string | undefined) {
  if (!provided) {
    return false;
  }
  const actual = Buffer.from(provided);
  const expected = Buffer.from(env.adminApiKey);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

adminRouter.use(adminRateLimit);

adminRouter.use((req, res, next) => {
  if (!isValidAdminKey(req.header("x-api-key"))) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }

  next();
});

adminRouter.get("/licenses", async (_req, res, next) => {
  try {
    res.json({ items: await listLicenses() });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/licenses/:licenseId/revoke", async (req, res, next) => {
  try {
    res.json(await revokeLicense(req.params.licenseId));
  } catch (error) {
    next(error);
  }
});

// Shows how the app sees the caller's IP. Call it from a known IP (optionally with a fake
// X-Forwarded-For) to choose TRUST_PROXY: `ip` must equal your real public IP.
adminRouter.get("/debug/client-ip", (req, res) => {
  res.json({
    ip: req.ip,
    ips: req.ips,
    forwardedFor: req.get("x-forwarded-for") ?? null,
    trustProxy: env.trustProxy,
  });
});

adminRouter.get("/license-emails/failed", async (_req, res, next) => {
  try {
    res.json({ items: await listFailedLicenseEmails() });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/license-emails/:grantId/resend", async (req, res, next) => {
  try {
    res.json(await resendLicenseEmail(req.params.grantId));
  } catch (error) {
    next(error);
  }
});
