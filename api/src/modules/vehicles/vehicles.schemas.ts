import { z } from 'zod';
import { CARGO_TYPES, VEHICLE_STATUSES } from './vehicles.model.js';

const plate = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9 -]{2,10}[A-Z0-9]$/, 'must be 4-12 letters, digits, spaces or dashes');

const temperature = z.number().min(-60).max(60);

const TEMP_RANGE_MESSAGE = 'minTemp must be lower than maxTemp';

export const createVehicleSchema = z
  .strictObject({
    plate,
    cargoType: z.enum(CARGO_TYPES),
    minTemp: temperature,
    maxTemp: temperature,
  })
  .refine((v) => v.minTemp < v.maxTemp, { message: TEMP_RANGE_MESSAGE, path: ['minTemp'] });

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;

/**
 * `online` is only ever set by ingestion. The minTemp < maxTemp rule is checked
 * in the service against the stored values, since a patch may carry only one.
 */
export const updateVehicleSchema = z
  .strictObject({
    cargoType: z.enum(CARGO_TYPES).optional(),
    minTemp: temperature.optional(),
    maxTemp: temperature.optional(),
    status: z.enum(['no_signal', 'inactive']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'at least one field is required' });

export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;

export const listVehiclesQuerySchema = z.strictObject({
  status: z.enum(VEHICLE_STATUSES).optional(),
  plate: z.string().trim().min(1).max(12).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListVehiclesQuery = z.infer<typeof listVehiclesQuerySchema>;

export { TEMP_RANGE_MESSAGE };
