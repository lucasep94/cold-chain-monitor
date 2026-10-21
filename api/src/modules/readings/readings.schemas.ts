import { z } from 'zod';
import { geoPointInputSchema } from '../../shared/validation.js';

/** Allowed clock skew between a device and the server. */
export const FUTURE_TOLERANCE_MS = 2 * 60_000;
const MS_PER_HOUR = 3_600_000;

/**
 * Schema for a single reading. Timestamp bounds are evaluated at parse time:
 * not later than now + FUTURE_TOLERANCE_MS, not older than `maxAgeHours`.
 */
export function buildReadingSchema(maxAgeHours: number) {
  return z.strictObject({
    timestamp: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value))
      .refine((date) => date.getTime() <= Date.now() + FUTURE_TOLERANCE_MS, {
        message: 'must not be in the future',
      })
      .refine((date) => date.getTime() >= Date.now() - maxAgeHours * MS_PER_HOUR, {
        message: `must not be older than ${maxAgeHours} hours`,
      }),
    temperature: z.number().min(-60).max(60),
    location: geoPointInputSchema,
    speed: z.number().min(0).max(250).optional(),
  });
}

export type ReadingInput = z.infer<ReturnType<typeof buildReadingSchema>>;

/**
 * Request envelope: one reading object or an array of 1..maxBatchSize. Items
 * are only checked to be present here; each one is validated individually by
 * the service so that valid readings in a batch are still accepted.
 */
export function buildIngestBodySchema(maxBatchSize: number) {
  return z
    .union([z.array(z.unknown()).min(1).max(maxBatchSize), z.record(z.string(), z.unknown())])
    .transform((body) => (Array.isArray(body) ? body : [body]));
}
