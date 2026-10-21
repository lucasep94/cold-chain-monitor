import type { RequestHandler } from 'express';
import { getHealth } from './health.service.js';

export const healthController: RequestHandler = (_req, res) => {
  const health = getHealth();
  res.status(health.status === 'ok' ? 200 : 503).json(health);
};
