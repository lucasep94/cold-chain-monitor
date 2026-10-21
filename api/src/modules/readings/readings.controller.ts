import type { RequestHandler } from 'express';
import { getDevice } from '../../middlewares/apiKey.js';
import { ingestReadings, type IngestOptions } from './readings.service.js';

export function ingestController(options: IngestOptions): RequestHandler {
  return async (req, res) => {
    const { vehicleId } = getDevice(res);
    // validate() normalized the body to an array of raw items.
    const result = await ingestReadings(vehicleId, req.body as unknown[], options);
    res.status(202).json(result);
  };
}
