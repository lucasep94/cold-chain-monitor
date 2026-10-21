import { pino, type Logger } from 'pino';
import type { Env } from './env.js';

export function createLogger(env: Pick<Env, 'LOG_LEVEL'>): Logger {
  return pino({
    level: env.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        'res.headers["set-cookie"]',
        '*.password',
      ],
      censor: '[REDACTED]',
    },
  });
}
