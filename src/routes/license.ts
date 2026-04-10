import { Router } from "express";
import {
  activatePolarLicenseKey,
  deactivatePolarLicenseKey,
  validatePolarLicenseKey,
} from "../services/polar-license-key";

export const licenseRouter = Router();

licenseRouter.post("/activate", async (req, res, next) => {
  try {
    res.json(await activatePolarLicenseKey(req.body));
  } catch (error) {
    next(error);
  }
});

licenseRouter.post("/validate", async (req, res, next) => {
  try {
    res.json(await validatePolarLicenseKey(req.body));
  } catch (error) {
    next(error);
  }
});

licenseRouter.post("/deactivate", async (req, res, next) => {
  try {
    res.json(await deactivatePolarLicenseKey(req.body));
  } catch (error) {
    next(error);
  }
});
