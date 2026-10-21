import type { RequestHandler, Response } from 'express';
import { authenticateDevice, type DeviceContext } from '../modules/vehicles/vehicles.service.js';
import { AppError } from '../shared/errors.js';

export const API_KEY_HEADER = 'x-api-key';

/**
 * Authenticates a device by its API key. The vehicle is derived from the key
 * and stored in res.locals; handlers must never trust a vehicleId in the body.
 */
export const requireApiKey: RequestHandler = async (req, res, next) => {
  const apiKey = req.header(API_KEY_HEADER);
  if (!apiKey) throw new AppError(401, 'MISSING_API_KEY', `Missing ${API_KEY_HEADER} header`);

  res.locals.device = await authenticateDevice(apiKey);
  next();
};

export function getDevice(res: Response): DeviceContext {
  const device = res.locals.device as DeviceContext | undefined;
  if (!device) throw new Error('getDevice() used on a route without requireApiKey');
  return device;
}
