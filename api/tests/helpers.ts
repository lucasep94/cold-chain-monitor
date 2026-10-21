import { pino } from 'pino';
import { inject } from 'vitest';
import { createApp } from '../src/app.js';
import { ensureCollections } from '../src/config/collections.js';
import { connectDb } from '../src/config/db.js';
import { loadEnv } from '../src/config/env.js';

export const silentLogger = pino({ level: 'silent' });

export const testEnv = loadEnv({
  NODE_ENV: 'test',
  PORT: '3000',
  LOG_LEVEL: 'silent',
  MONGODB_URI: 'mongodb://localhost:27017/unused',
  JWT_ACCESS_SECRET: 'test-access',
  JWT_REFRESH_SECRET: 'test-refresh',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '7d',
  CORS_ORIGINS: 'http://localhost:3001',
  READINGS_RETENTION_DAYS: '30',
  READINGS_MAX_AGE_HOURS: '24',
  SIGNAL_TIMEOUT_MINUTES: '5',
  ALERT_CONSECUTIVE_READINGS: '2',
  MAX_BATCH_SIZE: '100',
});

export function buildTestApp() {
  return createApp({ logger: silentLogger, env: testEnv });
}

/** Connects to a database of its own on the shared in-memory server. */
export async function connectTestDb(dbName: string): Promise<void> {
  const baseUri = inject('mongoUri').replace(/\/$/, '');
  await connectDb(`${baseUri}/${dbName}`, silentLogger);
  await ensureCollections(testEnv);
}

/** ISO timestamp `secondsAgo` seconds in the past. */
export function isoAgo(secondsAgo: number): string {
  return new Date(Date.now() - secondsAgo * 1000).toISOString();
}

export function makeReading(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    timestamp: isoAgo(10),
    temperature: -20,
    location: { type: 'Point', coordinates: [-3.7038, 40.4168] },
    speed: 72,
    ...overrides,
  };
}
