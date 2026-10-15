import crypto from "node:crypto";
import { Router } from "express";
import { env } from "../config/env";
import { createLicense, listLicenses, revokeLicense } from "../services/license-service";
import { listFailedLicenseEmails, resendLicenseEmail } from "../services/polar-service";

export const adminRouter = Router();

// Hash both sides so the comparison is constant-time regardless of input length.
function isValidAdminKey(provided: string | undefined) {
  if (!provided) {
    return false;
  }
  const digest = (value: string) => crypto.createHash("sha256").update(value).digest();
  return crypto.timingSafeEqual(digest(provided), digest(env.adminApiKey));
}

adminRouter.use((req, res, next) => {
  if (!isValidAdminKey(req.header("x-api-key"))) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }

  next();
});

adminRouter.post("/licenses", async (req, res, next) => {
  try {
    const created = await createLicense(req.body);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
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
