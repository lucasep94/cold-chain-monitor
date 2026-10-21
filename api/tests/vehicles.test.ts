import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnectDb } from '../src/config/db.js';
import { Vehicle } from '../src/modules/vehicles/vehicles.model.js';
import { buildTestApp, connectTestDb } from './helpers.js';

const app = buildTestApp();

const truck = { plate: '4821 kdt', cargoType: 'frozen', minTemp: -25, maxTemp: -18 };

async function createTruck(overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/v1/vehicles')
    .send({ ...truck, ...overrides });
  expect(res.status).toBe(201);
  return res.body as { vehicle: { id: string; plate: string }; apiKey: string };
}

beforeAll(() => connectTestDb('vehicles'));
afterAll(() => disconnectDb());
beforeEach(() => Vehicle.deleteMany({}));

describe('POST /vehicles', () => {
  it('creates a vehicle and returns its API key once', async () => {
    const { vehicle, apiKey } = await createTruck();

    expect(apiKey).toMatch(/^ccm_/);
    expect(vehicle).toMatchObject({
      plate: '4821 KDT',
      cargoType: 'frozen',
      minTemp: -25,
      maxTemp: -18,
      status: 'no_signal',
      lastReading: null,
    });
    expect(vehicle).not.toHaveProperty('apiKeyHash');

    const stored = await Vehicle.findById(vehicle.id).select('+apiKeyHash').lean();
    expect(stored?.apiKeyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored?.apiKeyHash).not.toContain(apiKey);
  });

  it('answers 409 for a duplicate plate, regardless of case', async () => {
    await createTruck();

    const res = await request(app)
      .post('/api/v1/vehicles')
      .send({ ...truck, plate: '4821 KDT' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it.each([
    ['minTemp >= maxTemp', { minTemp: 5, maxTemp: 2 }],
    ['unknown cargo type', { cargoType: 'ice-cream' }],
    ['invalid plate', { plate: '!!' }],
    ['unknown field', { apiKeyHash: 'x' }],
  ])('answers 400 for %s', async (_name, overrides) => {
    const res = await request(app)
      .post('/api/v1/vehicles')
      .send({ ...truck, ...overrides });

    expect(res.status).toBe(400);
  });
});

describe('GET /vehicles', () => {
  beforeEach(async () => {
    await createTruck({ plate: '1111 AAA' });
    await createTruck({ plate: '1112 BBB', cargoType: 'chilled', minTemp: 2, maxTemp: 8 });
    await createTruck({ plate: '2222 CCC' });
    await Vehicle.updateOne({ plate: '2222 CCC' }, { status: 'inactive' });
  });

  it('lists vehicles sorted by plate with pagination info', async () => {
    const res = await request(app).get('/api/v1/vehicles?limit=2');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 2, total: 3 });
    expect(res.body.items.map((v: { plate: string }) => v.plate)).toEqual(['1111 AAA', '1112 BBB']);
    expect(res.body.items[0]).not.toHaveProperty('apiKeyHash');
  });

  it('filters by status and plate prefix', async () => {
    const byStatus = await request(app).get('/api/v1/vehicles?status=inactive');
    const byPlate = await request(app).get('/api/v1/vehicles?plate=111');

    expect(byStatus.body.items.map((v: { plate: string }) => v.plate)).toEqual(['2222 CCC']);
    expect(byPlate.body.total).toBe(2);
  });

  it('treats regex characters in the plate filter literally', async () => {
    const res = await request(app).get('/api/v1/vehicles?plate=.*');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it('rejects unknown query params', async () => {
    const res = await request(app).get('/api/v1/vehicles?apiKeyHash=x');

    expect(res.status).toBe(400);
  });
});

describe('GET /vehicles/:id', () => {
  it('returns the vehicle', async () => {
    const { vehicle } = await createTruck();

    const res = await request(app).get(`/api/v1/vehicles/${vehicle.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(vehicle.id);
  });

  it('answers 404 for an unknown id and 400 for a malformed one', async () => {
    const missing = await request(app).get(
      `/api/v1/vehicles/${new mongoose.Types.ObjectId().toString()}`,
    );
    const malformed = await request(app).get('/api/v1/vehicles/not-an-id');

    expect(missing.status).toBe(404);
    expect(malformed.status).toBe(400);
  });
});

describe('PATCH /vehicles/:id', () => {
  it('updates the temperature range and status', async () => {
    const { vehicle } = await createTruck();

    const res = await request(app)
      .patch(`/api/v1/vehicles/${vehicle.id}`)
      .send({ minTemp: -22, status: 'inactive' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ minTemp: -22, maxTemp: -18, status: 'inactive' });
  });

  it('checks minTemp < maxTemp against the stored values', async () => {
    const { vehicle } = await createTruck();

    const res = await request(app).patch(`/api/v1/vehicles/${vehicle.id}`).send({ minTemp: -10 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['an empty patch', {}],
    ['status online', { status: 'online' }],
    ['the plate', { plate: '9999 ZZZ' }],
  ])('rejects %s', async (_name, body) => {
    const { vehicle } = await createTruck();

    const res = await request(app).patch(`/api/v1/vehicles/${vehicle.id}`).send(body);

    expect(res.status).toBe(400);
  });
});

describe('POST /vehicles/:id/rotate-key', () => {
  it('issues a new key and revokes the old one', async () => {
    const { vehicle, apiKey: oldKey } = await createTruck();

    const res = await request(app).post(`/api/v1/vehicles/${vehicle.id}/rotate-key`);
    const newKey = res.body.apiKey as string;

    expect(res.status).toBe(200);
    expect(newKey).not.toBe(oldKey);

    const reading = {
      timestamp: new Date().toISOString(),
      temperature: -20,
      location: { type: 'Point', coordinates: [-3.7, 40.4] },
    };
    const withOld = await request(app)
      .post('/api/v1/readings')
      .set('x-api-key', oldKey)
      .send(reading);
    const withNew = await request(app)
      .post('/api/v1/readings')
      .set('x-api-key', newKey)
      .send(reading);

    expect(withOld.status).toBe(401);
    expect(withNew.status).toBe(202);
  });

  it('answers 404 for an unknown vehicle', async () => {
    const res = await request(app).post(
      `/api/v1/vehicles/${new mongoose.Types.ObjectId().toString()}/rotate-key`,
    );

    expect(res.status).toBe(404);
  });
});
