import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '../src/index.js';

describe('health response contract', () => {
  it('accepts the API health response', () => {
    expect(healthResponseSchema.parse({ status: 'ok', service: 'api' })).toEqual({ status: 'ok', service: 'api' });
  });
});
