import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureReadingsCollection } from '../src/config/collections.js';
import { disconnectDb } from '../src/config/db.js';
import { Reading } from '../src/modules/readings/readings.model.js';
import { Vehicle } from '../src/modules/vehicles/vehicles.model.js';
import { createVehicle } from '../src/modules/vehicles/vehicles.service.js';
import { buildTestApp, connectTestDb, isoAgo, makeReading } from './helpers.js';

const app = buildTestApp();

let vehicleId: string;
let apiKey: string;

function ingest(body: unknown, key: string | null = apiKey) {
  const req = request(app).post('/api/v1/readings');
  if (key !== null) req.set('x-api-key', key);
  return req.send(body as object);
}

async function readingsCollectionOptions(): Promise<Record<string, unknown> | undefined> {
  const [info] = await mongoose.connection.db!.listCollections({ name: 'readings' }).toArray();
  return info && 'options' in info ? info.options : undefined;
}

async function storedVehicle() {
  return Vehicle.findById(vehicleId).lean();
}

beforeAll(() => connectTestDb('readings'));
afterAll(() => disconnectDb());

beforeEach(async () => {
  await Promise.all([Vehicle.deleteMany({}), Reading.deleteMany({})]);
  const created = await createVehicle({
    plate: '4821 KDT',
    cargoType: 'frozen',
    minTemp: -25,
    maxTemp: -18,
  });
  vehicleId = created.vehicle.id;
  apiKey = created.apiKey;
});

describe('readings collection', () => {
  it('is a time-series collection with the configured TTL', async () => {
    const [info] = await mongoose.connection.db!.listCollections({ name: 'readings' }).toArray();

    expect(info?.type).toBe('timeseries');
    expect(await readingsCollectionOptions()).toMatchObject({
      timeseries: { timeField: 'timestamp', metaField: 'vehicleId', granularity: 'seconds' },
      expireAfterSeconds: 30 * 86_400,
    });
  });

  it('updates the TTL when retention changes', async () => {
    await ensureReadingsCollection(7);
    const options = await readingsCollectionOptions();
    await ensureReadingsCollection(30);

    expect(options?.expireAfterSeconds).toBe(7 * 86_400);
  });
});

describe('POST /readings authentication', () => {
  it('answers 401 without an API key', async () => {
    const res = await ingest(makeReading(), null);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('MISSING_API_KEY');
  });

  it('answers 401 for an unknown API key', async () => {
    const res = await ingest(makeReading(), 'ccm_not-a-real-key');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_API_KEY');
  });

  it('answers 403 for an inactive vehicle and stores nothing', async () => {
    await Vehicle.updateOne({ _id: vehicleId }, { status: 'inactive' });

    const res = await ingest(makeReading());

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('VEHICLE_INACTIVE');
    expect(await Reading.countDocuments()).toBe(0);
  });

  it('takes the vehicle from the key, never from the body', async () => {
    const res = await ingest(makeReading({ vehicleId: new mongoose.Types.ObjectId().toString() }));

    expect(res.status).toBe(400);
    expect(await Reading.countDocuments()).toBe(0);
  });
});

describe('POST /readings ingestion', () => {
  it('stores a single reading and sets lastReading and status', async () => {
    const reading = makeReading({ temperature: -21.5 });

    const res = await ingest(reading);

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: 1, rejected: [] });

    const stored = await Reading.find({ vehicleId }).lean();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ temperature: -21.5, speed: 72 });

    const vehicle = await storedVehicle();
    expect(vehicle?.status).toBe('online');
    expect(vehicle?.lastReading?.ts.toISOString()).toBe(reading.timestamp);
    expect(vehicle?.lastReading?.temperature).toBe(-21.5);
  });

  it('stores a batch and uses its newest reading for lastReading', async () => {
    const batch = [
      makeReading({ timestamp: isoAgo(30), temperature: -20 }),
      makeReading({ timestamp: isoAgo(10), temperature: -19 }),
      makeReading({ timestamp: isoAgo(20), temperature: -21 }),
    ];

    const res = await ingest(batch);

    expect(res.body.accepted).toBe(3);
    expect((await storedVehicle())?.lastReading?.temperature).toBe(-19);
  });

  it('accepts the valid part of a partially invalid batch', async () => {
    const batch = [
      makeReading({ timestamp: isoAgo(30) }),
      makeReading({ temperature: 999 }),
      makeReading({ timestamp: isoAgo(10) }),
      { nonsense: true },
    ];

    const res = await ingest(batch);

    expect(res.status).toBe(202);
    expect(res.body.accepted).toBe(2);
    expect(res.body.rejected.map((r: { index: number }) => r.index)).toEqual([1, 3]);
    expect(res.body.rejected[0].errors[0]).toMatchObject({ path: 'temperature' });
    expect(await Reading.countDocuments({ vehicleId })).toBe(2);
  });

  it('answers 400 and stores nothing when every reading is invalid', async () => {
    const res = await ingest([makeReading({ temperature: 999 }), makeReading({ speed: -5 })]);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toMatchObject({ accepted: 0 });
    expect(res.body.error.details.rejected).toHaveLength(2);
    expect(await Reading.countDocuments()).toBe(0);
    expect((await storedVehicle())?.status).toBe('no_signal');
  });

  it('rejects batches larger than MAX_BATCH_SIZE and empty batches', async () => {
    const tooMany = Array.from({ length: 101 }, () => makeReading());

    expect((await ingest(tooMany)).status).toBe(400);
    expect((await ingest([])).status).toBe(400);
  });

  it('does not let an older reading overwrite lastReading', async () => {
    await ingest(makeReading({ timestamp: isoAgo(10), temperature: -19 }));
    const late = await ingest(makeReading({ timestamp: isoAgo(60), temperature: -24 }));

    expect(late.status).toBe(202);
    expect(await Reading.countDocuments({ vehicleId })).toBe(2);
    expect((await storedVehicle())?.lastReading?.temperature).toBe(-19);
  });

  it('keeps the newest lastReading under concurrent requests', async () => {
    const readings = Array.from({ length: 20 }, (_, i) =>
      makeReading({ timestamp: isoAgo(100 - i), temperature: -25 + i * 0.1 }),
    );
    const newest = readings[readings.length - 1]!;

    // Send in reverse-ish shuffled order, all at once.
    const shuffled = [...readings].sort(() => Math.random() - 0.5);
    const responses = await Promise.all(shuffled.map((r) => ingest(r)));

    expect(responses.every((r) => r.status === 202)).toBe(true);
    expect(await Reading.countDocuments({ vehicleId })).toBe(20);
    expect((await storedVehicle())?.lastReading?.ts.toISOString()).toBe(newest.timestamp);
  });
});
