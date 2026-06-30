import type { RequestHandler } from 'express';
import { env } from '@/config/env';

export const requireAdminApiKey: RequestHandler = (req, res, next) => {
  const apiKey = req.header('x-api-key');
  if (apiKey !== env.adminApiKey) {
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }

  next();
};
