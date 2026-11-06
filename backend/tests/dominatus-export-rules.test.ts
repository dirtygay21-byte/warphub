import { describe, expect, test } from 'bun:test';
import { retryDelayMs, statusForHttpError } from '../src/modules/dominatus/export';

describe('dominatus export retry policy', () => {
  test('backoff is capped and starts with a short delay', () => {
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(2)).toBe(60_000);
    expect(retryDelayMs(3)).toBe(120_000);
    expect(retryDelayMs(6)).toBe(600_000);
    expect(retryDelayMs(20)).toBe(600_000);
  });

  test('temporary failures retry, permanent validation/auth failures stop', () => {
    for (const status of [408, 409, 425, 429, 500, 502, 503, 504, 599]) expect(statusForHttpError(status)).toBe('retry');
    for (const status of [400, 401, 403, 404, 413, 418, 422, 451]) expect(statusForHttpError(status)).toBe('dead');
  });
});
