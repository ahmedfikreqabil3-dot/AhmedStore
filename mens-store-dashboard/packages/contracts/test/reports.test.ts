import { expect, it } from 'vitest';
import { reportQuerySchema } from '../src/reports.js';
it('requires bounded valid periods and allows branch filters only for branch-based reports', () => {
  const base = { kind: 'sales', from: '2026-11-01T00:00:00Z', to: '2026-11-02T00:00:00Z' };
  expect(reportQuerySchema.parse(base)).toMatchObject({ limit: 25, offset: 0 });
  for (const patch of [{ kind: 'unknown' }, { from: 'invalid' }, { from: '2027-01-01' }, { limit: 101 }, { offset: -1 }, { organizationId: 'foreign' }, { warehouseId: 'invalid' }, { kind: 'treasury', warehouseId: 'ab8ce3b4-3af9-4f30-a650-e635dd6b1c80' }]) expect(reportQuerySchema.safeParse({ ...base, ...patch }).success).toBe(false);
});
