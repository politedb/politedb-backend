import { Router } from "express";
import { checkoutRateLimit } from "../middleware/rate-limit";
import {
  createPolarCheckout,
  handlePolarWebhook,
  WebhookVerificationError,
} from "../services/polar-service";

export const polarRouter = Router();

polarRouter.post("/checkout", checkoutRateLimit, async (req, res, next) => {
  try {
    const checkout = await createPolarCheckout(req.body);
    res.status(201).json(checkout);
  } catch (error) {
    next(error);
  }
});

polarRouter.post("/webhooks", async (req, res, next) => {
  try {
    const result = await handlePolarWebhook(req.body as Buffer, req.headers);
    res.status(202).json(result);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      res.status(403).json({ error: "INVALID_POLAR_SIGNATURE" });
      return;
    }

    next(error);
  }
});
