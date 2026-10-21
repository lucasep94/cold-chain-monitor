import { Router } from 'express';
import { requireApiKey } from '../../middlewares/apiKey.js';
import { validate } from '../../middlewares/validate.js';
import { ingestController } from './readings.controller.js';
import { buildIngestBodySchema } from './readings.schemas.js';

export interface ReadingsRouterConfig {
  maxBatchSize: number;
  maxAgeHours: number;
}

export function createReadingsRouter({ maxBatchSize, maxAgeHours }: ReadingsRouterConfig): Router {
  const router = Router();

  // TODO(phase 5): rate limit per API key.
  router.post(
    '/',
    requireApiKey,
    validate({ body: buildIngestBodySchema(maxBatchSize) }),
    ingestController({ maxAgeHours }),
  );

  return router;
}
