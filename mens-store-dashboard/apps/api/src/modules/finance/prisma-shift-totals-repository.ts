import type { PrismaClient } from '@prisma/client';
import type { ShiftTotalsRepository } from './shift-totals.js';

export function createPrismaShiftTotalsRepository(prisma:PrismaClient):ShiftTotalsRepository{return {
  async listEntries(organizationId, openedAt, closedAt,actorUserId) {
    const entries = await prisma.treasuryTransaction.findMany({ where: { organizationId,actorUserId, occurredAt: { gte: openedAt, lt: closedAt } }, orderBy: { occurredAt: 'asc' } });
    return entries.map((entry) => ({ type: entry.type, paymentMethod: entry.paymentMethod, amount: entry.amount.toFixed(4) }));
  }
};}
