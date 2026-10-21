import { describe, expect, it } from 'vitest';
import { Route, haversineKm } from '../src/geo.js';
import { gaussian, seededRng } from '../src/random.js';
import { Truck } from '../src/truck.js';

const route = new Route('test', [
  [0, 0],
  [0, 1],
]);

function makeTruck(seed = 1) {
  return new Truck(
    { plate: 'TEST 1', apiKey: 'ccm_x', minTemp: -25, maxTemp: -18, route },
    seededRng(seed),
  );
}

describe('gaussian', () => {
  it('has mean ~0 and std ~1', () => {
    const rng = seededRng(42);
    const samples = Array.from({ length: 20_000 }, () => gaussian(rng));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;

    expect(mean).toBeCloseTo(0, 1);
    expect(Math.sqrt(variance)).toBeCloseTo(1, 1);
  });
});

describe('Truck', () => {
  it('produces readings in the API format', () => {
    const now = new Date('2026-10-21T10:00:00.000Z');
    const reading = makeTruck().tick(5, now);

    expect(reading.timestamp).toBe(now.toISOString());
    expect(reading.location.type).toBe('Point');
    expect(reading.location.coordinates).toHaveLength(2);
    expect(reading.speed).toBeGreaterThanOrEqual(40);
    expect(reading.speed).toBeLessThanOrEqual(95);
  });

  it('keeps the temperature close to the middle of the allowed range', () => {
    const truck = makeTruck();
    const temps = Array.from({ length: 500 }, () => truck.tick(5).temperature);

    expect(truck.setpoint).toBe(-21.5);
    expect(Math.min(...temps)).toBeGreaterThan(-25);
    expect(Math.max(...temps)).toBeLessThan(-18);
  });

  it('moves along the route at a plausible speed', () => {
    const truck = makeTruck();
    const first = truck.tick(60).location.coordinates;
    const second = truck.tick(60).location.coordinates;

    // At most 95 km/h for one minute.
    const km = haversineKm(first, second);
    expect(km).toBeGreaterThan(0);
    expect(km).toBeLessThanOrEqual(95 / 60 + 1e-6);
  });

  it('turns around at the end of the route and stays on it', () => {
    const truck = makeTruck();
    // ~111 km route; 4 hours at >= 40 km/h guarantees at least one turnaround.
    for (let i = 0; i < 240; i++) {
      const [lng, lat] = truck.tick(60).location.coordinates;
      expect(lng).toBe(0);
      expect(lat).toBeGreaterThanOrEqual(0);
      expect(lat).toBeLessThanOrEqual(1);
    }
  });
});
