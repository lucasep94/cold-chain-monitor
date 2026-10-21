import { createHash, randomBytes } from 'node:crypto';

export const API_KEY_PREFIX = 'ccm_';

/** 256 random bits; the prefix makes leaked keys easy to recognize. */
export function generateApiKey(): string {
  return API_KEY_PREFIX + randomBytes(32).toString('base64url');
}

/**
 * Keys are high-entropy random values, so a fast hash is enough (no salt or
 * key stretching needed) and allows a direct indexed lookup by hash.
 */
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}
