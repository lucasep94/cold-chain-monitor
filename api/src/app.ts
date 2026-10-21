import express, { type Express } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { errorHandler } from './middlewares/errorHandler.js';
import { notFound } from './middlewares/notFound.js';
import { healthRouter } from './modules/health/health.routes.js';

export interface AppDeps {
  logger: Logger;
}

export function createApp({ logger }: AppDeps): Express {
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
  app.use('/api/v1', v1);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
