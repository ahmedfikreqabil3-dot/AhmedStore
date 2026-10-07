import { describe, expect, it } from 'vitest';
import { createCategorySchema } from '../src/catalogue.js';

describe('catalogue contracts', () => {
  it('trims valid category names', () => {
    expect(createCategorySchema.parse({ name: ' Shirts ' })).toEqual({ name: 'Shirts' });
  });

  it('rejects blank or oversized category names', () => {
    expect(createCategorySchema.safeParse({ name: ' ' }).success).toBe(false);
    expect(createCategorySchema.safeParse({ name: 'x'.repeat(121) }).success).toBe(false);
  });
});
