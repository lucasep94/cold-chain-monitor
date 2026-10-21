import express from 'express';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorHandler } from '../src/middlewares/errorHandler.js';
import { validate } from '../src/middlewares/validate.js';
import { silentLogger } from './helpers.js';

const app = express();
app.use(pinoHttp({ logger: silentLogger }));
app.use(express.json());
app.post(
  '/items/:id',
  validate({
    params: z.strictObject({ id: z.string().regex(/^[a-f0-9]{24}$/) }),
    query: z.strictObject({ limit: z.coerce.number().int().max(100).default(10) }),
    body: z.strictObject({ name: z.string().min(1) }),
  }),
  (req, res) => {
    res.json({ params: req.params, query: req.query, body: req.body as unknown });
  },
);
app.use(errorHandler);

const validId = '64b7f0c2a1b2c3d4e5f60718';

describe('validate middleware', () => {
  it('passes parsed values to the handler', async () => {
    const res = await request(app).post(`/items/${validId}?limit=5`).send({ name: 'truck' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      params: { id: validId },
      query: { limit: 5 },
      body: { name: 'truck' },
    });
  });

  it('applies defaults from the schema', async () => {
    const res = await request(app).post(`/items/${validId}`).send({ name: 'truck' });

    expect(res.body.query).toEqual({ limit: 10 });
  });

  it('rejects unknown body fields', async () => {
    const res = await request(app)
      .post(`/items/${validId}`)
      .send({ name: 'truck', $where: 'sleep(1000)' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unknown query params and invalid path params', async () => {
    const unknownQuery = await request(app).post(`/items/${validId}?evil=1`).send({ name: 'a' });
    const badParam = await request(app).post('/items/not-an-id').send({ name: 'a' });

    expect(unknownQuery.status).toBe(400);
    expect(badParam.status).toBe(400);
  });

  it('rejects objects where a string is expected (NoSQL injection)', async () => {
    const res = await request(app)
      .post(`/items/${validId}`)
      .send({ name: { $ne: null } });

    expect(res.status).toBe(400);
  });
});
