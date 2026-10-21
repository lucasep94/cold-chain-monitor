import { describe, expect, it } from 'vitest';
import { API_KEY_PREFIX, generateApiKey, hashApiKey } from '../src/modules/vehicles/apiKey.js';

describe('API keys', () => {
  it('generates prefixed, URL-safe, unique keys', () => {
    const keys = new Set(Array.from({ length: 100 }, generateApiKey));

    expect(keys.size).toBe(100);
    for (const key of keys) {
      expect(key).toMatch(new RegExp(`^${API_KEY_PREFIX}[A-Za-z0-9_-]{43}$`));
    }
  });

  it('hashes deterministically to SHA-256 hex', () => {
    const key = generateApiKey();

    expect(hashApiKey(key)).toBe(hashApiKey(key));
    expect(hashApiKey(key)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashApiKey(key)).not.toBe(hashApiKey(generateApiKey()));
  });
});
