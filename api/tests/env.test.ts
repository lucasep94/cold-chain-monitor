import { describe, expect, it } from 'vitest';
import { EnvValidationError, loadEnv } from '../src/config/env.js';

const validEnv = {
  NODE_ENV: 'test',
  PORT: '3000',
  MONGODB_URI: 'mongodb://localhost:27017/coldchain',
  JWT_ACCESS_SECRET: 'access',
  JWT_REFRESH_SECRET: 'refresh',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '7d',
  CORS_ORIGINS: 'http://localhost:3001, http://localhost:3002',
  READINGS_RETENTION_DAYS: '30',
  READINGS_MAX_AGE_HOURS: '24',
  SIGNAL_TIMEOUT_MINUTES: '5',
  ALERT_CONSECUTIVE_READINGS: '2',
  MAX_BATCH_SIZE: '100',
};

function captureError(fn: () => unknown): EnvValidationError {
  try {
    fn();
  } catch (err) {
    if (err instanceof EnvValidationError) return err;
    throw err;
  }
  throw new Error('Expected loadEnv to throw');
}

describe('loadEnv', () => {
  it('parses and coerces a valid environment', () => {
    const env = loadEnv(validEnv);

    expect(env.PORT).toBe(3000);
    expect(env.MAX_BATCH_SIZE).toBe(100);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3001', 'http://localhost:3002']);
  });

  it('names every missing variable', () => {
    const { JWT_ACCESS_SECRET: _a, MONGODB_URI: _m, ...partial } = validEnv;

    const error = captureError(() => loadEnv(partial));

    expect(error.problems).toEqual(
      expect.arrayContaining(['JWT_ACCESS_SECRET: is required', 'MONGODB_URI: is required']),
    );
    expect(error.message).toContain('JWT_ACCESS_SECRET');
  });

  it('rejects malformed values', () => {
    const error = captureError(() =>
      loadEnv({ ...validEnv, PORT: 'abc', MAX_BATCH_SIZE: '-1', MONGODB_URI: 'postgres://x' }),
    );

    const keys = error.problems.map((p) => p.split(':')[0]);
    expect(keys).toEqual(expect.arrayContaining(['PORT', 'MAX_BATCH_SIZE', 'MONGODB_URI']));
  });

  it('rejects an empty secret', () => {
    const error = captureError(() => loadEnv({ ...validEnv, JWT_REFRESH_SECRET: '' }));

    expect(error.problems[0]).toMatch(/^JWT_REFRESH_SECRET:/);
  });
});
