import { Route, type LngLat } from '../geo.js';
import madridValencia from './madrid-valencia.json' with { type: 'json' };
import sevillaMalaga from './sevilla-malaga.json' with { type: 'json' };
import zaragozaBarcelona from './zaragoza-barcelona.json' with { type: 'json' };

interface RouteFile {
  name: string;
  waypoints: number[][];
}

function toRoute({ name, waypoints }: RouteFile): Route {
  const points = waypoints.map((p): LngLat => {
    const [lng, lat] = p;
    if (p.length !== 2 || lng === undefined || lat === undefined) {
      throw new Error(`Route ${name}: waypoints must be [lng, lat]`);
    }
    return [lng, lat];
  });
  return new Route(name, points);
}

/** Approximate highway corridors; enough for realistic-looking movement. */
export const ROUTES: Route[] = [madridValencia, zaragozaBarcelona, sevillaMalaga].map(toRoute);
