import { Router } from 'express';
import { requireAdminApiKey } from '@/middleware/require-api-key';
import { createLicense, listLicenses, revokeLicense } from '../services/license.service';
import { wrapHandler } from '@/utils/wrap-handler';

export const adminRouter = Router();

adminRouter.use(requireAdminApiKey);

adminRouter.post(
  '/licenses',
  wrapHandler(async (req) => createLicense(req.body), { status: 201 }),
);

adminRouter.get(
  '/licenses',
  wrapHandler(async () => listLicenses()),
);

adminRouter.post(
  '/licenses/:licenseId/revoke',
  wrapHandler(async (req) => revokeLicense(String(req.params.licenseId))),
);
