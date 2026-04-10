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

adminRouter.post("/licenses", (req, res, next) => {
  try {
    const created = createLicense(req.body);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/licenses", (_req, res, next) => {
  try {
    res.json({ items: listLicenses() });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/licenses/:licenseId/revoke", (req, res, next) => {
  try {
    res.json(revokeLicense(req.params.licenseId));
  } catch (error) {
    next(error);
  }
});
