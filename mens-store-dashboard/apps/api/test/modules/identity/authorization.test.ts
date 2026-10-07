import { describe, expect, it } from 'vitest';
import { can } from '../../../src/modules/identity/authorization.js';

describe('role authorization', () => {
  it('grants only permissions assigned to the role', () => {
    expect(can('ADMIN', 'users:manage')).toBe(true);
    expect(can('CASHIER', 'users:manage')).toBe(false);
    expect(can('FINANCE', 'returns:approve_no_invoice')).toBe(true);
    expect(can('MANAGER', 'returns:approve_no_invoice')).toBe(false);
  });
});
