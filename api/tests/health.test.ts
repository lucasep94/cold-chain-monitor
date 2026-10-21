import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { connectDb, disconnectDb } from '../src/config/db.js';
import { buildTestApp, silentLogger } from './helpers.js';

describe('GET /api/v1/health', () => {
  const app = buildTestApp();

  beforeAll(async () => {
    await connectDb(inject('mongoUri'), silentLogger);
  });

  afterAll(async () => {
    await disconnectDb();
  });

  it('returns 200 when MongoDB is connected', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'up' });
    expect(typeof res.body.uptime).toBe('number');
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
  });

  it('returns 503 when MongoDB is down', async () => {
    await disconnectDb();
    expect(mongoose.connection.readyState).toBe(mongoose.ConnectionStates.disconnected);

    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', db: 'down' });
  });
});
