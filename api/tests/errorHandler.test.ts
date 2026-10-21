import express from 'express';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorHandler } from '../src/middlewares/errorHandler.js';
import { notFound } from '../src/middlewares/notFound.js';
import { ConflictError } from '../src/shared/errors.js';
import { buildTestApp, silentLogger } from './helpers.js';

function appThrowing(error: unknown) {
  const app = express();
  app.use(pinoHttp({ logger: silentLogger }));
  app.use(express.json());
  app.post('/boom', () => {
    throw error;
  });
  app.get('/async-boom', async () => {
    await Promise.resolve();
    throw error;
  });
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('maps AppError subclasses to their status and code', async () => {
    const res = await request(appThrowing(new ConflictError('Plate taken', { plate: 'X' }))).post(
      '/boom',
    );

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: { code: 'CONFLICT', message: 'Plate taken', details: { plate: 'X' } },
    });
  });

  it('handles errors thrown from async handlers', async () => {
    const res = await request(appThrowing(new ConflictError())).get('/async-boom');

    expect(res.status).toBe(409);
  });

  it('maps ZodError to 400 VALIDATION_ERROR with details', async () => {
    const parsed = z.object({ n: z.number() }).safeParse({ n: 'x' });
    const res = await request(appThrowing(parsed.error)).post('/boom');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fieldErrors).toHaveProperty('n');
  });

  it('hides internals of unexpected errors', async () => {
    const res = await request(appThrowing(new Error('db password is hunter2'))).post('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });

  it('answers 400 INVALID_JSON for a malformed body', async () => {
    const res = await request(buildTestApp())
      .post('/api/v1/health')
      .set('content-type', 'application/json')
      .send('{"broken":');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('answers 404 NOT_FOUND for unknown routes', async () => {
    const res = await request(buildTestApp()).get('/api/v1/nope');

    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({
      code: 'NOT_FOUND',
      message: 'Route GET /api/v1/nope not found',
    });
  });
});
