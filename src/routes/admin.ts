import { Router } from "express";
import { env } from "../config/env";
import { createLicense, listLicenses, revokeLicense } from "../services/license-service";

export const adminRouter = Router();

adminRouter.use((req, res, next) => {
  const apiKey = req.header("x-api-key");
  if (apiKey !== env.adminApiKey) {
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
