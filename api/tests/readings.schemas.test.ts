import { describe, expect, it } from 'vitest';
import {
  FUTURE_TOLERANCE_MS,
  buildIngestBodySchema,
  buildReadingSchema,
} from '../src/modules/readings/readings.schemas.js';
import { makeReading } from './helpers.js';

const schema = buildReadingSchema(24);

function issuePaths(input: unknown): string[] {
  const result = schema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
}

describe('reading schema', () => {
  it('accepts a valid reading and converts the timestamp to a Date', () => {
    const result = schema.parse(makeReading());

    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it('accepts a reading without speed', () => {
    const { speed: _speed, ...reading } = makeReading();

    expect(schema.safeParse(reading).success).toBe(true);
  });

  it.each([
    ['temperature above 60', { temperature: 61 }, 'temperature'],
    ['temperature below -60', { temperature: -61 }, 'temperature'],
    ['temperature as string', { temperature: '-20' }, 'temperature'],
    ['negative speed', { speed: -1 }, 'speed'],
    ['longitude out of range', { location: { type: 'Point', coordinates: [181, 40] } }, 'location'],
    ['latitude out of range', { location: { type: 'Point', coordinates: [-3, 91] } }, 'location'],
    ['non-Point geometry', { location: { type: 'LineString', coordinates: [0, 0] } }, 'location'],
    ['non-ISO timestamp', { timestamp: '21/10/2026 10:00' }, 'timestamp'],
    ['unknown field', { vehicleId: '64b7f0c2a1b2c3d4e5f60718' }, ''],
  ])('rejects %s', (_name, overrides, path) => {
    const paths = issuePaths(makeReading(overrides));

    expect(paths.some((p) => p.startsWith(path))).toBe(true);
  });

  it('accepts small clock skew but rejects timestamps in the future', () => {
    const skewed = new Date(Date.now() + FUTURE_TOLERANCE_MS / 2).toISOString();
    const future = new Date(Date.now() + FUTURE_TOLERANCE_MS + 60_000).toISOString();

    expect(issuePaths(makeReading({ timestamp: skewed }))).toEqual([]);
    expect(issuePaths(makeReading({ timestamp: future }))).toEqual(['timestamp']);
  });

  it('rejects readings older than the configured max age', () => {
    const old = new Date(Date.now() - 25 * 3_600_000).toISOString();

    expect(issuePaths(makeReading({ timestamp: old }))).toEqual(['timestamp']);
  });
});

describe('ingest body schema', () => {
  const body = buildIngestBodySchema(3);

  it('wraps a single reading in an array', () => {
    expect(body.parse({ a: 1 })).toEqual([{ a: 1 }]);
  });

  it('accepts arrays up to the max batch size', () => {
    expect(body.parse([1, 2, 3])).toHaveLength(3);
  });

  it('rejects empty arrays, oversized batches and non-objects', () => {
    expect(body.safeParse([]).success).toBe(false);
    expect(body.safeParse([1, 2, 3, 4]).success).toBe(false);
    expect(body.safeParse('reading').success).toBe(false);
  });
});
