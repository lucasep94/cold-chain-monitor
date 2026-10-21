import express, { type Express } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import type { Env } from './config/env.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { notFound } from './middlewares/notFound.js';
import { healthRouter } from './modules/health/health.routes.js';
import { createReadingsRouter } from './modules/readings/readings.routes.js';
import { vehiclesRouter } from './modules/vehicles/vehicles.routes.js';

export interface AppDeps {
  logger: Logger;
  env: Pick<Env, 'MAX_BATCH_SIZE' | 'READINGS_MAX_AGE_HOURS'>;
}

export function createApp({ logger, env }: AppDeps): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(
    pinoHttp({
      logger,
      // Healthchecks run every few seconds; keep them out of the logs.
      autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  const v1 = express.Router();
  v1.use('/health', healthRouter);
  v1.use('/vehicles', vehiclesRouter);
  v1.use(
    '/readings',
    createReadingsRouter({
      maxBatchSize: env.MAX_BATCH_SIZE,
      maxAgeHours: env.READINGS_MAX_AGE_HOURS,
    }),
  );
  app.use('/api/v1', v1);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
