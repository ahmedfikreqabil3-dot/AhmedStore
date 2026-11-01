import { Prisma, type PrismaClient } from '@prisma/client';
import { can } from '../identity/authorization.js';
import { retryWriteConflict } from '../shared/retry-write-conflict.js';
import type { ExpenseRepository } from './expense-service.js';

export function createPrismaExpenseRepository(prisma:PrismaClient):ExpenseRepository{return {
  async findByIdempotencyKey(organizationId, idempotencyKey) {
    const expense = await prisma.expense.findUnique({ where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } } });
    return expense && { id: expense.id, organizationId: expense.organizationId, category: expense.category, description: expense.description, paymentMethod: expense.paymentMethod, amount: expense.amount.toFixed(4), occurredAt: expense.occurredAt };
  },
  async post(command) {
    return retryWriteConflict(()=>prisma.$transaction(async (transaction) => {
      const existing=await transaction.expense.findUnique({where:{organizationId_idempotencyKey:{organizationId:command.organizationId,idempotencyKey:command.idempotencyKey}}});if(existing)return {ok:true as const,replayed:true,expense:{id:existing.id,organizationId:existing.organizationId,category:existing.category,description:existing.description,paymentMethod:existing.paymentMethod,amount:existing.amount.toFixed(4),occurredAt:existing.occurredAt}};
      const actor=await transaction.user.findFirst({where:{id:command.actorUserId,organizationId:command.organizationId,active:true},select:{role:true}});if(!actor||!can(actor.role,'expenses:manage'))return {ok:false as const,reason:'ACTOR_UNAVAILABLE' as const};
      const expense = await transaction.expense.create({ data: command });
      await transaction.treasuryTransaction.create({ data: { id: crypto.randomUUID(), organizationId: command.organizationId, type: 'EXPENSE_PAYMENT', paymentMethod: command.paymentMethod, amount: command.amount, sourceType: 'Expense', sourceId: expense.id, actorUserId: command.actorUserId, occurredAt: command.occurredAt } });
      await transaction.auditEvent.create({ data: { organizationId: command.organizationId, actorUserId: command.actorUserId, action: 'EXPENSE_POSTED', entityType: 'Expense', entityId: expense.id } });
      return {ok:true as const,replayed:false,expense:{ id: expense.id, organizationId: expense.organizationId, category: expense.category, description: expense.description, paymentMethod: expense.paymentMethod, amount: expense.amount.toFixed(4), occurredAt: expense.occurredAt }};
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }
};}
