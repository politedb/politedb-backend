import { Router } from "express";
import { activateLicense, deactivateLicense, validateLicense } from "../services/license-service";

export const licenseRouter = Router();

licenseRouter.post("/activate", (req, res, next) => {
  try {
    res.json(activateLicense(req.body));
  } catch (error) {
    next(error);
  }
});

licenseRouter.post("/validate", (req, res, next) => {
  try {
    res.json(validateLicense(req.body));
  } catch (error) {
    next(error);
  }
});

licenseRouter.post("/deactivate", (req, res, next) => {
  try {
    res.json(deactivateLicense(req.body));
  } catch (error) {
    next(error);
  }
});
