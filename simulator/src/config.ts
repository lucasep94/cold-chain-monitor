import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

export interface SimulatorConfig {
  trucks: number | undefined;
  intervalSeconds: number;
  apiUrl: string;
  keysPath: string;
}

/** One entry of keys.json, as written by `pnpm --filter api seed`. */
export interface VehicleKey {
  plate: string;
  apiKey: string;
  minTemp: number;
  maxTemp: number;
}

export const USAGE = `Usage: pnpm --filter simulator start [options]

  --trucks <n>      Number of trucks to simulate (default: every key in the keys file)
  --interval <s>    Seconds between readings (default: 5)
  --api-url <url>   API base URL (default: $API_URL or http://localhost:3000/api/v1)
  --keys <path>     Keys file written by the seed script (default: ./keys.json)
  --help            Show this message`;

function positiveNumber(name: string, raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`--${name} must be a positive number`);
  return value;
}

export function parseConfig(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): SimulatorConfig | 'help' {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      trucks: { type: 'string' },
      interval: { type: 'string' },
      'api-url': { type: 'string' },
      keys: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) return 'help';

  const trucks = positiveNumber('trucks', values.trucks);
  return {
    trucks: trucks === undefined ? undefined : Math.floor(trucks),
    intervalSeconds: positiveNumber('interval', values.interval) ?? 5,
    apiUrl: (values['api-url'] ?? env.API_URL ?? 'http://localhost:3000/api/v1').replace(/\/$/, ''),
    keysPath: resolve(values.keys ?? 'keys.json'),
  };
}

function isVehicleKey(value: unknown): value is VehicleKey {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.plate === 'string' &&
    typeof v.apiKey === 'string' &&
    typeof v.minTemp === 'number' &&
    typeof v.maxTemp === 'number'
  );
}

export async function loadKeys(path: string): Promise<VehicleKey[]> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    throw new Error(`Cannot read ${path}. Run "pnpm --filter api seed" first.`);
  }
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isVehicleKey)) {
    throw new Error(`${path} must be a non-empty array of { plate, apiKey, minTemp, maxTemp }`);
  }
  return parsed;
}
