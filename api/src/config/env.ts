import { z } from 'zod';

const positiveInt = z.coerce.number().int().positive();

/** Comma-separated list of origins, e.g. "http://a.com,http://b.com". */
const originList = z
  .string()
  .min(1)
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.url()).min(1));

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().min(1).max(65535),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MONGODB_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\//, 'must be a mongodb:// or mongodb+srv:// URI'),
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_ACCESS_TTL: z.string().min(1),
  JWT_REFRESH_TTL: z.string().min(1),
  CORS_ORIGINS: originList,
  READINGS_RETENTION_DAYS: positiveInt,
  SIGNAL_TIMEOUT_MINUTES: positiveInt,
  ALERT_CONSECUTIVE_READINGS: positiveInt,
  MAX_BATCH_SIZE: positiveInt,
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'EnvValidationError';
  }
}

/**
 * Parses and validates environment variables. Throws EnvValidationError listing
 * every missing or invalid variable so the process can fail fast at startup.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const key = issue.path.join('.');
      return source[key] === undefined ? `${key}: is required` : `${key}: ${issue.message}`;
    });
    throw new EnvValidationError(problems);
  }
  return result.data;
}
