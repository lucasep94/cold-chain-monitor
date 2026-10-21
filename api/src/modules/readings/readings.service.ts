import type { Types } from 'mongoose';
import { ValidationError } from '../../shared/errors.js';
import { toIssueList } from '../../shared/validation.js';
import { Vehicle } from '../vehicles/vehicles.model.js';
import { Reading } from './readings.model.js';
import { buildReadingSchema, type ReadingInput } from './readings.schemas.js';

export interface RejectedReading {
  index: number;
  errors: { path: string; message: string }[];
}

export interface IngestResult {
  accepted: number;
  rejected: RejectedReading[];
}

export interface IngestOptions {
  maxAgeHours: number;
}

/**
 * Stores the valid readings of a batch and advances the vehicle's lastReading.
 * Invalid items are reported back; if none is valid, nothing is stored and a
 * ValidationError (400) is thrown.
 */
export async function ingestReadings(
  vehicleId: Types.ObjectId,
  items: unknown[],
  { maxAgeHours }: IngestOptions,
): Promise<IngestResult> {
  const schema = buildReadingSchema(maxAgeHours);
  const valid: ReadingInput[] = [];
  const rejected: RejectedReading[] = [];

  items.forEach((item, index) => {
    const result = schema.safeParse(item);
    if (result.success) valid.push(result.data);
    else rejected.push({ index, errors: toIssueList(result.error) });
  });

  if (valid.length === 0) {
    throw new ValidationError('No valid readings in request', { accepted: 0, rejected });
  }

  await Reading.insertMany(valid.map((reading) => ({ ...reading, vehicleId })));

  const latest = valid.reduce((a, b) => (b.timestamp > a.timestamp ? b : a));
  await advanceLastReading(vehicleId, latest);

  // TODO(phase 4): evaluate alerts with `latest`.

  return { accepted: valid.length, rejected };
}

/**
 * Sets lastReading only if `reading` is newer than the stored one. The check
 * and the write are a single atomic update, so readings that arrive out of
 * order or in parallel never overwrite a more recent state.
 */
async function advanceLastReading(vehicleId: Types.ObjectId, reading: ReadingInput): Promise<void> {
  await Vehicle.updateOne(
    {
      _id: vehicleId,
      status: { $ne: 'inactive' },
      $or: [{ lastReading: null }, { 'lastReading.ts': { $lt: reading.timestamp } }],
    },
    {
      $set: {
        lastReading: {
          ts: reading.timestamp,
          temperature: reading.temperature,
          location: reading.location,
          speed: reading.speed,
        },
        status: 'online',
      },
    },
  );
}

/** Removes every reading of the given vehicles (used by the seed script). */
export async function deleteReadingsForVehicles(vehicleIds: Types.ObjectId[]): Promise<void> {
  if (vehicleIds.length === 0) return;
  await Reading.deleteMany({ vehicleId: { $in: vehicleIds } });
}
