import { z } from 'zod';

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'must be a valid ObjectId');

export const idParamsSchema = z.strictObject({ id: objectIdSchema });

export const geoPointInputSchema = z.strictObject({
  type: z.literal('Point'),
  coordinates: z.tuple([
    z.number().min(-180).max(180), // lng
    z.number().min(-90).max(90), // lat
  ]),
});

/** Validation issues flattened to `{ path, message }` pairs for API responses. */
export function toIssueList(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}
