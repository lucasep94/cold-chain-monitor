/**
 * Creates the demo fleet and writes its API keys for the simulator.
 * Re-running it replaces the demo vehicles (and their readings) with new keys.
 *
 *   pnpm --filter api seed [--out path/to/keys.json]
 *
 * All vehicles are fictional.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { ensureCollections } from '../config/collections.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { EnvValidationError, loadEnv } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import { deleteReadingsForVehicles } from '../modules/readings/readings.service.js';
import type { CreateVehicleInput } from '../modules/vehicles/vehicles.schemas.js';
import { createVehicle, deleteVehiclesByPlate } from '../modules/vehicles/vehicles.service.js';

const DEMO_FLEET: CreateVehicleInput[] = [
  { plate: '4821 KDT', cargoType: 'frozen', minTemp: -25, maxTemp: -18 },
  { plate: '7350 LBR', cargoType: 'chilled', minTemp: 2, maxTemp: 8 },
  { plate: '1946 MFP', cargoType: 'pharma', minTemp: 2, maxTemp: 8 },
  { plate: '5502 NHS', cargoType: 'frozen', minTemp: -22, maxTemp: -15 },
  { plate: '8817 JZC', cargoType: 'other', minTemp: 10, maxTemp: 18 },
];

const DEFAULT_OUT = fileURLToPath(new URL('../../../simulator/keys.json', import.meta.url));

export interface SimulatorKey extends CreateVehicleInput {
  apiKey: string;
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { out: { type: 'string' } } });
  const outPath = resolve(values.out ?? DEFAULT_OUT);

  const env = loadEnv();
  const logger = createLogger(env);

  await connectDb(env.MONGODB_URI, logger);
  try {
    await ensureCollections(env);

    const removedIds = await deleteVehiclesByPlate(DEMO_FLEET.map((v) => v.plate));
    await deleteReadingsForVehicles(removedIds);

    const keys: SimulatorKey[] = [];
    for (const input of DEMO_FLEET) {
      const { apiKey } = await createVehicle(input);
      keys.push({ ...input, apiKey });
    }

    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(keys, null, 2)}\n`);
    logger.info(
      { vehicles: keys.length, replaced: removedIds.length, keysFile: outPath },
      'Demo fleet seeded',
    );
  } finally {
    await disconnectDb();
  }
}

main().catch((err: unknown) => {
  if (err instanceof EnvValidationError) console.error(err.message);
  else console.error('Seed failed', err);
  process.exit(1);
});
