import type { Route } from './geo.js';
import { clamp, gaussian, round, type Rng } from './random.js';

export interface TruckConfig {
  plate: string;
  apiKey: string;
  minTemp: number;
  maxTemp: number;
  route: Route;
  /** Starting point along the route, in km. */
  startKm?: number;
}

/** Body of a reading as POST /readings expects it. */
export interface SimulatedReading {
  timestamp: string;
  temperature: number;
  location: { type: 'Point'; coordinates: [number, number] };
  speed: number;
}

const MIN_SPEED_KMH = 40;
const MAX_SPEED_KMH = 95;
const SPEED_STEP_STD = 3;
/** Sensor noise around the setpoint, in °C. */
const TEMP_NOISE_STD = 0.3;

/**
 * A truck driving back and forth along its route, with a cooling unit holding
 * the middle of its allowed range plus small gaussian noise.
 */
export class Truck {
  readonly plate: string;
  readonly apiKey: string;
  readonly setpoint: number;
  private readonly route: Route;
  private distanceKm: number;
  private direction: 1 | -1 = 1;
  private speedKmh: number;

  constructor(
    config: TruckConfig,
    private readonly rng: Rng = Math.random,
  ) {
    this.plate = config.plate;
    this.apiKey = config.apiKey;
    this.route = config.route;
    this.setpoint = (config.minTemp + config.maxTemp) / 2;
    this.distanceKm = clamp(config.startKm ?? 0, 0, this.route.lengthKm);
    this.speedKmh = 70;
  }

  /** Advances the simulation by `elapsedSeconds` and returns the new reading. */
  tick(elapsedSeconds: number, now: Date = new Date()): SimulatedReading {
    this.speedKmh = clamp(
      this.speedKmh + gaussian(this.rng) * SPEED_STEP_STD,
      MIN_SPEED_KMH,
      MAX_SPEED_KMH,
    );
    this.move((this.speedKmh * elapsedSeconds) / 3600);

    const [lng, lat] = this.route.positionAt(this.distanceKm);
    return {
      timestamp: now.toISOString(),
      temperature: round(this.setpoint + gaussian(this.rng) * TEMP_NOISE_STD, 1),
      location: { type: 'Point', coordinates: [round(lng, 6), round(lat, 6)] },
      speed: round(this.speedKmh, 1),
    };
  }

  /** Moves along the route, turning around at either end. */
  private move(km: number): void {
    let next = this.distanceKm + this.direction * km;
    if (next > this.route.lengthKm) {
      next = 2 * this.route.lengthKm - next;
      this.direction = -1;
    } else if (next < 0) {
      next = -next;
      this.direction = 1;
    }
    this.distanceKm = clamp(next, 0, this.route.lengthKm);
  }
}
