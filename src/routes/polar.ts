import { Router } from 'express';
import {
  createPolarCheckout,
  handlePolarWebhook,
  WebhookVerificationError,
} from '../services/polar.service';
import { wrapHandler } from '@/utils/wrap-handler';

export const polarRouter = Router();

polarRouter.post(
  '/checkout',
  wrapHandler(async (req) => createPolarCheckout(req.body), { status: 201 }),
);

polarRouter.post('/webhooks', async (req, res, next) => {
  try {
    const result = await handlePolarWebhook(req.body as Buffer, req.headers);
    res.status(202).json(result);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      res.status(403).json({ error: 'INVALID_POLAR_SIGNATURE' });
      return;
    }

    next(error);
  }
});
