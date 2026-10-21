import mongoose from 'mongoose';
import { READINGS_COLLECTION, READINGS_TIMESERIES } from '../modules/readings/readings.model.js';
import { Vehicle } from '../modules/vehicles/vehicles.model.js';
import type { Env } from './env.js';

const SECONDS_PER_DAY = 86_400;

/**
 * Creates `readings` as a time-series collection with TTL, or updates the TTL
 * if the retention setting changed. Fails if a non time-series `readings`
 * collection already exists, since it cannot be converted in place.
 */
export async function ensureReadingsCollection(retentionDays: number): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB is not connected');

  const expireAfterSeconds = retentionDays * SECONDS_PER_DAY;
  const [existing] = await db.listCollections({ name: READINGS_COLLECTION }).toArray();

  if (!existing) {
    await db.createCollection(READINGS_COLLECTION, {
      timeseries: READINGS_TIMESERIES,
      expireAfterSeconds,
    });
    return;
  }

  if (existing.type !== 'timeseries') {
    throw new Error(
      `Collection "${READINGS_COLLECTION}" exists but is not a time-series collection; drop it and restart`,
    );
  }

  const options = 'options' in existing ? existing.options : undefined;
  if (options?.expireAfterSeconds !== expireAfterSeconds) {
    await db.command({ collMod: READINGS_COLLECTION, expireAfterSeconds });
  }
}

/** Creates collections and indexes the API relies on. Run once at startup. */
export async function ensureCollections(env: Pick<Env, 'READINGS_RETENTION_DAYS'>): Promise<void> {
  await ensureReadingsCollection(env.READINGS_RETENTION_DAYS);
  await Vehicle.syncIndexes();
}
