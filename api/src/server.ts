import { createApp } from './app.js';
import { ensureCollections } from './config/collections.js';
import { connectDb, disconnectDb } from './config/db.js';
import { EnvValidationError, loadEnv, type Env } from './config/env.js';
import { createLogger } from './config/logger.js';

function readEnvOrExit(): Env {
  try {
    return loadEnv();
  } catch (err) {
    if (err instanceof EnvValidationError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

async function main(): Promise<void> {
  const env = readEnvOrExit();
  const logger = createLogger(env);

  await connectDb(env.MONGODB_URI, logger);
  await ensureCollections(env);

  const app = createApp({ logger, env });
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API listening');
  });

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');
    server.close(() => {
      disconnectDb()
        .then(() => process.exit(0))
        .catch((err: unknown) => {
          logger.error({ err }, 'Error closing MongoDB connection');
          process.exit(1);
        });
    });
    // Force exit if open connections keep the server alive.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err: unknown) => {
  console.error('Fatal error during startup', err);
  process.exit(1);
});
