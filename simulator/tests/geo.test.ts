import { describe, expect, it } from 'vitest';
import { Route, haversineKm } from '../src/geo.js';
import { ROUTES } from '../src/routes/index.js';

describe('haversineKm', () => {
  it('measures known distances', () => {
    // Madrid - Valencia is ~302 km in a straight line.
    expect(haversineKm([-3.7038, 40.4168], [-0.3763, 39.4699])).toBeCloseTo(302, -1);
    expect(haversineKm([0, 0], [0, 0])).toBe(0);
  });
});

describe('Route', () => {
  const route = new Route('test', [
    [0, 0],
    [0, 1],
    [1, 1],
  ]);

  it('computes its total length', () => {
    expect(route.lengthKm).toBeCloseTo(haversineKm([0, 0], [0, 1]) + haversineKm([0, 1], [1, 1]));
  });

  it('interpolates positions along segments', () => {
    const firstLeg = haversineKm([0, 0], [0, 1]);

    expect(route.positionAt(0)).toEqual([0, 0]);
    expect(route.positionAt(firstLeg / 2)[1]).toBeCloseTo(0.5);
    expect(route.positionAt(firstLeg)).toEqual([0, 1]);
    expect(route.positionAt(route.lengthKm)).toEqual([1, 1]);
  });

  it('clamps positions outside the route', () => {
    expect(route.positionAt(-5)).toEqual([0, 0]);
    expect(route.positionAt(route.lengthKm + 5)).toEqual([1, 1]);
  });

  it('rejects routes with fewer than two waypoints', () => {
    expect(() => new Route('bad', [[0, 0]])).toThrow();
  });
});

describe('bundled routes', () => {
  it('load with valid [lng, lat] waypoints and a realistic length', () => {
    expect(ROUTES.length).toBeGreaterThan(0);
    for (const route of ROUTES) {
      expect(route.lengthKm).toBeGreaterThan(100);
      const [lng, lat] = route.positionAt(0);
      expect(Math.abs(lng)).toBeLessThanOrEqual(180);
      expect(Math.abs(lat)).toBeLessThanOrEqual(90);
    }
  });
});
