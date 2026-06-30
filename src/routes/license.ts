import { Router } from 'express';
import {
  activatePolarLicenseKey,
  deactivatePolarLicenseKey,
  validatePolarLicenseKey,
} from '../services/polar-license-key.service';
import { wrapHandler } from '@/utils/wrap-handler';

export const licenseRouter = Router();

licenseRouter.post(
  '/activate',
  wrapHandler(async (req) => activatePolarLicenseKey(req.body)),
);

licenseRouter.post(
  '/validate',
  wrapHandler(async (req) => validatePolarLicenseKey(req.body)),
);

licenseRouter.post(
  '/deactivate',
  wrapHandler(async (req) => deactivatePolarLicenseKey(req.body)),
);
