import type { Prisma } from '@prisma/client';

export class PostingPeriodError extends Error {
  readonly statusCode = 409;
  constructor(readonly reason: 'CLOSED_SHIFT' | 'SHIFT_TOTALS_CHANGED') { super(reason); }
}
export async function assertOpenPostingPeriod(tx: Prisma.TransactionClient, organizationId: string, userId: string, occurredAt: Date) {
  const closed = await tx.shift.findFirst({ where: { organizationId, userId, status: { in: ['CLOSED', 'REVIEWED'] }, openedAt: { lte: occurredAt }, closedAt: { gt: occurredAt } }, select: { id: true } });
  if (closed) throw new PostingPeriodError('CLOSED_SHIFT');
}
