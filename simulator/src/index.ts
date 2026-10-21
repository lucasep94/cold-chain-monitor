/**
 * Fleet simulator: each truck drives along a predefined route and POSTs a
 * reading every --interval seconds using its own device API key.
 */
import { sendReadings } from './client.js';
import { USAGE, loadKeys, parseConfig } from './config.js';
import { ROUTES } from './routes/index.js';
import { Truck } from './truck.js';

function log(message: string): void {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);
}

async function main(): Promise<void> {
  const config = parseConfig(process.argv.slice(2));
  if (config === 'help') {
    console.log(USAGE);
    return;
  }

  const keys = await loadKeys(config.keysPath);
  const fleet = keys.slice(0, config.trucks ?? keys.length).map((key, i) => {
    const route = ROUTES[i % ROUTES.length];
    if (!route) throw new Error('No routes available');
    // Spread trucks sharing a route along it instead of stacking them at the start.
    const lap = Math.floor(i / ROUTES.length);
    return new Truck({ ...key, route, startKm: (route.lengthKm * (lap * 0.37)) % route.lengthKm });
  });

  log(
    `Simulating ${fleet.length} truck(s) every ${config.intervalSeconds}s against ${config.apiUrl}`,
  );

  const tick = async (): Promise<void> => {
    await Promise.all(
      fleet.map(async (truck) => {
        const reading = truck.tick(config.intervalSeconds);
        try {
          const result = await sendReadings(config.apiUrl, truck.apiKey, [reading]);
          const summary = result.error ?? `accepted=${result.accepted} rejected=${result.rejected}`;
          log(`${truck.plate} ${reading.temperature.toFixed(1)}°C -> ${result.status} ${summary}`);
        } catch (err) {
          log(`${truck.plate} request failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),
    );
  };

  await tick();
  const timer = setInterval(() => void tick(), config.intervalSeconds * 1000);

  const stop = (): void => {
    clearInterval(timer);
    log('Simulator stopped');
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
