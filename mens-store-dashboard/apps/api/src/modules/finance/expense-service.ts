import { randomUUID } from 'node:crypto';
import type { CreateExpenseInput, PaymentMethod } from '@ahmed-store/contracts';

export type PostedExpense = {
  id: string;
  organizationId: string;
  category: string;
  description: string;
  paymentMethod: PaymentMethod;
  amount: string;
  occurredAt: Date;
};

export type PostExpenseCommand = PostedExpense & { actorUserId: string; idempotencyKey: string };

export interface ExpenseRepository {
  findByIdempotencyKey(organizationId: string, idempotencyKey: string): Promise<PostedExpense | null>;
  post(command: PostExpenseCommand): Promise<PostedExpense>;
}

export function createExpenseService(repository: ExpenseRepository) {
  return {
    async post(organizationId: string, actorUserId: string, idempotencyKey: string, input: CreateExpenseInput) {
      const existing = await repository.findByIdempotencyKey(organizationId, idempotencyKey);
      if (existing) return { ok: true as const, expense: existing, replayed: true };
      const expense = await repository.post({ id: randomUUID(), organizationId, actorUserId, idempotencyKey, ...input });
      return { ok: true as const, expense, replayed: false };
    }
  };
}
