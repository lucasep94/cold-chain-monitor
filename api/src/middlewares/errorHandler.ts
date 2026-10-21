import type { ErrorRequestHandler } from 'express';
import { ZodError, z } from 'zod';
import { AppError } from '../shared/errors.js';

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/** Errors raised by Express' body parser (malformed JSON, payload too large...). */
function isBodyParserError(err: unknown): err is { status: number; type: string; message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    typeof err.status === 'number' &&
    'type' in err &&
    typeof err.type === 'string'
  );
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let status = 500;
  let body: ErrorBody = { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } };

  if (err instanceof AppError) {
    status = err.statusCode;
    body = { error: { code: err.code, message: err.message, details: err.details } };
  } else if (err instanceof ZodError) {
    status = 400;
    body = {
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: z.flattenError(err) },
    };
  } else if (isBodyParserError(err) && err.status < 500) {
    const malformed = err.type === 'entity.parse.failed';
    status = err.status;
    body = {
      error: {
        code: malformed ? 'INVALID_JSON' : 'BAD_REQUEST',
        message: malformed ? 'Malformed JSON body' : err.message,
      },
    };
  }

  if (status >= 500) {
    req.log.error({ err }, 'Unhandled error');
  }

  res.status(status).json(body);
};
