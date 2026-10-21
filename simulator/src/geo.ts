/** [lng, lat], the GeoJSON order used by the API. */
export type LngLat = [number, number];

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineKm([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

interface Segment {
  from: LngLat;
  to: LngLat;
  startKm: number;
  lengthKm: number;
}

/** A route made of waypoints, addressable by distance travelled from the start. */
export class Route {
  readonly lengthKm: number;
  private readonly segments: Segment[];

  constructor(
    readonly name: string,
    points: LngLat[],
  ) {
    if (points.length < 2) throw new Error(`Route ${name} needs at least two waypoints`);

    let startKm = 0;
    this.segments = points.slice(1).map((to, i) => {
      const from = points[i] ?? to;
      const lengthKm = haversineKm(from, to);
      const segment = { from, to, startKm, lengthKm };
      startKm += lengthKm;
      return segment;
    });
    this.lengthKm = startKm;
  }

  /** Position after `distanceKm` along the route, clamped to its ends. */
  positionAt(distanceKm: number): LngLat {
    const last = this.segments[this.segments.length - 1];
    if (last && distanceKm >= this.lengthKm) return last.to; // avoid float drift at the end

    const d = Math.max(distanceKm, 0);
    const segment = this.segments.find((s) => d <= s.startKm + s.lengthKm) ?? last;
    if (!segment) throw new Error(`Route ${this.name} has no segments`);

    const t = segment.lengthKm === 0 ? 0 : (d - segment.startKm) / segment.lengthKm;
    const [lng1, lat1] = segment.from;
    const [lng2, lat2] = segment.to;
    // Linear interpolation is accurate enough over segments of a few dozen km.
    return [lng1 + (lng2 - lng1) * t, lat1 + (lat2 - lat1) * t];
  }
}
