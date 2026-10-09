import { describe, expect, it } from 'vitest';
import { createExpenseService, type ExpenseRepository, type PostedExpense } from '../../../src/modules/finance/expense-service.js';

const organizationId = '38e7c8c5-ec67-4fa4-b4b8-7d2156be5d55';
const actorUserId = '63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f';
const input = { category: 'Utilities', description: 'Electricity bill', paymentMethod: 'CASH' as const, amount: '250.5000', occurredAt: new Date('2026-01-01T00:00:00.000Z') };
const expense: PostedExpense = { id: 'f710274a-4b51-49bd-a31f-d6a8ab81b01a', organizationId, ...input };

function repository(overrides: Partial<ExpenseRepository> = {}): ExpenseRepository {
  return {
    findByIdempotencyKey: async () => null,
    post: async ({ actorUserId: _actorUserId, idempotencyKey: _idempotencyKey, ...posted }) => posted,
    ...overrides
  };
}

describe('expense service', () => {
  it('replays an existing expense without posting it again', async () => {
    const service = createExpenseService(repository({ findByIdempotencyKey: async () => expense, post: async () => { throw new Error('must not post a replay'); } }));
    await expect(service.post(organizationId, actorUserId, 'retry-1', input)).resolves.toEqual({ ok: true, expense, replayed: true });
  });

  it('posts a tenant-scoped expense with actor and idempotency context', async () => {
    let command: unknown;
    const service = createExpenseService(repository({ post: async (posted) => { command = posted; const { actorUserId: _actorUserId, idempotencyKey: _idempotencyKey, ...stored } = posted; return stored; } }));
    const result = await service.post(organizationId, actorUserId, 'expense-1', input);
    expect(result).toMatchObject({ ok: true, replayed: false, expense: { organizationId, ...input } });
    expect(command).toMatchObject({ id: expect.any(String), organizationId, actorUserId, idempotencyKey: 'expense-1', ...input });
  });
});
