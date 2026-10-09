import { describe, expect, it } from 'vitest';
import { createSalesHistoryService, type SalesHistoryRepository } from '../../../src/modules/sales/history-service.js';

const organizationId = '38e7c8c5-ec67-4fa4-b4b8-7d2156be5d55';
const query = { limit: 25, offset: 50 };

describe('sales history service', () => {
  it('returns a bounded organization-scoped page alongside its matching total', async () => {
    const calls: string[] = [];
    const repository: SalesHistoryRepository = {
      list: async (id, input) => { calls.push(`list:${id}:${input.limit}:${input.offset}`); return [{ id: 'sale-1', customerName: 'Ahmed', warehouseName: 'Main', total: '10.0000', status: 'POSTED', occurredAt: new Date('2026-01-01T00:00:00.000Z') }]; },
      count: async (id, input) => { calls.push(`count:${id}:${input.limit}:${input.offset}`); return 51; }
    };
    await expect(createSalesHistoryService(repository).list(organizationId, query)).resolves.toMatchObject({ total: 51, limit: 25, offset: 50, sales: [{ id: 'sale-1' }] });
    expect(calls.sort()).toEqual([`count:${organizationId}:25:50`, `list:${organizationId}:25:50`]);
  });
});
