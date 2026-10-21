import { mongo } from 'mongoose';

/**
 * True for a duplicate key error (E11000). When `field` is given, only if the
 * violated unique index includes that field.
 */
export function isDuplicateKeyError(err: unknown, field?: string): boolean {
  if (!(err instanceof mongo.MongoServerError) || err.code !== 11000) return false;
  if (!field) return true;
  const keyPattern = err.keyPattern as Record<string, unknown> | undefined;
  return keyPattern !== undefined && field in keyPattern;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
