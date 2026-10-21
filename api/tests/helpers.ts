import { pino } from 'pino';
import { createApp } from '../src/app.js';

export const silentLogger = pino({ level: 'silent' });

export function buildTestApp() {
  return createApp({ logger: silentLogger });
}
